/**
 * Android "Teilen mit …": the service worker receives the shared files (POST /share-target, see manifest `share_target`) and parks
 * them in this cache until the signed-in app imports them into the gallery. The files never leave the device and are removed
 * right after the import (and on sign-out).
 */
export const SHARE_INBOX_CACHE = 'nb-share-inbox';
export const SHARE_PATH = '/share-target';
const NAME_HEADER = 'X-File-Name';

function hasCacheApi(): boolean {
  return typeof caches !== 'undefined';
}

/** Files waiting in the inbox, oldest first. */
export async function readSharedFiles(): Promise<File[]> {
  if (!hasCacheApi()) return [];
  const cache = await caches.open(SHARE_INBOX_CACHE);
  const requests = [...(await cache.keys())].sort((a, b) => a.url.localeCompare(b.url));
  const files: File[] = [];
  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) continue;
    const name = decodeURIComponent(response.headers.get(NAME_HEADER) ?? 'geteilt');
    files.push(new File([await response.blob()], name, { type: response.headers.get('Content-Type') ?? 'application/octet-stream' }));
  }
  return files;
}

export async function clearSharedInbox(): Promise<void> {
  if (hasCacheApi()) await caches.delete(SHARE_INBOX_CACHE);
}
