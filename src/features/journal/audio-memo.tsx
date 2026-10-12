'use client';

import { useApp } from '@/components/app-provider';
import { MediaBody } from '@/features/media/media-tile';
import { loadBlob } from '@/lib/db/blob-store';
import { useTable } from '@/lib/db/hooks';
import { getLocalDb } from '@/lib/db/local';
import { create, update } from '@/lib/db/repo';
import type { JournalEntry, MediaAsset } from '@/lib/domain/schemas';
import { TranscribePanel } from './transcribe-panel';

/** A voice memo of an entry with its written transcript (if any) and, for people who may edit, the way to create one. */
export function AudioMemo({ asset, entry, canEdit }: { asset: MediaAsset; entry: JournalEntry; canEdit: boolean }) {
  const { remote, online } = useApp();
  const transcripts = useTable('voice_transcripts').rows.filter((t) => t.media_id === asset.id);
  const saved = transcripts.find((t) => t.status === 'done' && t.body.trim());

  /** The recording: the copy on this device, else the signed storage URL (the only remote source the CSP allows). */
  async function getAudio(): Promise<Blob | null> {
    const local = await loadBlob(getLocalDb(), asset.id);
    if (local) return local.blob;
    if (!online) return null;
    const url = await remote.signedUrl(asset.storage_path, 'media', 300);
    if (!url) return null;
    const res = await fetch(url).catch(() => null);
    return res?.ok ? res.blob() : null;
  }

  async function saveTranscript(body: string, provider: string) {
    const existing = transcripts[0];
    if (existing) await update('voice_transcripts', existing.id, { body, provider, status: 'done' });
    else await create('voice_transcripts', { media_id: asset.id, provider, body, language: 'de', status: 'done' });
  }

  async function takeIntoEntry(text: string, provider: string) {
    await saveTranscript(text, provider);
    const current = entry.body.trim();
    if (!current.includes(text)) await update('journal_entries', entry.id, { body: current ? `${current}\n\n${text}` : text });
  }

  return (
    <div className="mt-3" data-testid="audio-memo">
      <div className="h-20 overflow-hidden rounded-md"><MediaBody asset={asset} controls /></div>
      {saved && !canEdit && <p className="mt-2 whitespace-pre-line rounded-md bg-sand-50 p-3 text-sm" data-testid="saved-transcript">{saved.body}</p>}
      {canEdit && (
        <TranscribePanel
          key={saved?.id ?? 'none'}
          getAudio={getAudio}
          filename={asset.original_name ?? 'sprachmemo.webm'}
          initialText={saved?.body ?? ''}
          initialProvider={saved?.provider ?? ''}
          onSave={(text, provider) => void saveTranscript(text, provider)}
          onUse={(text, provider) => void takeIntoEntry(text, provider)}
        />
      )}
    </div>
  );
}
