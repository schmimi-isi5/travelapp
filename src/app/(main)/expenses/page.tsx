'use client';

import { Camera, Download, Plus, Trash2, Wallet } from 'lucide-react';
import { useRef, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Card, ConfirmationDialog, Dialog, EmptyState, Field, Input, Notice, PageHeader, Select, StateBlock } from '@/components/ui';
import { CURRENCIES } from '@/features/finance/currency';
import { scanReceipt } from '@/lib/ai/receipt';
import { fetchReferenceRate } from '@/lib/fx/client';
import { useTable } from '@/lib/db/hooks';
import { create, remove, ValidationError } from '@/lib/db/repo';
import { downloadBlob } from '@/lib/download';
import { consolidate, formatMinor, parseAmountToMinor, sumByCurrency } from '@/lib/domain/money';
import { isAdult } from '@/lib/domain/policy';
import { EXPENSE_CATEGORIES } from '@/lib/domain/schemas';
import { formatDate, todayIso } from '@/lib/formatting';
import { toCsv } from '@/features/archive/export';

const CATEGORY_LABEL: Record<string, string> = { unterkunft: 'Unterkunft', verpflegung: 'Verpflegung', transport: 'Transport', aktivitaeten: 'Aktivitäten', park: 'Park & Eintritt', einkauf: 'Einkauf', sonstiges: 'Sonstiges' };

