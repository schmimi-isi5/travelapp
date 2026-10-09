import type { JournalEntry, MediaAsset } from '@/lib/domain/schemas';

/** Private entries/media and drafts are only visible to their author (mirrors RLS). */
export function canSeeEntry(entry: JournalEntry, userId: string): boolean {
  if (entry.author_user_id === userId) return true;
  return entry.visibility === 'family' && entry.status === 'published';
}

export function canSeeMedia(asset: MediaAsset, userId: string): boolean {
  return asset.visibility === 'family' || asset.uploaded_by === userId;
}
