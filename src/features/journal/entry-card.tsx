'use client';

import { Lock, Pencil, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Notice } from '@/components/ui';
import { MediaBody } from '@/features/media/media-tile';
import { requestAi } from '@/lib/ai/client';
import { update } from '@/lib/db/repo';
import { canEditOwnedRow } from '@/lib/domain/policy';
import type { JournalEntry, MediaAsset, TripStop } from '@/lib/domain/schemas';
import { formatDate } from '@/lib/formatting';

export function JournalEntryCard({ entry, media, stop, authorName }: { entry: JournalEntry; media: MediaAsset[]; stop?: TripStop; authorName: string }) {
  const { currentUser, role } = useApp();
  const [busy, setBusy] = useState(false);
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
          {entry.visibility === 'private' && <Badge><Lock size={12} aria-hidden /> privat</Badge>}
          {entry.is_demo && <Badge tone="demo">Demo</Badge>}
          {entry.location && <Badge>Standort gespeichert</Badge>}
        </div>
        <h3 className="text-lg font-bold">{entry.title}</h3>
        {entry.body && <p className="mt-1 whitespace-pre-line text-slate">{entry.body}</p>}
        {audio.map((a) => <div key={a.id} className="mt-3 h-20 overflow-hidden rounded-md"><MediaBody asset={a} controls /></div>)}
        {media.some((m) => m.upload_state === 'queued') && <p className="mt-2 text-sm text-warn" data-testid="queued-media">Medien warten auf Upload.</p>}
        {entry.summary && (
          <div className="mt-3 rounded-md bg-sand-50 p-3 text-sm" data-testid="summary">
            <Badge tone={entry.summary.is_ai ? 'ai' : 'neutral'}>{entry.summary.is_ai ? `KI-Entwurf (${entry.summary.provider})` : 'Regelbasierter Auszug, keine KI'}</Badge>
            <p className="mt-1 whitespace-pre-line">{entry.summary.text}</p>
          </div>
        )}
        {note && <div className="mt-2"><Notice tone="info">{note}</Notice></div>}
        {editable && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/journal/new?id=${entry.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm font-semibold text-deep"><Pencil size={14} aria-hidden /> Bearbeiten</Link>
            <Button size="sm" variant="secondary" disabled={busy || !entry.body} onClick={() => void summarize()}><Sparkles size={14} aria-hidden /> Zusammenfassen</Button>
          </div>
        )}
      </div>
    </article>
  );
}
