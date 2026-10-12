import { getLocalDb } from '@/lib/db/local';
import { remove } from '@/lib/db/repo';
import { canEditOwnedRow } from '@/lib/domain/policy';
import type { JournalEntry, MediaAsset, Role } from '@/lib/domain/schemas';

export interface DeleteEntryResult {
  /** Files of the entry that were deleted with it. */
  mediaDeleted: number;
  /** Files that stayed because the person may not delete them. */
  mediaKept: number;
}

/**
 * Deletes a journal entry. With `withMedia` its photos, videos and voice memos (and their transcripts) go too, as far as the
 * person may delete them; otherwise they stay in the gallery. Everything runs through the repository, so it syncs and is
 * checked against the role like any other change.
 */
export async function deleteJournalEntry(entry: JournalEntry, media: readonly MediaAsset[], withMedia: boolean, actor: { userId: string; role: Role }): Promise<DeleteEntryResult> {
  const db = getLocalDb();
  let mediaDeleted = 0;
  let mediaKept = 0;
  if (withMedia) {
    for (const asset of media) {
      if (!canEditOwnedRow(actor.role, asset.uploaded_by, actor.userId)) {
        mediaKept += 1;
        continue;
      }
      // a transcript belongs to its recording; the server deletes it with the media row, the device has no such cascade
      for (const transcript of (await db.entity('voice_transcripts').toArray()).filter((t) => t.media_id === asset.id)) await remove('voice_transcripts', transcript.id);
      await remove('media_assets', asset.id);
      await db.blobs.delete(asset.id);
      mediaDeleted += 1;
    }
  }
  await remove('journal_entries', entry.id);
  return { mediaDeleted, mediaKept };
}
