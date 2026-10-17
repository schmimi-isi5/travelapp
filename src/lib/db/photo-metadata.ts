import { canEditOwnedRow } from '../domain/policy';
import { assignStop, type LocatedStop } from '../domain/photo-location';
import type { MediaAsset } from '../domain/schemas';
import { readExifMetadata } from '../media/exif';
import type { RemoteAdapter } from '../offline/remote';
import { getActor } from './actor';
import { loadBlob } from './blob-store';
import { getLocalDb } from './local';
import { nowIso } from './ids';
import { update } from './repo';

export interface MetadataScanSummary {
  /** Photos looked at in this run. */
  checked: number;
  /** Of those: with a position in their metadata. */
  withLocation: number;
  /** Photos that got a station now (from the position or the shooting date). */
  assigned: number;
  /** No position and no shooting date left in the file (shrunk on upload or stripped by the phone). */
  withoutMetadata: number;
  /** Could not be read now (file not on this device and no network); tried again next time. */
  failed: number;
}

const isScannable = (m: MediaAsset) => m.kind === 'photo' && m.exif_read_at === null && /jpe?g/i.test(m.mime_type);

/** Photos of the current person that were stored without reading their metadata (everything uploaded before this was possible). */
export async function pendingMetadataPhotos(): Promise<MediaAsset[]> {
  const actor = getActor();
  const rows = (await getLocalDb().entity('media_assets').toArray()) as unknown as MediaAsset[];
  return rows.filter((m) => isScannable(m) && canEditOwnedRow(actor.role, m.uploaded_by, actor.userId));
}

/**
 * Reads position, shooting time and camera from photos that were uploaded earlier, from the stored file (on this device, else from the
 * storage when online), and files photos without a station at the matching one. Stations a person or a journal entry set are kept.
 * Only photos the person may edit are touched. A file that holds no metadata any more is marked as read and not looked at again.
 */
export async function scanExistingPhotos(remote: Pick<RemoteAdapter, 'download'>, onProgress?: (done: number, total: number) => void): Promise<MetadataScanSummary> {
  const photos = await pendingMetadataPhotos();
  const stops = (await getLocalDb().entity('trip_stops').toArray()) as unknown as LocatedStop[];
  const summary: MetadataScanSummary = { checked: 0, withLocation: 0, assigned: 0, withoutMetadata: 0, failed: 0 };
  let done = 0;
  for (const photo of photos) {
    try {
      const blob = (await loadBlob(getLocalDb(), photo.id))?.blob ?? (await remote.download(photo.storage_path, 'media'));
      if (!blob) {
        summary.failed += 1;
      } else {
        const meta = readExifMetadata(await blob.arrayBuffer());
        const hasLocation = meta.latitude !== null && meta.longitude !== null;
        const patch: Partial<MediaAsset> = { exif_read_at: nowIso() };
        if (hasLocation) Object.assign(patch, { latitude: meta.latitude, longitude: meta.longitude, altitude_m: meta.altitudeM });
        if (meta.camera) patch.camera = meta.camera;
        if (meta.capturedAt) patch.captured_at = meta.capturedAt;
        if (!photo.stop_id) {
          const found = assignStop({ latitude: meta.latitude, longitude: meta.longitude, capturedAt: meta.capturedAt }, stops);
          if (found) {
            patch.stop_id = found.stopId;
            patch.stop_source = found.source;
            summary.assigned += 1;
          }
        }
        await update('media_assets', photo.id, patch);
        summary.checked += 1;
        if (hasLocation) summary.withLocation += 1;
        if (!hasLocation && !meta.capturedAt) summary.withoutMetadata += 1;
      }
    } catch {
      summary.failed += 1;
    }
    done += 1;
    onProgress?.(done, photos.length);
  }
  return summary;
}
