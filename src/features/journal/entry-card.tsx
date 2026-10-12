'use client';

import { Lock, Pencil, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Dialog, Notice } from '@/components/ui';
import { FollowerShareToggle } from '@/features/follow/share-toggle';
import { AudioMemo } from '@/features/journal/audio-memo';
import { deleteJournalEntry } from '@/features/journal/delete-entry';
import { MediaBody } from '@/features/media/media-tile';
import { requestAi } from '@/lib/ai/client';
import { update } from '@/lib/db/repo';
import { canEditOwnedRow } from '@/lib/domain/policy';
import type { JournalEntry, MediaAsset, TripStop } from '@/lib/domain/schemas';
import { formatDate } from '@/lib/formatting';

export function JournalEntryCard({ entry, media, stop, authorName }: { entry: JournalEntry; media: MediaAsset[]; stop?: TripStop; authorName: string }) {
  const { currentUser, role } = useApp();
  const [busy, setBusy] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [withMedia, setWithMedia] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const editable = currentUser ? canEditOwnedRow(role, entry.author_user_id, currentUser.id) : false;
  const visual = media.filter((m) => m.kind !== 'audio');
  const audio = media.filter((m) => m.kind === 'audio');

  async function summarize() {
    setBusy(true);
    const { result, fallbackReason } = await requestAi({ task: 'summarize_journal', input: { entries: [{ title: entry.title, body: entry.body }] } });
    await update('journal_entries', entry.id, { summary: { text: result.text, provider: result.provider, generated_at: result.generated_at, is_ai: result.origin === 'ai_generated' } });
    setNote(fallbackReason);
    setBusy(false);
  }

  async function confirmDelete() {
    if (!currentUser) return;
    setBusy(true);
    try {
      await deleteJournalEntry(entry, media, withMedia, { userId: currentUser.id, role });
    } finally {
      setBusy(false);
      setIsDeleting(false);
    }
  }

  async function setShared(next: boolean) {
    await update('journal_entries', entry.id, { shared_with_followers: next });
    for (const photo of media.filter((m) => m.kind === 'photo' && m.visibility === 'family' && m.shared_with_followers !== next)) {
      await update('media_assets', photo.id, { shared_with_followers: next });
    }
  }
  const shareBlocked = entry.visibility === 'private' ? 'Private Einträge lassen sich nicht freigeben.' : entry.status === 'draft' ? 'Entwürfe lassen sich nicht freigeben.' : null;

  return (
    <article className="overflow-hidden rounded-lg border border-line bg-white shadow-card" data-testid="journal-card">
      {visual.length > 0 && (
        <div className={`grid h-56 gap-0.5 ${visual.length > 1 ? 'grid-cols-2' : ''}`}>
          {visual.slice(0, 2).map((m) => <div key={m.id} className="overflow-hidden"><MediaBody asset={m} controls /></div>)}
        </div>
      )}
      <div className="p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-slate">
          <span className="font-semibold">{authorName}</span>
          <span aria-hidden>·</span>
          <time dateTime={entry.entry_date}>{formatDate(entry.entry_date)}</time>
          {stop && <><span aria-hidden>·</span><span>{stop.title}</span></>}
          {entry.status === 'draft' && <Badge tone="warn">Entwurf</Badge>}
          {entry.shared_with_followers && <Badge tone="info">Für Follower freigegeben</Badge>}
          {entry.visibility === 'private' && <Badge><Lock size={12} aria-hidden /> privat</Badge>}
          {entry.is_demo && <Badge tone="demo">Demo</Badge>}
          {entry.location && <Badge>Standort gespeichert</Badge>}
        </div>
        <h3 className="text-lg font-bold">{entry.title}</h3>
        {entry.body && <p className="mt-1 whitespace-pre-line text-slate">{entry.body}</p>}
        {audio.map((a) => <AudioMemo key={a.id} asset={a} entry={entry} canEdit={editable} />)}
        {media.some((m) => m.upload_state === 'queued') && <p className="mt-2 text-sm text-warn" data-testid="queued-media">Medien warten auf Upload.</p>}
        {entry.summary && (
          <div className="mt-3 rounded-md bg-sand-50 p-3 text-sm" data-testid="summary">
            <Badge tone={entry.summary.is_ai ? 'ai' : 'neutral'}>{entry.summary.is_ai ? `KI-Entwurf (${entry.summary.provider})` : 'Regelbasierter Auszug, keine KI'}</Badge>
            <p className="mt-1 whitespace-pre-line">{entry.summary.text}</p>
          </div>
        )}
        {note && <div className="mt-2"><Notice tone="info">{note}</Notice></div>}
        <FollowerShareToggle checked={entry.shared_with_followers} label="Bericht und Fotos für Follower freigeben" blockedReason={shareBlocked} onChange={setShared} />
        {editable && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/journal/new?id=${entry.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm font-semibold text-deep"><Pencil size={14} aria-hidden /> Bearbeiten</Link>
            <Button size="sm" variant="secondary" disabled={busy || !entry.body} onClick={() => void summarize()}><Sparkles size={14} aria-hidden /> Zusammenfassen</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setWithMedia(false); setIsDeleting(true); }}><Trash2 size={14} aria-hidden /> Löschen</Button>
          </div>
        )}
        <Dialog open={isDeleting} onClose={() => setIsDeleting(false)} title="Eintrag löschen?">
          <p className="text-slate">„{entry.title}“ wird unwiderruflich gelöscht{entry.shared_with_followers ? ' und ist für Follower nicht mehr sichtbar' : ''}.</p>
          {media.length > 0 && (
            <fieldset className="mt-4 space-y-2">
              <legend className="mb-1 font-semibold">Was soll mit den {media.length} Fotos, Videos und Aufnahmen des Eintrags geschehen?</legend>
              <label className="flex items-start gap-2"><input type="radio" name={`delete-media-${entry.id}`} className="mt-1 size-4" checked={!withMedia} onChange={() => setWithMedia(false)} /><span>Nur den Text löschen, die Dateien bleiben in der Galerie.</span></label>
              <label className="flex items-start gap-2"><input type="radio" name={`delete-media-${entry.id}`} className="mt-1 size-4" checked={withMedia} onChange={() => setWithMedia(true)} /><span>Eintrag mit allen Dateien und Abschriften löschen.</span></label>
            </fieldset>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsDeleting(false)}>Abbrechen</Button>
            <Button variant="danger" disabled={busy} onClick={() => void confirmDelete()}>Endgültig löschen</Button>
          </div>
        </Dialog>
      </div>
    </article>
  );
}
