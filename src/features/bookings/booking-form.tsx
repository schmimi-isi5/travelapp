'use client';

import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { CURRENCIES } from '@/features/finance/currency';
import { create, update, ValidationError } from '@/lib/db/repo';
import { isAdult } from '@/lib/domain/policy';
import { minorDigits, parseAmountToMinor } from '@/lib/domain/money';
import { BOOKING_KINDS, BOOKING_STATUSES, type Booking, type Stay, type TripStop } from '@/lib/domain/schemas';

export const KIND_LABEL: Record<string, string> = { hotel: 'Hotel', flight: 'Flug', car: 'Mietwagen', activity: 'Aktivität', park: 'Park', other: 'Sonstiges' };
export const STATUS_LABEL: Record<string, string> = { unknown: 'Unbekannt', requested: 'Angefragt', reserved: 'Reserviert', confirmed: 'Bestätigt', cancelled: 'Storniert' };

export function BookingForm({ booking, stops, stays, onDone }: { booking?: Booking; stops: TripStop[]; stays: Stay[]; onDone: () => void }) {
  const { tripId, role } = useApp();
  const adult = isAdult(role);
  const [v, setV] = useState({
    kind: booking?.kind ?? 'flight',
    title: booking?.title ?? '',
    booking_status: booking?.booking_status ?? 'unknown',
    stop_id: booking?.stop_id ?? '',
    stay_id: booking?.stay_id ?? '',
    starts_at: booking?.starts_at?.slice(0, 10) ?? '',
    deadline_at: booking?.deadline_at?.slice(0, 10) ?? '',
    reminder_at: booking?.reminder_at?.slice(0, 10) ?? '',
    amount: booking?.amount_minor != null && booking.currency ? (booking.amount_minor / 10 ** minorDigits(booking.currency)).toFixed(minorDigits(booking.currency)).replace('.', ',') : '',
    currency: booking?.currency ?? 'EUR',
    reference: booking?.reference ?? '',
    provider: booking?.provider ?? '',
    contact: booking?.contact ?? '',
    notes: booking?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!v.title.trim()) next.title = 'Titel erforderlich';
    let amount: number | null = null;
    if (v.amount.trim()) {
      amount = parseAmountToMinor(v.amount, v.currency);
      if (amount === null) next.amount = 'Betrag ungültig, z. B. 450,00';
    }
    if (Object.keys(next).length) return setErrors(next);
    const payload = {
      kind: v.kind as Booking['kind'],
      title: v.title.trim(),
      booking_status: v.booking_status as Booking['booking_status'],
      stop_id: v.stop_id || null,
      stay_id: v.stay_id || null,
      starts_at: v.starts_at || null,
      deadline_at: v.deadline_at || null,
      reminder_at: v.reminder_at || null,
      amount_minor: amount,
      currency: amount === null ? null : v.currency,
      reference: v.reference.trim() || null,
      provider: v.provider.trim() || null,
      contact: v.contact.trim() || null,
      notes: v.notes.trim() || null,
    };
    try {
      if (booking) await update('bookings', booking.id, payload);
      else await create('bookings', { trip_id: tripId, ...payload });
      onDone();
    } catch (error) {
      if (error instanceof ValidationError) setErrors(Object.fromEntries(error.issues.map((i) => [i.path, i.message])));
      else throw error;
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label={booking ? 'Buchung bearbeiten' : 'Buchung anlegen'}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Art">{(p) => <Select {...p} value={v.kind} onChange={set('kind')}>{BOOKING_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</Select>}</Field>
        <Field label="Status">{(p) => <Select {...p} value={v.booking_status} onChange={set('booking_status')}>{BOOKING_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>}</Field>
      </div>
      <Field label="Titel" error={errors.title}>{(p) => <Input {...p} value={v.title} onChange={set('title')} required />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Station">{(p) => <Select {...p} value={v.stop_id} onChange={set('stop_id')}><option value="">Keine</option>{[...stops].sort((a, b) => a.sequence - b.sequence).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</Select>}</Field>
        <Field label="Unterkunft">{(p) => <Select {...p} value={v.stay_id} onChange={set('stay_id')}><option value="">Keine</option>{stays.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Beginn">{(p) => <Input {...p} type="date" value={v.starts_at} onChange={set('starts_at')} />}</Field>
        <Field label="Frist">{(p) => <Input {...p} type="date" value={v.deadline_at} onChange={set('deadline_at')} />}</Field>
        <Field label="Erinnerung">{(p) => <Input {...p} type="date" value={v.reminder_at} onChange={set('reminder_at')} />}</Field>
      </div>
      {adult && (
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><Field label="Betrag" error={errors.amount} hint="Leer lassen, wenn unbekannt.">{(p) => <Input {...p} inputMode="decimal" value={v.amount} onChange={set('amount')} />}</Field></div>
          <Field label="Währung">{(p) => <Select {...p} value={v.currency} onChange={set('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Referenz" hint="Nur belegte Nummern eintragen.">{(p) => <Input {...p} value={v.reference} onChange={set('reference')} />}</Field>
        <Field label="Anbieter">{(p) => <Input {...p} value={v.provider} onChange={set('provider')} />}</Field>
      </div>
      <Field label="Kontakt">{(p) => <Input {...p} value={v.contact} onChange={set('contact')} />}</Field>
      <Field label="Notizen">{(p) => <Textarea {...p} value={v.notes} onChange={set('notes')} />}</Field>
      <div className="flex justify-end"><Button type="submit">{booking ? 'Speichern' : 'Buchung anlegen'}</Button></div>
    </form>
  );
}
