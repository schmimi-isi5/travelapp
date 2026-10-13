'use client';

import { FileText, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Select } from '@/components/ui';
import { addDocument, DocumentError, openDocument } from '@/lib/db/documents';
import { update } from '@/lib/db/repo';
import { downloadBlob } from '@/lib/download';
import type { Booking, DocumentRecord } from '@/lib/domain/schemas';
import { BOOKING_DOCUMENT_KINDS, defaultDocumentKind, documentKindLabel } from '@/lib/labels';

/** The documents of one booking (boarding pass, rental contract, confirmation …): list, add with kind, family visibility. Adults only. */
export function BookingDocuments({ booking, docs }: { booking: Booking; docs: DocumentRecord[] }) {
  const { familyId, remote } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<(typeof BOOKING_DOCUMENT_KINDS)[number]>(defaultDocumentKind(booking.kind));
  const [isFamilyVisible, setIsFamilyVisible] = useState(defaultDocumentKind(booking.kind) === 'ticket');
  const [error, setError] = useState<string | null>(null);

  function chooseKind(next: (typeof BOOKING_DOCUMENT_KINDS)[number]) {
    setKind(next);
    setIsFamilyVisible(next === 'ticket');
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setError(null);
      await addDocument({ file, familyId, bookingId: booking.id, classification: kind, isFamilyVisible });
    } catch (err) {
      setError(err instanceof DocumentError ? err.message : 'Upload fehlgeschlagen.');
    }
  }

  async function open(doc: DocumentRecord) {
    try {
      setError(null);
      downloadBlob(await openDocument(doc, undefined, remote), doc.original_name);
    } catch (err) {
      setError(err instanceof DocumentError ? err.message : 'Die Datei konnte nicht geöffnet werden.');
    }
  }

  async function toggleVisibility(doc: DocumentRecord) {
    try {
      setError(null);
      await update('documents', doc.id, { access_level: doc.access_level === 'family' ? 'adult' : 'family' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Die Sichtbarkeit konnte nicht geändert werden.');
    }
  }

  return (
    <div>
      <ul className="space-y-1">
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm" data-testid="booking-document">
            <FileText size={14} aria-hidden />
            <button type="button" className="font-semibold text-deep underline" onClick={() => void open(d)}>{d.title ?? d.original_name}</button>
            <Badge>{documentKindLabel[d.classification]}</Badge>
            {d.access_level === 'family' && <Badge tone="info">für alle sichtbar</Badge>}
            {d.access_level !== 'sensitive' && (
              <button type="button" className="text-xs text-slate underline" onClick={() => void toggleVisibility(d)}>
                {d.access_level === 'family' ? 'Nur für Erwachsene' : 'Für alle sichtbar machen'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {docs.length === 0 && <p className="text-sm text-muted">Kein Nachweis hinterlegt.</p>}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">
          Art der Unterlage
          <Select className="mt-1 font-normal sm:w-56" value={kind} onChange={(e) => chooseKind(e.target.value as (typeof BOOKING_DOCUMENT_KINDS)[number])}>
            {BOOKING_DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{documentKindLabel[k]}</option>)}
          </Select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-[#0F3D4E]" checked={isFamilyVisible} onChange={(e) => setIsFamilyVisible(e.target.checked)} />
          Für die ganze Familie sichtbar (auch Kinder)
        </label>
        <input ref={fileRef} type="file" className="sr-only" aria-label={`Nachweis hochladen für ${booking.title}`} accept="application/pdf,image/jpeg,image/png,image/webp" onChange={upload} />
        <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={14} aria-hidden /> Nachweis hinzufügen</Button>
      </div>
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
