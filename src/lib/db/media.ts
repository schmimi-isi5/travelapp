import { getActor } from './actor';
import { newId, nowIso } from './ids';
import { loadBlob, storeBlob } from './blob-store';
import { getLocalDb } from './local';
import { create } from './repo';
import { isOnline } from '../offline/network';
import type { MediaAsset } from '../domain/schemas';
import type { RemoteAdapter } from '../offline/remote';

export const MEDIA_RULES = {
  photo: { mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/avif'], maxBytes: 25 * 1024 * 1024 },
  video: { mimes: ['video/mp4', 'video/webm', 'video/quicktime'], maxBytes: 150 * 1024 * 1024 },
  audio: { mimes: ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a'], maxBytes: 40 * 1024 * 1024 },
} as const;

/** Total size of files waiting for upload while offline. Prevents silently filling the device. */
export const OFFLINE_QUEUE_LIMIT_BYTES = 200 * 1024 * 1024;

export type MediaKind = keyof typeof MEDIA_RULES;

export class MediaError extends Error {
  constructor(
    readonly code: 'TYPE_NOT_ALLOWED' | 'TOO_LARGE' | 'QUEUE_FULL' | 'EMPTY' | 'STORE_FAILED',
    message: string,
  ) {
    super(message);
  }
}

/** Human-readable reason for a failed local write; quota problems are the common case on phones. */
function storeFailureMessage(fileName: string, cause: unknown): string {
  const name = cause instanceof Error ? cause.name : '';
  if (name === 'QuotaExceededError') return `„${fileName}“ passt nicht mehr in den Speicher dieses Browsers. Bitte Platz schaffen oder erst synchronisieren.`;
  const detail = cause instanceof Error && cause.message ? ` (${name || 'Fehler'}: ${cause.message})` : '';
  return `„${fileName}“ konnte nicht auf diesem Gerät gespeichert werden${detail}.`;
}

export function detectKind(mime: string): MediaKind | null {
  const base = mime.split(';')[0]?.trim() ?? '';
  for (const kind of Object.keys(MEDIA_RULES) as MediaKind[]) {
    if ((MEDIA_RULES[kind].mimes as readonly string[]).includes(base)) return kind;
  }
  return null;
}

export function validateFile(file: { name: string; type: string; size: number }): MediaKind {
  if (file.size === 0) throw new MediaError('EMPTY', `„${file.name}“ ist leer.`);
  const kind = detectKind(file.type);
  if (!kind) throw new MediaError('TYPE_NOT_ALLOWED', `„${file.name}“: Dateityp ${file.type || 'unbekannt'} ist nicht erlaubt (Foto, Video oder Audio).`);
  const max = MEDIA_RULES[kind].maxBytes;
  if (file.size > max) throw new MediaError('TOO_LARGE', `„${file.name}“ ist ${(file.size / 1048576).toFixed(1)} MB groß; erlaubt sind ${(max / 1048576).toFixed(0)} MB.`);
  return kind;
}

export function safeFileName(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(-80) || 'datei';
}

/** Reads DateTimeOriginal from a JPEG's EXIF block. Deliberately ignores GPS tags (privacy by default). */
export function readExifCaptureDate(buffer: ArrayBuffer): string | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) return parseTiffDate(view, offset + 10);
    if ((marker & 0xff00) !== 0xff00) break;
    offset += 2 + size;
  }
  return null;
}

