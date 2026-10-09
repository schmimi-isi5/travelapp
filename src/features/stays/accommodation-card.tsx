'use client';

import { FileText, Pencil, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Accordion, Badge, Button, ConfirmationDialog, Dialog, Field, Input, Notice, Select } from '@/components/ui';
import { ActionChecklist } from '@/features/common/action-checklist';
import { CURRENCIES } from '@/features/finance/currency';
import { PaymentStatusBadge } from '@/features/finance/payment-badge';
import { addDocument, DocumentError, openDocument } from '@/lib/db/documents';
import { create, remove, update } from '@/lib/db/repo';
import { computeStayFinancials, formatMinor, parseAmountToMinor } from '@/lib/domain/money';
import { isAdult } from '@/lib/domain/policy';
import type { ActionItem, DocumentRecord, Payment, Stay, TripStop } from '@/lib/domain/schemas';
import { formatDate } from '@/lib/formatting';
import { StayForm, STATUS_LABEL } from './stay-form';

export function clarificationReasons(stay: Stay, payments: Payment[], docs: DocumentRecord[]): string[] {
  const fin = computeStayFinancials(stay, payments);
  const reasons: string[] = [];
  if (stay.booking_status === 'unknown') reasons.push('Buchungsstatus unbekannt');
  if (stay.quote_status !== 'confirmed') reasons.push(stay.quote_status === 'quoted' ? 'Preis nur angeboten' : 'Preis nicht erfasst');
  if (fin.unverifiedMinor > 0) reasons.push('Zahlung nicht verifiziert');
  if (fin.foreignCurrencyPayments.length) reasons.push('Zahlung in anderer Währung');
  if (docs.length === 0) reasons.push('Kein Beleg hinterlegt');
  return reasons;
}

