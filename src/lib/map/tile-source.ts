import type { RangeResponse, Source } from 'pmtiles';

export const TILES_URL = '/api/map/tiles';
const CACHE_NAME = 'nb-map-v1';

export type OfflineMapState = 'unsupported' | 'not_saved' | 'saved';

function hasCacheApi(): boolean {
  return typeof caches !== 'undefined';
}

let cachedBlob: Promise<Blob | null> | null = null;

function loadCachedBlob(): Promise<Blob | null> {
  if (!cachedBlob) {
    cachedBlob = (async () => {
      if (!hasCacheApi()) return null;
      const hit = await (await caches.open(CACHE_NAME)).match(TILES_URL);
      return hit ? hit.blob() : null;
    })().catch(() => null);
  }
  return cachedBlob;
}

export async function getOfflineMapState(): Promise<OfflineMapState> {
  if (!hasCacheApi()) return 'unsupported';
  return (await loadCachedBlob()) ? 'saved' : 'not_saved';
}

/** True when tiles can be read, from the saved copy or from the server. */
export async function areTilesAvailable(): Promise<boolean> {
  if ((await loadCachedBlob()) !== null) return true;
  try {
    const res = await fetch(TILES_URL, { headers: { Range: 'bytes=0-0' } });
    return res.ok;
  } catch {
    return false;
  }
}

/** Downloads the whole archive into the Cache API so the map works without network. */
export async function saveMapOffline(onProgress: (loadedBytes: number, totalBytes: number | null) => void, signal?: AbortSignal): Promise<void> {
  if (!hasCacheApi()) throw new Error('Der Browser unterstützt keinen Offline-Speicher für Karten.');
  const response = await fetch(TILES_URL, { signal });
  if (!response.ok || !response.body) throw new Error(`Kartendaten konnten nicht geladen werden (HTTP ${response.status}).`);
  const total = Number(response.headers.get('content-length')) || null;
  const reader = response.body.getReader();
  let loaded = 0;
  const counted = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      loaded += value.byteLength;
      onProgress(loaded, total);
      controller.enqueue(value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  const cache = await caches.open(CACHE_NAME);
  try {
    await cache.put(TILES_URL, new Response(counted, { headers: { 'content-type': 'application/octet-stream' } }));
  } catch (error) {
    await cache.delete(TILES_URL);
    throw error;
  }
  cachedBlob = null;
  // Ask the browser not to evict the saved map under storage pressure (best effort).
  await navigator.storage?.persist?.().catch(() => false);
}

export async function removeOfflineMap(): Promise<void> {
  if (hasCacheApi()) await caches.delete(CACHE_NAME);
  cachedBlob = null;
}

/** PMTiles byte source: the saved copy when present, range requests to the server otherwise. */
export class TripTileSource implements Source {
  getKey(): string {
    return 'nb-trip-tiles';
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
    const saved = await loadCachedBlob();
    if (saved) return { data: await saved.slice(offset, offset + length).arrayBuffer() };
    const res = await fetch(TILES_URL, { headers: { Range: `bytes=${offset}-${offset + length - 1}` }, signal });
    if (res.status !== 206 && res.status !== 200) throw new Error(`Kachel-Abruf fehlgeschlagen (HTTP ${res.status}).`);
    const data = await res.arrayBuffer();
    // A server ignoring Range answers 200 with the full archive; cut out the requested bytes.
    return { data: res.status === 200 ? data.slice(offset, offset + length) : data };
  }
}