function parseTiffDate(view: DataView, tiff: number): string | null {
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  const readAscii = (o: number, len: number) => {
    let s = '';
    for (let i = 0; i < len - 1; i++) s += String.fromCharCode(view.getUint8(o + i));
    return s;
  };
  const findTag = (ifd: number, tag: number): { type: number; count: number; valueOffset: number } | null => {
    if (ifd + 2 > view.byteLength) return null;
    const entries = u16(ifd);
    for (let i = 0; i < entries; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > view.byteLength) return null;
      if (u16(entry) === tag) return { type: u16(entry + 2), count: u32(entry + 4), valueOffset: entry + 8 };
    }
    return null;
  };
  const ifd0 = tiff + u32(tiff + 4);
  const exifPointer = findTag(ifd0, 0x8769);
  if (!exifPointer) return null;
  const exifIfd = tiff + u32(exifPointer.valueOffset);
  const dateTag = findTag(exifIfd, 0x9003);
  if (!dateTag || dateTag.count < 19) return null;
  const text = readAscii(tiff + u32(dateTag.valueOffset), dateTag.count);
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text);
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z` : null;
}

export async function queuedBytes(): Promise<number> {
  const queued = await getLocalDb().entity('media_assets').filter((r) => r.upload_state === 'queued').toArray();
  return queued.reduce((sum, r) => sum + Number(r.size_bytes ?? 0), 0);
}

export interface AddMediaOptions {
  file: File | Blob & { name?: string };
  familyId: string;
  tripId: string;
  stopId?: string | null;
  journalEntryId?: string | null;
  caption?: string;
  album?: string | null;
  visibility?: 'family' | 'private';
  /** Publish a photo to follower links (adults only, never together with visibility 'private'). */
  sharedWithFollowers?: boolean;
  readExif?: boolean;
  onProgress?: (percent: number) => void;
}

/**
 * Validates and stores a file locally, then marks it `queued`. The sync engine uploads queued files when online;
 * while offline they stay visibly queued, bounded by OFFLINE_QUEUE_LIMIT_BYTES.
 */
export async function addMedia(options: AddMediaOptions): Promise<MediaAsset> {
  const { file, onProgress } = options;
  const fileName = (file as File).name ?? `aufnahme-${Date.now()}`;
  const kind = validateFile({ name: fileName, type: file.type, size: file.size });
  onProgress?.(10);
  if (!isOnline() && (await queuedBytes()) + file.size > OFFLINE_QUEUE_LIMIT_BYTES) {
    throw new MediaError('QUEUE_FULL', `Offline-Warteschlange voll (Limit ${OFFLINE_QUEUE_LIMIT_BYTES / 1048576} MB). Bitte erst synchronisieren.`);
  }
  let capturedAt: string | null = null;
  if (options.readExif && file.type === 'image/jpeg') {
    capturedAt = readExifCaptureDate(await file.arrayBuffer());
  }
  onProgress?.(40);
  const id = newId();
  const storagePath = `${options.familyId}/${options.tripId}/${id}-${safeFileName(fileName)}`;
  try {
    await storeBlob(getLocalDb(), id, file, fileName);
  } catch (cause) {
    throw new MediaError('STORE_FAILED', storeFailureMessage(fileName, cause));
  }
  onProgress?.(80);
  const actor = getActor();
  let asset: MediaAsset;
  try {
    asset = await create('media_assets', {
      id,
      family_id: options.familyId,
      trip_id: options.tripId,
      stop_id: options.stopId ?? null,
      journal_entry_id: options.journalEntryId ?? null,
      uploaded_by: actor.userId,
      kind,
      storage_path: storagePath,
      original_name: fileName,
      captured_at: capturedAt ?? nowIso(),
      mime_type: file.type,
      size_bytes: file.size,
      caption: options.caption ?? '',
      album: options.album ?? null,
      visibility: options.visibility ?? 'family',
      shared_with_followers: Boolean(options.sharedWithFollowers) && kind === 'photo' && (options.visibility ?? 'family') === 'family',
      upload_state: 'queued',
    });
  } catch (cause) {
    await getLocalDb().blobs.delete(id); // no orphaned bytes when the row could not be written
    throw new MediaError('STORE_FAILED', storeFailureMessage(fileName, cause));
  }
  onProgress?.(100);
  return asset;
}

const urlCache = new Map<string, string>();
const SIGNED_URL_TTL_SECONDS = 300;

/** Local object URL for media stored on this device (uploaded here or cached). */
export async function getLocalMediaUrl(assetId: string): Promise<string | null> {
  const cached = urlCache.get(assetId);
  if (cached) return cached;
  const record = await loadBlob(getLocalDb(), assetId);
  if (!record) return null;
  const url = URL.createObjectURL(record.blob);
  urlCache.set(assetId, url);
  return url;
}

/**
 * URL for displaying an asset: the local copy if present, otherwise a short-lived signed URL from the storage backend
 * (never a public URL). Returns null offline or when the object is unavailable.
 */
export async function resolveMediaUrl(asset: { id: string; storage_path: string }, remote?: Pick<RemoteAdapter, 'signedUrl'>): Promise<string | null> {
  const local = await getLocalMediaUrl(asset.id);
  if (local || !remote) return local;
  return remote.signedUrl(asset.storage_path, 'media', SIGNED_URL_TTL_SECONDS);
}
