'use client';

import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { CURRENCIES } from '@/features/finance/currency';
import { create, update, ValidationError } from '@/lib/db/repo';
import { minorDigits, parseAmountToMinor } from '@/lib/domain/money';
import { BOOKING_STATUSES, type Stay, type TripStop } from '@/lib/domain/schemas';

const STATUS_LABEL: Record<string, string> = { unknown: 'Unbekannt', requested: 'Angefragt', reserved: 'Reserviert', confirmed: 'Bestätigt', cancelled: 'Storniert' };
const QUOTE_LABEL = { none: 'Kein Preis erfasst', quoted: 'Angebot (unverbindlich)', confirmed: 'Bestätigter Preis' } as const;

export const HOTEL_CHECKLIST = ['Buchungsbestätigung prüfen', 'Rechnungsbetrag erfassen', 'Zahlung prüfen', 'Check-in-Zeit klären'];

function amountToInput(minor: number | null, currency: string | null): string {
  if (minor === null || !currency) return '';
  const digits = minorDigits(currency);
  return (minor / 10 ** digits).toFixed(digits).replace('.', ',');
}

export function StayForm({ stay, stops, onDone }: { stay?: Stay; stops: TripStop[]; onDone: () => void }) {
  const { tripId, familyId } = useApp();
  const [values, setValues] = useState({
    name: stay?.name ?? '',
    stop_id: stay?.stop_id ?? '',
    check_in: stay?.check_in ?? '',
    check_out: stay?.check_out ?? '',
    booking_status: stay?.booking_status ?? 'unknown',
    quote_status: stay?.quote_status ?? 'none',
    price: amountToInput(stay?.price_minor ?? null, stay?.currency ?? null),
    currency: stay?.currency ?? 'NAD',
    booking_ref: stay?.booking_ref ?? '',
    due_at: stay?.due_at ?? '',
    contact: stay?.contact ?? '',
    notes: stay?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!values.name.trim()) next.name = 'Name erforderlich';
    if (values.check_in && values.check_out && values.check_out < values.check_in) next.check_out = 'Check-out liegt vor dem Check-in.';
    let priceMinor: number | null = null;
    if (values.quote_status !== 'none') {
      priceMinor = parseAmountToMinor(values.price, values.currency);
      if (priceMinor === null) next.price = 'Betrag ungültig, z. B. 1.250,00';
    }
    if (Object.keys(next).length) return setErrors(next);
    const payload = {
      name: values.name.trim(),
      stop_id: values.stop_id || null,
      check_in: values.check_in || null,
      check_out: values.check_out || null,
      booking_status: values.booking_status as Stay['booking_status'],
      quote_status: values.quote_status as Stay['quote_status'],
      price_minor: values.quote_status === 'none' ? null : priceMinor,
      currency: values.quote_status === 'none' ? null : values.currency,
      booking_ref: values.booking_ref.trim() || null,
      due_at: values.due_at || null,
      contact: values.contact.trim() || null,
      notes: values.notes.trim() || null,
    };
    try {
      if (stay) await update('stays', stay.id, payload);
      else {
        const created = await create('stays', { trip_id: tripId, ...payload });
        for (const title of HOTEL_CHECKLIST) await create('action_items', { family_id: familyId, trip_id: tripId, stay_id: created.id, title });
      }
      onDone();
    } catch (error) {
      if (error instanceof ValidationError) setErrors(Object.fromEntries(error.issues.map((i) => [i.path, i.message])));
      else throw error;
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label={stay ? 'Unterkunft bearbeiten' : 'Unterkunft anlegen'}>
      <Field label="Name der Unterkunft" error={errors.name}>{(p) => <Input {...p} value={values.name} onChange={set('name')} required />}</Field>
      <Field label="Station">{(p) => (
        <Select {...p} value={values.stop_id} onChange={set('stop_id')}>
          <option value="">Keine Station</option>
          {[...stops].sort((a, b) => a.sequence - b.sequence).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </Select>
      )}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Check-in">{(p) => <Input {...p} type="date" value={values.check_in} onChange={set('check_in')} />}</Field>
        <Field label="Check-out" error={errors.check_out}>{(p) => <Input {...p} type="date" value={values.check_out} onChange={set('check_out')} />}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Buchungsstatus">{(p) => <Select {...p} value={values.booking_status} onChange={set('booking_status')}>{BOOKING_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>}</Field>
        <Field label="Preisstatus">{(p) => <Select {...p} value={values.quote_status} onChange={set('quote_status')}>{(Object.keys(QUOTE_LABEL) as (keyof typeof QUOTE_LABEL)[]).map((s) => <option key={s} value={s}>{QUOTE_LABEL[s]}</option>)}</Select>}</Field>
      </div>
      {values.quote_status !== 'none' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><Field label="Bruttobetrag" error={errors.price} hint="Nur bestätigte Preise ergeben einen Restbetrag.">{(p) => <Input {...p} inputMode="decimal" value={values.price} onChange={set('price')} />}</Field></div>
          <Field label="Währung">{(p) => <Select {...p} value={values.currency} onChange={set('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Buchungsreferenz" hint="Nur eintragen, wenn belegt.">{(p) => <Input {...p} value={values.booking_ref} onChange={set('booking_ref')} />}</Field>
        <Field label="Zahlung fällig am">{(p) => <Input {...p} type="date" value={values.due_at} onChange={set('due_at')} />}</Field>
      </div>
      <Field label="Kontakt">{(p) => <Input {...p} value={values.contact} onChange={set('contact')} />}</Field>
      <Field label="Notizen">{(p) => <Textarea {...p} value={values.notes} onChange={set('notes')} />}</Field>
      <div className="flex justify-end"><Button type="submit">{stay ? 'Änderungen speichern' : 'Unterkunft anlegen'}</Button></div>
    </form>
  );
}

export { STATUS_LABEL };
