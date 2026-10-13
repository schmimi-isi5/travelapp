'use client';

import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Button, Dialog, Field, Input } from '@/components/ui';
import { create } from '@/lib/db/repo';
import { todayIso } from '@/lib/formatting';

/** Currencies with a fixed 1:1 link to the South African rand (Common Monetary Area): offered as a suggestion, never applied silently. */
const RAND_LINKED = new Set(['NAD', 'LSL', 'SZL']);

function suggestion(from: string, to: string): { rate: string; source: string } | null {
  const isPair = (from === 'ZAR' && RAND_LINKED.has(to)) || (to === 'ZAR' && RAND_LINKED.has(from));
  return isPair ? { rate: '1', source: 'Feste Kopplung 1:1 (Common Monetary Area)' } : null;
}

/** Records a documented exchange rate (source and date required) so payments in `from` count toward a price in `to`. Adults only, decided by the caller. */
export function StayRateButton({ from, to }: { from: string; to: string }) {
  const { today } = useApp();
  const hint = suggestion(from, to);
  const [isOpen, setIsOpen] = useState(false);
  const [rate, setRate] = useState('');
  const [source, setSource] = useState('');
  const [asOf, setAsOf] = useState('');
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setRate(hint?.rate ?? '');
    setSource(hint?.source ?? '');
    setAsOf(today || todayIso());
    setError(null);
    setIsOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(rate.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return setError('Kurs muss eine Zahl größer 0 sein.');
    if (!source.trim()) return setError('Quelle des Kurses ist erforderlich.');
    if (!asOf) return setError('Stand des Kurses ist erforderlich.');
    await create('fx_rates', { from_currency: from, to_currency: to, rate: value, as_of: asOf, source: source.trim() });
    setIsOpen(false);
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={openDialog}>Kurs {from}→{to} hinterlegen</Button>
      <Dialog open={isOpen} onClose={() => setIsOpen(false)} title={`Wechselkurs ${from} → ${to}`}>
        <form onSubmit={save} className="space-y-3" noValidate>
          <p className="text-sm text-slate">1 {from} entspricht wie vielen {to}? Mit dem Kurs werden Zahlungen in {from} auf den Preis in {to} angerechnet. Quelle und Stand bleiben sichtbar.</p>
          {hint && <p className="rounded-md bg-sand-50 p-3 text-sm">Vorschlag: {from} und {to} sind fest 1:1 gekoppelt. Bitte prüfen, ob das auch für diese Zahlung gilt.</p>}
          <Field label="Kurs">{(p) => <Input {...p} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />}</Field>
          <Field label="Quelle des Kurses">{(p) => <Input {...p} value={source} onChange={(e) => setSource(e.target.value)} />}</Field>
          <Field label="Stand des Kurses">{(p) => <Input {...p} type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />}</Field>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsOpen(false)}>Abbrechen</Button>
            <Button type="submit">Kurs speichern</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
