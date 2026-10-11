import { getSupabase } from '@/lib/supabase/client';
import { imageUrl, type DestinationImage } from './places';

const CACHE_KEY = 'nb-destination-library-v1';
const REFRESH_MS = 10 * 60_000;
const PREFETCH_LIMIT = 80;
const COLUMNS =
  'id, place_key, place_label, country, latitude, longitude, radius_km, role, variants, width, height, alt_text, source_provider, source_url, photographer, license_type, license_url, attribution_text, location_verified';

export function readCachedLibrary(): DestinationImage[] {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as DestinationImage[]) : [];
  } catch {
    return [];
  }
}

function writeCachedLibrary(rows: DestinationImage[]): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(rows));
  } catch {
    /* storage unavailable: the library is then fetched again next time */
  }
}

let lastLoad = 0;
let inflight: Promise<DestinationImage[] | null> | null = null;

/** Approved library rows (row-level security hides the rest). At most one request per interval; null when nothing was loaded. */
export function refreshLibrary(): Promise<DestinationImage[] | null> {
  if (inflight) return inflight;
  if (Date.now() - lastLoad < REFRESH_MS) return Promise.resolve(null);
  inflight = (async () => {
    const { data, error } = await getSupabase().from('destination_images').select(COLUMNS).limit(500);
    if (error) return null;
    lastLoad = Date.now();
    const rows = (data ?? []) as DestinationImage[];
    writeCachedLibrary(rows);
    return rows;
  })()
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Warms the offline cache: the service worker keeps every library image it sees, so requesting the variants that matter
 * (hero for this screen size, station covers, gallery thumbnails) once while online makes them available without network.
 */
export function prefetchLibraryImages(rows: readonly DestinationImage[]): void {
  const width = window.innerWidth;
  const heroKey = width >= 1100 ? 'desktop' : width >= 700 ? 'tablet' : 'mobile';
  const urls: string[] = [];
  for (const image of rows) {
    const paths = image.role === 'hero' ? [image.variants[heroKey]] : image.role === 'card' ? [image.variants.card, image.variants.thumb] : [image.variants.thumb];
    for (const path of paths) if (path) urls.push(imageUrl(path));
  }
  const queue = urls.slice(0, PREFETCH_LIMIT);
  const run = async () => {
    for (const url of queue) {
      try {
        await fetch(url);
      } catch {
        return; // offline or server unreachable: try again at the next start
      }
    }
  };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => void run());
  else globalThis.setTimeout(() => void run(), 2000);
}
