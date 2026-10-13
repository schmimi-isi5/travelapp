'use client';

import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Card, Dialog, Select } from '@/components/ui';
import { openDocument } from '@/lib/db/documents';
import { create, update } from '@/lib/db/repo';
import { formatMinor } from '@/lib/domain/money';
import type { MailSuggestion } from '@/lib/ai/mail-types';
import type { Booking, DocumentRecord, Stay } from '@/lib/domain/schemas';
import { formatDate } from '@/lib/formatting';
import { assignMail, resolveSuggestion, type InboxMail } from './client';

const KIND_LABEL: Record<MailSuggestion['kind'], string> = {
  payment_received: 'Zahlung erhalten',
  payment_due: 'Zahlung fällig',
  booking_ref: 'Buchungsnummer',
  cancellation: 'Stornierung',
  info: 'Hinweis',
};

function describe(s: MailSuggestion): string {
  const parts = [s.text, s.amount_minor !== null && s.currency ? formatMinor(s.amount_minor, s.currency) : null, s.date ? formatDate(s.date) : null].filter(Boolean);
  return parts.join(' · ');
}

/** One mail of the trip mailbox: where it is filed, what it says, and what the app suggests entering (each only after a click). */
export function MailCard({ mail, stays, bookings, documents, onChanged }: { mail: InboxMail; stays: readonly Stay[]; bookings: readonly Booking[]; documents: readonly DocumentRecord[]; onChanged: () => void }) {
  const { familyId, remote } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const stay = stays.find((s) => s.id === mail.stay_id);
  const booking = bookings.find((b) => b.id === mail.booking_id);
  const document = documents.find((d) => d.id === mail.document_id);
  const assignedValue = mail.stay_id ? `stay:${mail.stay_id}` : mail.booking_id ? `booking:${mail.booking_id}` : '';

  async function run(action: () => Promise<void>) {
    try {
      setError(null);
      await action();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Das hat nicht geklappt.');
    }
  }

  const assign = (value: string) => run(async () => {
    const [kind, id] = value.split(':');
    await assignMail(mail.id, { stayId: kind === 'stay' ? id ?? null : null, bookingId: kind === 'booking' ? id ?? null : null });
  });

  async function readMail() {
    if (!document) return setError('Die Mail wird noch auf dieses Gerät geladen. Bitte kurz warten oder synchronisieren.');
    try {
      setError(null);
      setReading(await (await openDocument(document, undefined, remote)).text());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Die Mail konnte nicht geöffnet werden.');
    }
  }

  /** Enters the suggested value through the normal write path, then marks the suggestion as done. */
  const accept = (s: MailSuggestion) => run(async () => {
    const scope = { stay_id: mail.stay_id, booking_id: mail.booking_id };
    if (s.kind === 'payment_received' && s.amount_minor !== null && s.currency) {
      await create('payments', { family_id: familyId, ...scope, amount_minor: s.amount_minor, currency: s.currency, paid_at: s.date, verification_status: 'unverified', source_document_id: mail.document_id, notes: `Laut Mail „${mail.subject}“`.slice(0, 200), sync_state: 'pending' });
    } else if (s.kind === 'payment_due' && s.date) {
      if (stay) await update('stays', stay.id, { due_at: s.date });
      else if (booking) await update('bookings', booking.id, { deadline_at: s.date });
    } else if (s.kind === 'booking_ref' && s.reference) {
      if (stay) await update('stays', stay.id, { booking_ref: s.reference });
      else if (booking) await update('bookings', booking.id, { reference: s.reference });
    }
    await resolveSuggestion(mail.id, s.id, 'accepted');
  });
  const dismiss = (s: MailSuggestion) => run(async () => {
    await resolveSuggestion(mail.id, s.id, 'dismissed');
  });

  const isAssigned = Boolean(stay || booking);
  const acceptLabel = (s: MailSuggestion) => (s.kind === 'payment_received' ? 'Als Zahlung eintragen' : s.kind === 'payment_due' ? 'Fälligkeit übernehmen' : 'Nummer übernehmen');
  const current = (s: MailSuggestion) => {
    if (s.kind === 'payment_due') return (stay?.due_at ?? booking?.deadline_at?.slice(0, 10)) ? `Aktuell eingetragen: ${formatDate(stay?.due_at ?? booking?.deadline_at)}` : null;
    if (s.kind === 'booking_ref') return (stay?.booking_ref ?? booking?.reference) ? `Aktuell eingetragen: ${stay?.booking_ref ?? booking?.reference}` : null;
    return null;
  };

  return (
    <Card data-testid="mail-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold">{mail.subject}</h3>
          <p className="text-sm text-slate">{mail.from_address} · {mail.received_at ? formatDate(mail.received_at) : 'Datum unbekannt'}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void readMail()}>Mail lesen</Button>
      </div>
      {mail.summary && <p className="mt-2 text-sm">{mail.summary} <Badge tone="ai">KI-Zusammenfassung</Badge></p>}
      <label className="mt-3 block text-sm font-semibold">
        Abgelegt bei
        <Select className="mt-1 font-normal" value={assignedValue} onChange={(e) => void assign(e.target.value)}>
          <option value="">Noch nicht zugeordnet</option>
          <optgroup label="Unterkünfte">{stays.map((s) => <option key={s.id} value={`stay:${s.id}`}>{s.name}</option>)}</optgroup>
          <optgroup label="Buchungen">{bookings.map((b) => <option key={b.id} value={`booking:${b.id}`}>{b.title}</option>)}</optgroup>
        </Select>
      </label>
      {mail.match_reason && <p className="mt-1 text-xs text-muted">Zuordnung: {mail.match_reason}</p>}
      {mail.suggestions.length > 0 && (
        <ul className="mt-3 divide-y divide-line" aria-label="Vorschläge aus der Mail">
          {mail.suggestions.map((s) => (
            <li key={s.id} className="py-3 text-sm" data-testid="mail-suggestion" data-status={s.status}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={s.kind === 'payment_received' ? 'ok' : s.kind === 'cancellation' ? 'danger' : s.kind === 'payment_due' ? 'warn' : 'info'}>{KIND_LABEL[s.kind]}</Badge>
                <strong>{describe(s)}</strong>
                {s.status !== 'pending' && <Badge>{s.status === 'accepted' ? 'übernommen' : 'verworfen'}</Badge>}
              </div>
              <blockquote className="mt-1 border-l-2 border-line pl-3 text-muted">„{s.evidence}“</blockquote>
              {current(s) && s.status === 'pending' && <p className="mt-1 text-xs text-muted">{current(s)}</p>}
              {s.status === 'pending' && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.kind !== 'cancellation' && s.kind !== 'info' && <Button size="sm" disabled={!isAssigned} onClick={() => void accept(s)}>{acceptLabel(s)}</Button>}
                  <Button size="sm" variant="secondary" onClick={() => void dismiss(s)}>{s.kind === 'cancellation' || s.kind === 'info' ? 'Gelesen' : 'Verwerfen'}</Button>
                  {!isAssigned && s.kind !== 'cancellation' && s.kind !== 'info' && <span className="self-center text-xs text-muted">Erst einer Unterkunft oder Buchung zuordnen.</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <Dialog open={reading !== null} onClose={() => setReading(null)} title={mail.subject}>
        <p className="whitespace-pre-wrap text-[15px]">{reading}</p>
      </Dialog>
    </Card>
  );
}
