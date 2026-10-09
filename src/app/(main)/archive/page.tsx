'use client';

import { Archive, Download, FileArchive, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Card, Chip, EmptyState, Input, Notice, PageHeader, Select, Toolbar } from '@/components/ui';
import { buildExport } from '@/features/archive/export';
import { searchArchive, type SearchHit } from '@/features/archive/search';
import { canSeeEntry } from '@/features/journal/visibility';
import { useTable } from '@/lib/db/hooks';
import { downloadBlob } from '@/lib/download';
import { formatDate } from '@/lib/formatting';

const KIND_LABEL: Record<SearchHit['kind'], string> = { journal: 'Tagebuch', sighting: 'Sichtung', stop: 'Station', tip: 'Hinweis', booking: 'Buchung' };
const HREF = (h: SearchHit) => (h.kind === 'stop' ? `/route/${h.id}` : h.kind === 'journal' ? '/journal' : h.kind === 'sighting' ? '/sightings' : h.kind === 'tip' ? '/guide' : '/bookings');

export default function ArchivePage() {
  const { role, members, currentUser } = useApp();
  const journal = useTable('journal_entries').rows;
  const sightings = useTable('wildlife_sightings').rows;
  const species = useTable('wildlife_species').rows;
  const stops = useTable('trip_stops').rows;
  const tips = useTable('travel_tips').rows;
  const bookings = useTable('bookings').rows;
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [stopId, setStopId] = useState('all');
  const [person, setPerson] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const me = currentUser?.id ?? '';
  const hits = searchArchive(query, { journal: journal.filter((e) => canSeeEntry(e, me)), sightings, species, stops, tips, bookings })
    .filter((h) => (kind === 'all' ? true : h.kind === kind))
    .filter((h) => (stopId === 'all' ? true : h.stopId === stopId))
    .filter((h) => (person === 'all' ? true : h.personId === person))
    .filter((h) => (!from ? true : (h.date ?? '') >= from))
    .filter((h) => (!to ? true : h.date !== null && h.date <= to));

  async function exportAll() {
    setExporting(true);
    const result = await buildExport(role);
    downloadBlob(result.zip, `reise-archiv-${new Date().toISOString().slice(0, 10)}.zip`);
    downloadBlob(new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' }), 'reise-daten.json');
    const m = result.manifest;
    setSummary(`${Object.keys(m.tables).length} Tabellen, ${m.media.filter((x) => x.status === 'included').length} Dateien enthalten, ${m.media.filter((x) => x.status === 'missing').length} fehlend. ${m.notes.join(' ')}`);
    setExporting(false);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Erinnerungsarchiv" subtitle="Durchsuche Texte, Sichtungen und Stationen und exportiere alles in portablen Formaten." actions={<Button onClick={() => void exportAll()} disabled={exporting}><FileArchive size={18} aria-hidden /> {exporting ? 'Exportiert …' : 'Export (ZIP + JSON)'}</Button>} />
      {summary && <Notice tone="ok" title="Export erstellt"><span data-testid="export-summary">{summary}</span></Notice>}
      <Card>
        <form role="search" onSubmit={(e) => e.preventDefault()} className="space-y-3">
          <div className="relative"><Search size={18} aria-hidden className="absolute left-3 top-3.5 text-muted" /><Input aria-label="Volltextsuche" placeholder="Suchen, z. B. Elefanten" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" /></div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Select aria-label="Nach Station" value={stopId} onChange={(e) => setStopId(e.target.value)}><option value="all">Alle Stationen</option>{[...stops].sort((a, b) => a.sequence - b.sequence).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</Select>
            <Select aria-label="Nach Person" value={person} onChange={(e) => setPerson(e.target.value)}><option value="all">Alle Personen</option>{members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}</Select>
            <Input aria-label="Von Datum" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input aria-label="Bis Datum" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Toolbar>{(['all', 'journal', 'sighting', 'stop', 'tip', 'booking'] as const).map((k) => <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'Alle Arten' : KIND_LABEL[k]}</Chip>)}</Toolbar>
        </form>
      </Card>
      <p className="text-sm text-slate" aria-live="polite" data-testid="hit-count">{hits.length} Treffer</p>
      {hits.length === 0 ? <EmptyState icon={<Archive />} title="Keine Treffer" text="Passe Suchbegriff oder Filter an." /> : (
        <ul className="space-y-3">{hits.map((h) => <li key={`${h.kind}-${h.id}`} className="rounded-lg border border-line bg-white p-4 shadow-card" data-testid="hit"><div className="mb-1 flex flex-wrap items-center gap-2"><Badge>{KIND_LABEL[h.kind]}</Badge>{h.date && <span className="text-sm text-slate">{formatDate(h.date)}</span>}</div><Link href={HREF(h)} className="font-bold text-deep underline">{h.title}</Link><p className="text-sm text-slate">{h.snippet}</p></li>)}</ul>
      )}
      <Notice tone="info"><Download size={14} aria-hidden className="mr-1 inline" />Der Export enthält JSON und CSV je Tabelle, verfügbare Medien und ein Manifest (manifest.json), das fehlende Medien benennt. Das PDF-Reisebuch ist für V2 vorgesehen.</Notice>
    </div>
  );
}