export default function ExpensesPage() {
  const { role, tripId, currentUser, today } = useApp();
  const expenses = useTable('expenses').rows;
  const payments = useTable('payments').rows;
  const rates = useTable('fx_rates').rows;
  const [adding, setAdding] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [form, setForm] = useState({ category: 'verpflegung', description: '', amount: '', currency: 'NAD', spent_at: today || todayIso() });
  const [rate, setRate] = useState({ from: 'NAD', to: 'EUR', rate: '', source: '', as_of: today || todayIso() });
  const [error, setError] = useState<string | null>(null);
  const [pendingReceipt, setPendingReceipt] = useState<File | null>(null);
  const [receiptNote, setReceiptNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isLoadingRate, setIsLoadingRate] = useState(false);
  const [rateNote, setRateNote] = useState<string | null>(null);
  const receiptRef = useRef<HTMLInputElement>(null);

  if (!isAdult(role)) {
    return <StateBlock kind="permission_denied" title="Kein Zugriff" text="Ausgaben und Zahlungen sind in dieser Rolle nicht sichtbar." />;
  }

  const totals = sumByCurrency(expenses);
  const consolidated = consolidate(totals, 'EUR', rates);
  const byCategory = EXPENSE_CATEGORIES.map((c) => ({ category: c, totals: sumByCurrency(expenses.filter((e) => e.category === c)) })).filter((x) => x.totals.length > 0);
  const paymentTotals = (state: 'verified' | 'unverified') => sumByCurrency(payments.filter((p) => p.verification_status === state));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const minor = parseAmountToMinor(form.amount, form.currency);
    if (minor === null || minor <= 0) return setError('Bitte einen gültigen Betrag größer 0 eingeben.');
    try {
      await create('expenses', { trip_id: tripId, category: form.category as (typeof EXPENSE_CATEGORIES)[number], description: form.description, amount_minor: minor, currency: form.currency, spent_at: form.spent_at, entered_by: currentUser?.id ?? 'unknown' });
      setAdding(false);
      setError(null);
      setForm({ ...form, description: '', amount: '' });
    } catch (err) {
      if (err instanceof ValidationError) setError(err.message);
      else throw err;
    }
  }

  /** Sends the confirmed receipt photo to the AI reading and puts its suggestions into the form; nothing is saved before the person checks them. */
  async function readReceipt(file: File) {
    setPendingReceipt(null);
    setIsReading(true);
    setReceiptNote(null);
    const outcome = await scanReceipt(file);
    setIsReading(false);
    if (!outcome.ok) return setReceiptNote({ tone: 'warn', text: outcome.reason });
    const { receipt } = outcome;
    const currency = receipt.currency && (CURRENCIES as readonly string[]).includes(receipt.currency) ? receipt.currency : form.currency;
    setForm((current) => ({
      ...current,
      currency,
      amount: receipt.amount !== null ? receipt.amount.toFixed(currency === 'JPY' ? 0 : 2).replace('.', ',') : current.amount,
      spent_at: receipt.date ?? current.spent_at,
      description: receipt.merchant ?? current.description,
      category: receipt.category ?? current.category,
    }));
    const missing = [receipt.amount === null && 'Betrag', receipt.currency === null && 'Währung', receipt.date === null && 'Datum'].filter(Boolean);
    setReceiptNote({ tone: 'ok', text: `Von der KI vorgeschlagen (${outcome.provider}), bitte prüfen.${missing.length ? ` Nicht lesbar: ${missing.join(', ')}.` : ''}` });
  }

  async function loadReferenceRate() {
    setIsLoadingRate(true);
    setRateNote(null);
    const loaded = await fetchReferenceRate(rate.from, rate.to);
    setIsLoadingRate(false);
    if (!loaded) return setRateNote('Der Kurs konnte nicht geladen werden (offline oder Dienst nicht erreichbar). Bitte selbst eintragen.');
    setRate((current) => ({ ...current, rate: String(Number(loaded.rate.toPrecision(5))).replace('.', ','), source: `${loaded.source}, Referenzkurs`, as_of: loaded.asOf }));
    setRateNote('Referenzkurs geladen. Ein Wechselstubenkurs weicht meist ab: prüfe Quelle und Stand und speichere ihn nur, wenn er für euch passt.');
  }

  async function saveRate(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(rate.rate.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return setError('Kurs muss eine Zahl größer 0 sein.');
    if (!rate.source.trim()) return setError('Quelle des Kurses ist erforderlich.');
    await create('fx_rates', { from_currency: rate.from, to_currency: rate.to, rate: value, as_of: rate.as_of, source: rate.source.trim() });
    setRateOpen(false);
    setError(null);
  }

  function exportCsv() {
    const csv = toCsv(['Datum', 'Kategorie', 'Beschreibung', 'Betrag (Minor Units)', 'Währung'], expenses.map((x) => [x.spent_at, x.category, x.description, x.amount_minor, x.currency]));
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'ausgaben.csv');
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Ausgaben" subtitle="Jede Währung separat. Eine EUR-Summe gibt es nur mit dokumentiertem Wechselkurs." actions={<><Button variant="secondary" onClick={exportCsv}><Download size={16} aria-hidden /> CSV</Button><Button onClick={() => setAdding(true)}><Plus size={18} aria-hidden /> Ausgabe erfassen</Button></>} />
      <section aria-label="Summen je Währung" className="grid gap-4 sm:grid-cols-3">
        {totals.length === 0 && <p className="text-slate">Noch keine Ausgaben.</p>}
        {totals.map((t) => (
          <Card key={t.currency} data-testid={`total-${t.currency}`}>
            <p className="text-xs font-bold uppercase text-muted">Summe {t.currency}</p>
            <p className="mt-1 text-2xl font-bold text-deep">{formatMinor(t.totalMinor, t.currency)}</p>
            <p className="text-sm text-slate">{t.count} Buchung{t.count === 1 ? '' : 'en'}</p>
          </Card>
        ))}
      </section>
      <Card>
        <h2 className="mb-2 text-lg font-bold">Konsolidierung in EUR</h2>
        {totals.length === 0 ? <p className="text-slate">Keine Daten.</p> : consolidated ? (
          <div data-testid="consolidated"><p className="text-xl font-bold">{formatMinor(consolidated.totalMinor, 'EUR')}</p><ul className="text-sm text-slate">{consolidated.rateNotes.map((n) => <li key={n}>{n}</li>)}</ul></div>
        ) : (
          <Notice tone="warn" title="Keine konsolidierte Summe" ><span data-testid="no-consolidation">Für mindestens eine Währung fehlt ein dokumentierter Wechselkurs (mit Quelle und Datum). Summen werden nicht ungekennzeichnet addiert.</span></Notice>
        )}
        <Button className="mt-3" variant="secondary" size="sm" onClick={() => setRateOpen(true)}>Wechselkurs erfassen</Button>
        {rates.length > 0 && <ul className="mt-3 space-y-1 text-sm">{rates.map((r) => <li key={r.id} className="flex items-center gap-2">{r.from_currency}→{r.to_currency}: {r.rate} · {r.source} · {formatDate(r.as_of)}<Button size="sm" variant="ghost" aria-label="Kurs löschen" onClick={() => void remove('fx_rates', r.id)}><Trash2 size={14} aria-hidden /></Button></li>)}</ul>}
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-bold">Kategorien</h2>
        <ul className="divide-y divide-line">{byCategory.map((c) => <li key={c.category} className="flex flex-wrap justify-between gap-2 py-2"><span className="font-semibold">{CATEGORY_LABEL[c.category]}</span><span>{c.totals.map((t) => formatMinor(t.totalMinor, t.currency)).join(' · ')}</span></li>)}</ul>
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-bold">Unterkunftszahlungen (Teilzahlungen)</h2>
        <p className="text-sm text-slate">Verifiziert: {paymentTotals('verified').map((t) => formatMinor(t.totalMinor, t.currency)).join(' · ') || 'keine'}</p>
        <p className="text-sm text-slate">Nicht verifiziert (separat): {paymentTotals('unverified').map((t) => formatMinor(t.totalMinor, t.currency)).join(' · ') || 'keine'}</p>
      </Card>
      <section aria-label="Transaktionen">
        <h2 className="mb-2 text-lg font-bold">Transaktionen</h2>
        {expenses.length === 0 ? <EmptyState icon={<Wallet />} title="Keine Ausgaben" text="Erfasse Tanken, Verpflegung oder Eintritte in der jeweiligen Währung." /> : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {[...expenses].sort((a, b) => b.spent_at.localeCompare(a.spent_at)).map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="expense-row">
                <span className="w-24 text-sm text-slate">{formatDate(x.spent_at, { day: '2-digit', month: 'short' })}</span>
                <span className="min-w-0 flex-1"><strong>{x.description || CATEGORY_LABEL[x.category]}</strong> <Badge>{CATEGORY_LABEL[x.category]}</Badge>{x.is_demo && <Badge tone="demo" className="ml-1">Demo</Badge>}</span>
                <strong>{formatMinor(x.amount_minor, x.currency)}</strong>
                <Button size="sm" variant="ghost" aria-label="Ausgabe löschen" onClick={() => void remove('expenses', x.id)}><Trash2 size={14} aria-hidden /></Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Dialog open={adding} onClose={() => setAdding(false)} title="Ausgabe erfassen">
        <form onSubmit={submit} noValidate className="space-y-4" aria-label="Ausgabe">
          <div>
            <input ref={receiptRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Belegfoto auswählen" tabIndex={-1} onChange={(e) => { const file = e.target.files?.[0]; if (file) setPendingReceipt(file); e.target.value = ''; }} />
            <Button type="button" variant="secondary" size="sm" disabled={isReading} onClick={() => receiptRef.current?.click()}><Camera size={14} aria-hidden /> {isReading ? 'Beleg wird gelesen …' : 'Beleg fotografieren und Werte vorschlagen lassen'}</Button>
            {receiptNote && <div className="mt-2"><Notice tone={receiptNote.tone}><span data-testid="receipt-note">{receiptNote.text}</span></Notice></div>}
          </div>
          <Field label="Beschreibung">{(p) => <Input {...p} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
          <div className="grid grid-cols-3 gap-3"><div className="col-span-2"><Field label="Betrag" error={error}>{(p) => <Input {...p} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />}</Field></div><Field label="Währung">{(p) => <Select {...p} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>}</Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Kategorie">{(p) => <Select {...p} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</Select>}</Field><Field label="Datum">{(p) => <Input {...p} type="date" value={form.spent_at} onChange={(e) => setForm({ ...form, spent_at: e.target.value })} />}</Field></div>
          <div className="flex justify-end"><Button type="submit">Speichern</Button></div>
        </form>
      </Dialog>
      <ConfirmationDialog
        open={pendingReceipt !== null}
        title="Belegfoto an die KI senden?"
        message="Das Foto wird einmal zur Auswertung an den KI-Dienst (Anthropic) gesendet und nirgends gespeichert. Vorgeschlagen werden Betrag, Währung, Datum, Geschäft und Kategorie; gespeichert wird erst, wenn du sie geprüft hast. Sende nur Belege, die du teilen möchtest."
        confirmLabel="Foto senden"
        tone="primary"
        onCancel={() => setPendingReceipt(null)}
        onConfirm={() => pendingReceipt && void readReceipt(pendingReceipt)}
      />
      <Dialog open={rateOpen} onClose={() => setRateOpen(false)} title="Wechselkurs erfassen">
        <form onSubmit={saveRate} noValidate className="space-y-4" aria-label="Wechselkurs">
          <div className="grid grid-cols-2 gap-3"><Field label="Von">{(p) => <Select {...p} value={rate.from} onChange={(e) => setRate({ ...rate, from: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>}</Field><Field label="Nach">{(p) => <Select {...p} value={rate.to} onChange={(e) => setRate({ ...rate, to: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>}</Field></div>
          <Field label="Kurs" error={error}>{(p) => <Input {...p} inputMode="decimal" value={rate.rate} onChange={(e) => setRate({ ...rate, rate: e.target.value })} />}</Field>
          <Field label="Quelle" hint="z. B. Kassenbeleg Wechselstube, Bankabrechnung">{(p) => <Input {...p} value={rate.source} onChange={(e) => setRate({ ...rate, source: e.target.value })} />}</Field>
          <Field label="Stand (Datum)">{(p) => <Input {...p} type="date" value={rate.as_of} onChange={(e) => setRate({ ...rate, as_of: e.target.value })} />}</Field>
          <div>
            <Button type="button" variant="secondary" size="sm" disabled={isLoadingRate || rate.from === rate.to} onClick={() => void loadReferenceRate()}>{isLoadingRate ? 'Lädt …' : 'Aktuellen Referenzkurs laden'}</Button>
            {rateNote && <p role="status" className="mt-2 text-sm text-slate" data-testid="rate-note">{rateNote}</p>}
          </div>
          <div className="flex justify-end"><Button type="submit">Kurs speichern</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
