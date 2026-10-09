'use client';

import { BookOpenText, Mic, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Chip, EmptyState, PageHeader, Select, Toolbar } from '@/components/ui';
import { JournalEntryCard } from '@/features/journal/entry-card';
import { canSeeEntry, canSeeMedia } from '@/features/journal/visibility';
import { useTable } from '@/lib/db/hooks';

export default function JournalPage() {
  const { currentUser, members } = useApp();
  const entries = useTable('journal_entries').rows;
  const media = useTable('media_assets').rows;
  const stops = useTable('trip_stops').rows;
  const [author, setAuthor] = useState('all');
  const [stopId, setStopId] = useState('all');
  const me = currentUser?.id ?? '';
  const visible = entries
    .filter((e) => canSeeEntry(e, me))
    .filter((e) => (author === 'all' ? true : e.author_user_id === author))
    .filter((e) => (stopId === 'all' ? true : e.stop_id === stopId))
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Tagebuch" subtitle="Unsere gemeinsamen Geschichten mit Fotos, Videos und Sprachmemos." actions={<Link href="/journal/new" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-deep px-5 font-semibold text-white"><Plus size={18} aria-hidden /> Neuer Eintrag</Link>} />
      <Toolbar>
        <Chip active={author === 'all'} onClick={() => setAuthor('all')}>Alle</Chip>
        {members.filter((m) => entries.some((e) => e.author_user_id === m.id)).map((m) => <Chip key={m.id} active={author === m.id} onClick={() => setAuthor(m.id)}>{m.display_name}</Chip>)}
        <Select aria-label="Nach Station filtern" value={stopId} onChange={(e) => setStopId(e.target.value)} className="w-auto min-w-44">
          <option value="all">Alle Stationen</option>
          {[...stops].sort((a, b) => a.sequence - b.sequence).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </Select>
      </Toolbar>
      {visible.length === 0 ? (
        <EmptyState icon={<BookOpenText />} title="Noch keine Einträge" text="Halte euer erstes Erlebnis fest: ein paar Sätze, ein Foto oder ein Sprachmemo." action={<Link href="/journal/new" className="font-semibold text-deep underline">Ersten Eintrag schreiben</Link>} />
      ) : (
        <div className="space-y-6">
          {visible.map((e) => <JournalEntryCard key={e.id} entry={e} stop={stops.find((s) => s.id === e.stop_id)} authorName={members.find((m) => m.id === e.author_user_id)?.display_name ?? 'Unbekannt'} media={media.filter((m) => m.journal_entry_id === e.id && canSeeMedia(m, me))} />)}
        </div>
      )}
      <Link href="/journal/new?record=1" className="fixed bottom-24 right-4 z-20 inline-flex size-14 items-center justify-center rounded-full bg-clay-strong text-white shadow-lg lg:hidden" aria-label="Sprachmemo aufnehmen"><Mic aria-hidden /></Link>
    </div>
  );
}
