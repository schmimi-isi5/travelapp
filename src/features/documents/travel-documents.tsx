'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { CloudDownload, FileText } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Card } from '@/components/ui';
import { cacheDocumentsOffline, DocumentError, openDocument } from '@/lib/db/documents';
import { getLocalDb } from '@/lib/db/local';
import { downloadBlob } from '@/lib/download';
import { travelDocumentItems } from '@/lib/domain/travel-documents';
import type { Booking, DocumentRecord, Stay } from '@/lib/domain/schemas';
import { formatDate } from '@/lib/formatting';
import { documentKindLabel } from '@/lib/labels';

/** "Unterlagen für unterwegs": boarding passes, contracts and confirmations in one list, with a button to keep them on this phone. */
export function TravelDocuments({ docs, bookings, stays }: { docs: readonly DocumentRecord[]; bookings: readonly Booking[]; stays: readonly Stay[] }) {
  const { remote } = useApp();
  const items = travelDocumentItems(docs, bookings, stays);
  const localIds = useLiveQuery(async () => new Set(await getLocalDb().blobs.toCollection().primaryKeys()), []);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (items.length === 0) return null;
  const missing = items.filter((i) => !localIds?.has(i.doc.id)).length;

  async function open(doc: DocumentRecord) {
    try {
      setError(null);
      downloadBlob(await openDocument(doc, undefined, remote), doc.original_name);
    } catch (err) {
      setError(err instanceof DocumentError ? err.message : 'Die Datei konnte nicht geöffnet werden.');
    }
  }

  async function keepOffline() {
    setNote(null);
    setError(null);
    setProgress({ done: 0, total: items.length });
    const result = await cacheDocumentsOffline(items.map((i) => i.doc), remote, (done, total) => setProgress({ done, total }));
    setProgress(null);
    if (result.failed > 0) setError(`${result.failed} ${result.failed === 1 ? 'Datei konnte' : 'Dateien konnten'} nicht geladen werden (kein Netz?). Bitte mit Netz noch einmal versuchen.`);
    else setNote(result.cached === 0 ? 'Alle Unterlagen waren schon auf diesem Handy.' : `${result.cached} ${result.cached === 1 ? 'Unterlage ist' : 'Unterlagen sind'} jetzt auch ohne Netz auf diesem Handy.`);
  }

  return (
    <Card data-testid="travel-documents" className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Unterlagen für unterwegs</h2>
          <p className="text-sm text-slate" data-testid="travel-documents-status">
            {items.length} {items.length === 1 ? 'Unterlage' : 'Unterlagen'} · {missing === 0 ? 'alle ohne Netz auf diesem Handy' : `${missing} noch nicht auf diesem Handy`}
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={progress !== null || missing === 0} onClick={() => void keepOffline()}>
          <CloudDownload size={14} aria-hidden /> {progress ? `Wird geladen ${progress.done} von ${progress.total}` : 'Für unterwegs auf dieses Handy laden'}
        </Button>
      </div>
      <ul className="mt-3 divide-y divide-line" aria-label="Unterlagen für unterwegs">
        {items.map(({ doc, context, date }) => (
          <li key={doc.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm" data-testid="travel-document">
            <FileText size={16} aria-hidden className="shrink-0 text-slate" />
            <button type="button" className="min-w-0 flex-1 text-left font-semibold text-deep underline" onClick={() => void open(doc)}>{doc.title ?? doc.original_name}</button>
            <Badge>{documentKindLabel[doc.classification]}</Badge>
            {context && <span className="text-slate">{context}</span>}
            {date && <span className="text-muted">{formatDate(date)}</span>}
            {localIds?.has(doc.id) && <Badge tone="ok">ohne Netz</Badge>}
          </li>
        ))}
      </ul>
      {note && <p className="mt-2 text-sm" data-testid="travel-documents-note">{note}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}
