'use client';

import { Download, FileText, Pencil, Plane, Plus, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Card, Chip, ConfirmationDialog, Dialog, EmptyState, Notice, PageHeader, Toolbar } from '@/components/ui';
import { BookingForm, KIND_LABEL, STATUS_LABEL } from '@/features/bookings/booking-form';
import { addDocument, DocumentError, openDocument } from '@/lib/db/documents';
import { useTable } from '@/lib/db/hooks';
import { remove } from '@/lib/db/repo';
import { downloadBlob } from '@/lib/download';
import { formatMinor } from '@/lib/domain/money';
import { isAdult } from '@/lib/domain/policy';
import { BOOKING_KINDS, type Booking, type DocumentRecord } from '@/lib/domain/schemas';
import { formatDate } from '@/lib/formatting';

function BookingCard({ booking, stopTitle, docs, onEdit }: { booking: Booking; stopTitle?: string; docs: DocumentRecord[]; onEdit: () => void }) {
  const { role, familyId, remote } = useApp();
  const adult = isAdult(role);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setError(null);
      await addDocument({ file, familyId, bookingId: booking.id, classification: 'confirmation' });
    } catch (err) {
      setError(err instanceof DocumentError ? err.message : 'Upload fehlgeschlagen.');
    }
  }

  function exportBooking() {
    const data = { exported_at: new Date().toISOString(), booking, documents: docs.map((d) => ({ id: d.id, name: d.original_name, mime_type: d.mime_type })) };
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `buchung-${booking.id.slice(0, 8)}.json`);
  }

  return (
    <Card data-testid="booking-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="mb-1 flex flex-wrap gap-2"><Badge tone="info">{KIND_LABEL[booking.kind]}</Badge><Badge tone={booking.booking_status === 'confirmed' ? 'ok' : booking.booking_status === 'cancelled' ? 'danger' : booking.booking_status === 'unknown' ? 'neutral' : 'warn'}>{STATUS_LABEL[booking.booking_status]}</Badge>{booking.is_demo && <Badge tone="demo">Demo</Badge>}</div>
          <h3 className="text-lg font-bold">{booking.title}</h3>
          <p className="text-sm text-slate">{stopTitle ?? 'Keine Station'} · Beginn {formatDate(booking.starts_at)} · Frist {formatDate(booking.deadline_at)}</p>
        </div>
        {adult && <p className="font-bold">{booking.amount_minor !== null && booking.currency ? formatMinor(booking.amount_minor, booking.currency) : 'Betrag unbekannt'}</p>}
      </div>
      <p className="mt-2 text-sm text-slate">Referenz: {adult ? booking.reference ?? 'unbekannt' : 'nicht sichtbar'} · Anbieter: {booking.provider ?? 'unbekannt'}</p>
      {booking.notes && <p className="mt-1 text-sm text-slate">{booking.notes}</p>}
      {adult && (
        <div className="mt-3">
          <ul className="space-y-1">{docs.map((d) => <li key={d.id} className="flex items-center gap-2 text-sm"><FileText size={14} aria-hidden /><button type="button" className="font-semibold text-deep underline" onClick={async () => { try { downloadBlob(await openDocument(d, undefined, remote), d.original_name); } catch (err) { setError(err instanceof DocumentError ? err.message : 'Fehler'); } }}>{d.title ?? d.original_name}</button></li>)}</ul>
          {docs.length === 0 && <p className="text-sm text-muted">Kein Nachweis hinterlegt.</p>}
          <input ref={fileRef} type="file" className="sr-only" aria-label={`Nachweis hochladen für ${booking.title}`} accept="application/pdf,image/jpeg,image/png,image/webp" onChange={upload} />
          {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={14} aria-hidden /> Nachweis hinzufügen</Button>
            <Button size="sm" variant="secondary" onClick={exportBooking}><Download size={14} aria-hidden /> Exportieren</Button>
            <Button size="sm" variant="ghost" onClick={onEdit}><Pencil size={14} aria-hidden /> Bearbeiten</Button>
            <Button size="sm" variant="ghost" aria-label={`${booking.title} löschen`} onClick={() => setDeleting(true)}><Trash2 size={14} aria-hidden /></Button>
          </div>
        </div>
      )}
      <ConfirmationDialog open={deleting} title="Buchung löschen?" message={`„${booking.title}“ wird entfernt.`} confirmLabel="Löschen" onCancel={() => setDeleting(false)} onConfirm={async () => { await remove('bookings', booking.id); setDeleting(false); }} />
    </Card>
  );
}

export default function BookingsPage() {
  const { role } = useApp();
  const adult = isAdult(role);
  const bookings = useTable('bookings').rows;
  const stops = useTable('trip_stops').rows;
  const stays = useTable('stays').rows;
  const documents = useTable('documents').rows;
  const [kind, setKind] = useState<string>('all');
  const [editing, setEditing] = useState<Booking | 'new' | null>(null);
  const visible = [...bookings].filter((b) => kind === 'all' || b.kind === kind).sort((a, b) => (a.starts_at ?? '9999').localeCompare(b.starts_at ?? '9999'));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Buchungen" subtitle="Flüge, Mietwagen, Aktivitäten und Parkgebühren, verknüpft mit Stationen. Es wird nichts gebucht oder bezahlt." actions={adult && <Button onClick={() => setEditing('new')}><Plus size={18} aria-hidden /> Buchung anlegen</Button>} />
      {!adult && <div className="mb-4"><Notice tone="info">Beträge, Referenzen und Nachweise sind in dieser Rolle ausgeblendet.</Notice></div>}
      <Toolbar>
        <Chip active={kind === 'all'} onClick={() => setKind('all')} count={bookings.length}>Alle</Chip>
        {BOOKING_KINDS.map((k) => <Chip key={k} active={kind === k} onClick={() => setKind(k)} count={bookings.filter((b) => b.kind === k).length}>{KIND_LABEL[k]}</Chip>)}
      </Toolbar>
      {visible.length === 0 ? (
        <EmptyState icon={<Plane />} title="Keine Buchungen" text="Lege Flüge, Mietwagen oder Aktivitäten an und verknüpfe sie mit einer Station." action={adult ? <Button onClick={() => setEditing('new')}>Buchung anlegen</Button> : undefined} />
      ) : (
        <div className="space-y-4">{visible.map((b) => <BookingCard key={b.id} booking={b} stopTitle={stops.find((s) => s.id === b.stop_id)?.title} docs={documents.filter((d) => d.booking_id === b.id)} onEdit={() => setEditing(b)} />)}</div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Buchung anlegen' : 'Buchung bearbeiten'}>
        {editing !== null && <BookingForm booking={editing === 'new' ? undefined : editing} stops={stops} stays={stays} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}
