import type { FollowerView } from '@/lib/follow/view';

export type FollowerPhotoData = FollowerView['photos'][number];

/** Widths the server serves (see FOLLOWER_IMAGE_WIDTHS): 480/960 for the grid, 1600 full screen, 2400 for saving. */
export type PhotoWidth = 480 | 960 | 1600 | 2400;

export const photoUrl = (token: string, id: string, width: PhotoWidth, download = false): string =>
  `/api/follow/${encodeURIComponent(token)}/media/${id}?w=${width}${download ? '&d=1' : ''}`;

export const photoSrcSet = (token: string, id: string): string => ([480, 960, 1600] as const).map((w) => `${photoUrl(token, id, w)} ${w}w`).join(', ');

/** Name for a saved photo (the server sends the same kind of name in its download header). */
export function photoFileName(photo: Pick<FollowerPhotoData, 'id' | 'captured_at'>): string {
  const day = photo.captured_at && /^\d{4}-\d{2}-\d{2}/.test(photo.captured_at) ? `${photo.captured_at.slice(0, 10)}-` : '';
  return `Namibia-Botswana-${day}${photo.id.slice(0, 8)}.jpg`;
}

/** Whether the browser can hand a file to the system share sheet (the way to put a photo into the phone's gallery). */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array(1)], 'x.jpg', { type: 'image/jpeg' })] });
  } catch {
    return false;
  }
}

/** Items that were not there at the last visit. A first visit (nothing stored) flags nothing: everything would be "new". */
export function findNewIds(previous: readonly string[] | null, current: readonly string[]): string[] {
  if (previous === null) return [];
  const seen = new Set(previous);
  return current.filter((id) => !seen.has(id));
}

const storageKey = (token: string) => `nb-follow-seen:${token.slice(0, 10)}`;

export function readSeenIds(token: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(storageKey(token));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : null;
  } catch {
    return null;
  }
}

export function writeSeenIds(token: string, ids: readonly string[]): void {
  try {
    window.localStorage.setItem(storageKey(token), JSON.stringify(ids.slice(0, 2000)));
  } catch {
    // storage may be blocked (private window): then "new" simply is not shown
  }
}