function PaymentForm({ stay, onDone }: { stay: Stay; onDone: () => void }) {
  const { familyId } = useApp();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(stay.currency ?? 'NAD');
  const [paidAt, setPaidAt] = useState('');
  const [verification, setVerification] = useState<'unverified' | 'verified'>('unverified');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const minor = parseAmountToMinor(amount, currency);
    if (minor === null || minor <= 0) return setError('Bitte einen gültigen Betrag größer 0 eingeben.');
    await create('payments', { family_id: familyId, stay_id: stay.id, amount_minor: minor, currency, paid_at: paidAt || null, verification_status: verification, notes: notes || null, sync_state: 'pending' });
    onDone();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Zahlung erfassen">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2"><Field label="Betrag" error={error}>{(p) => <Input {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field></div>
        <Field label="Währung">{(p) => <Select {...p} value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
      </div>
      {stay.currency && currency !== stay.currency && <Notice tone="warn">Andere Währung als der Preis ({stay.currency}). Ohne belegte Umrechnung wird die Zahlung nicht auf den Restbetrag angerechnet.</Notice>}
      <Field label="Bezahlt am">{(p) => <Input {...p} type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />}</Field>
      <Field label="Verifizierung" hint="Nur Zahlungen mit Beleg als „verifiziert“ markieren.">{(p) => <Select {...p} value={verification} onChange={(e) => setVerification(e.target.value as 'unverified' | 'verified')}><option value="unverified">Nicht verifiziert</option><option value="verified">Verifiziert (Beleg geprüft)</option></Select>}</Field>
      <Field label="Notiz">{(p) => <Input {...p} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      <div className="flex justify-end"><Button type="submit">Zahlung speichern</Button></div>
    </form>
  );
}

export function AccommodationCard({ stay, stop, stops, payments, documents, items, defaultOpen }: { stay: Stay; stop?: TripStop; stops: TripStop[]; payments: Payment[]; documents: DocumentRecord[]; items: ActionItem[]; defaultOpen?: boolean }) {
  const { role, familyId, remote } = useApp();
  const adult = isAdult(role);
  const fin = computeStayFinancials(stay, payments);
  const reasons = clarificationReasons(stay, payments, documents);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nights = stay.check_in && stay.check_out ? Math.round((Date.parse(stay.check_out) - Date.parse(stay.check_in)) / 86_400_000) : null;

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setDocError(null);
      await addDocument({ file, familyId, stayId: stay.id, classification: 'invoice' });
    } catch (error) {
      setDocError(error instanceof DocumentError ? error.message : 'Upload fehlgeschlagen.');
    }
  }

  async function view(doc: DocumentRecord) {
    try {
      const blob = await openDocument(doc, undefined, remote);
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch (error) {
      setDocError(error instanceof DocumentError ? error.message : 'Datei konnte nicht geöffnet werden.');
    }
  }

  return (
    <Accordion
      defaultOpen={defaultOpen}
      id={`stay-${stay.id}`}
      title={
        <div data-testid="stay-card">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold">{stay.name}</h3>
            {stay.is_demo && <Badge tone="demo">Demo</Badge>}
          </div>
          <p className="text-sm text-slate">{stop?.title ?? 'Keine Station'} · {nights !== null ? `${nights} Nächte` : 'Nächte unbekannt'} · {formatDate(stay.check_in, { day: '2-digit', month: 'short' })} – {formatDate(stay.check_out, { day: '2-digit', month: 'short' })}</p>
        </div>
      }
      summary={adult ? <PaymentStatusBadge state={fin.state} /> : <Badge>{STATUS_LABEL[stay.booking_status]}</Badge>}
    >
      <div className="space-y-6">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">Buchungsstatus</dt><dd className="font-semibold">{STATUS_LABEL[stay.booking_status]}</dd></div>
          <div><dt className="text-muted">Buchungsreferenz</dt><dd className="font-semibold">{adult ? stay.booking_ref ?? 'unbekannt' : 'nicht sichtbar'}</dd></div>
          <div><dt className="text-muted">Kontakt</dt><dd className="font-semibold">{stay.contact ?? 'unbekannt'}</dd></div>
          <div><dt className="text-muted">Zahlung fällig</dt><dd className="font-semibold">{formatDate(stay.due_at)}</dd></div>
          {stay.notes && <div className="sm:col-span-2"><dt className="text-muted">Notizen</dt><dd>{stay.notes}</dd></div>}
        </dl>

        {adult && (
          <section aria-label={`Zahlungen ${stay.name}`} className="rounded-md bg-sand-50 p-4">
            <h4 className="mb-3 font-bold">Preis &amp; Zahlungen</h4>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-muted">Bruttobetrag ({stay.quote_status === 'confirmed' ? 'bestätigt' : stay.quote_status === 'quoted' ? 'Angebot' : 'nicht erfasst'})</dt><dd className="text-lg font-bold" data-testid="price">{stay.price_minor !== null && stay.currency ? formatMinor(stay.price_minor, stay.currency) : 'unbekannt'}</dd></div>
              <div><dt className="text-muted">Verifiziert gezahlt</dt><dd className="text-lg font-bold" data-testid="verified">{stay.currency ? formatMinor(fin.verifiedMinor, stay.currency) : fin.verifiedMinor ? 'Währung unbekannt' : 'keine'}</dd></div>
              <div><dt className="text-muted">Nicht verifiziert (separat)</dt><dd className="text-lg font-bold text-warn" data-testid="unverified">{stay.currency ? formatMinor(fin.unverifiedMinor, stay.currency) : '–'}</dd></div>
              <div><dt className="text-muted">Restbetrag</dt><dd className="text-lg font-bold" data-testid="remaining">{fin.remainingMinor !== null && stay.currency ? formatMinor(fin.remainingMinor, stay.currency) : 'unbekannt'}</dd></div>
            </dl>
            {fin.overpaidMinor > 0 && stay.currency && <div className="mt-3"><Notice tone="info" title="Überzahlung">{formatMinor(fin.overpaidMinor, stay.currency)} mehr als der bestätigte Preis verifiziert gezahlt.</Notice></div>}
            {fin.reasons.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-slate">{fin.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}

            <ul className="mt-4 divide-y divide-line" aria-label="Zahlungsbuchungen">
              {payments.length === 0 && <li className="py-2 text-sm text-muted">Keine Zahlungen erfasst.</li>}
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-2 text-sm" data-testid="payment-row">
                  <strong>{formatMinor(p.amount_minor, p.currency)}</strong>
                  <span className="text-slate">{formatDate(p.paid_at)}</span>
                  <Badge tone={p.verification_status === 'verified' ? 'ok' : p.verification_status === 'rejected' ? 'danger' : 'warn'}>{p.verification_status === 'verified' ? 'verifiziert' : p.verification_status === 'rejected' ? 'abgelehnt' : 'nicht verifiziert'}</Badge>
                  {p.sync_state === 'pending' && <Badge tone="info">ausstehend (nicht synchronisiert)</Badge>}
                  {p.notes && <span className="text-muted">{p.notes}</span>}
                  <span className="ml-auto flex gap-1">
                    {p.verification_status !== 'verified' && <Button size="sm" variant="secondary" onClick={() => void update('payments', p.id, { verification_status: 'verified', sync_state: 'pending' })}>Als verifiziert markieren</Button>}
                    <Button size="sm" variant="ghost" aria-label="Zahlung löschen" onClick={() => void remove('payments', p.id)}><Trash2 size={16} aria-hidden /></Button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3"><Button variant="secondary" onClick={() => setPaying(true)}>Zahlung hinzufügen</Button></div>
          </section>
        )}

        <section aria-label={`Belege ${stay.name}`}>
          <h4 className="mb-2 font-bold">Belege (privat)</h4>
          {!adult ? <p className="text-sm text-muted">Belege sind für diese Rolle nicht sichtbar.</p> : (
            <>
              <ul className="space-y-1">
                {documents.length === 0 && <li className="text-sm text-muted">Kein Beleg hinterlegt.</li>}
                {documents.map((d) => <li key={d.id} className="flex items-center gap-2 text-sm"><FileText size={16} aria-hidden /><button type="button" className="font-semibold text-deep underline" onClick={() => void view(d)}>{d.title ?? d.original_name}</button></li>)}
              </ul>
              <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" aria-label={`Beleg hochladen für ${stay.name}`} onChange={upload} />
              <Button className="mt-2" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}><Upload size={14} aria-hidden /> Beleg hochladen</Button>
              {docError && <p role="alert" className="mt-2 text-sm text-danger">{docError}</p>}
            </>
          )}
        </section>

        <section aria-label={`Checkliste ${stay.name}`}>
          <h4 className="mb-1 font-bold">Hotel-Checkliste</h4>
          <ActionChecklist items={items} scope={{ stay_id: stay.id }} label={`Checkliste ${stay.name}`} />
        </section>

        {reasons.length > 0 && adult && <div><h4 className="mb-1 font-bold">Klärbedarf</h4><ul className="flex flex-wrap gap-2">{reasons.map((r) => <li key={r}><Badge tone="warn">{r}</Badge></li>)}</ul></div>}

        {adult && <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil size={14} aria-hidden /> Bearbeiten</Button><Button variant="ghost" size="sm" onClick={() => setDeleting(true)}><Trash2 size={14} aria-hidden /> Löschen</Button></div>}
      </div>
      <Dialog open={editing} onClose={() => setEditing(false)} title="Unterkunft bearbeiten"><StayForm stay={stay} stops={stops} onDone={() => setEditing(false)} /></Dialog>
      <Dialog open={paying} onClose={() => setPaying(false)} title="Zahlung hinzufügen"><PaymentForm stay={stay} onDone={() => setPaying(false)} /></Dialog>
      <ConfirmationDialog open={deleting} title="Unterkunft löschen?" message={`„${stay.name}“ inklusive Zahlungen und Checkliste wird entfernt.`} confirmLabel="Löschen" onCancel={() => setDeleting(false)} onConfirm={async () => { await Promise.all([...payments.map((p) => remove('payments', p.id)), ...items.map((i) => remove('action_items', i.id))]); await remove('stays', stay.id); setDeleting(false); }} />
    </Accordion>
  );
}
