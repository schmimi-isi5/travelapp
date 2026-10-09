'use client';

import { MapPin, Phone, Plus, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Card, Dialog, Field, Input, Notice, PageHeader, Select, Textarea } from '@/components/ui';
import { TipCard } from '@/features/ai/tip-card';
import { DocumentVault } from '@/features/safety/document-vault';
import { useTable, useTips } from '@/lib/db/hooks';
import { create, remove } from '@/lib/db/repo';
import { isAdult } from '@/lib/domain/policy';

const BREAKDOWN_STEPS = [
  'Sicher anhalten, Warnblinker an, Warndreieck aufstellen.',
  'Bei Wildtieren in der Nähe im Fahrzeug bleiben.',
  'Standort notieren und Vermieter-Pannenhilfe anrufen (Nummer unten eintragen).',
  'Wasser, Schatten und Erste-Hilfe-Set bereithalten.',
  'Reifen, Reserverad und Wagenheber vor der Abfahrt prüfen.',
];

const TYPE_LABEL: Record<string, string> = { emergency: 'Notruf', medical: 'Medizin', embassy: 'Botschaft', rental: 'Mietwagen', lodging: 'Unterkunft', insurance: 'Versicherung', family: 'Familie' };

export default function SafetyPage() {
  const { role, tripId } = useApp();
  const contacts = useTable('emergency_contacts').rows;
  const tips = useTips().rows.filter((t) => ['border', 'health', 'insurance'].includes(t.category));
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', type: 'emergency', notes: '' });
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  function share() {
    setGeoError(null);
    if (!navigator.geolocation) return setGeoError('Standort wird von diesem Gerät nicht unterstützt.');
    navigator.geolocation.getCurrentPosition(
      (p) => setPosition(`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`),
      () => setGeoError('Standortfreigabe verweigert oder nicht verfügbar. Es wird nichts gespeichert oder gesendet.'),
      { timeout: 10_000 },
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setError('Name erforderlich');
    await create('emergency_contacts', { trip_id: tripId, name: form.name.trim(), phone: form.phone.trim(), type: form.type as 'emergency', notes: form.notes, available_offline: true });
    setAdding(false);
    setForm({ name: '', phone: '', type: 'emergency', notes: '' });
    setError(null);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Sicherheit" subtitle="Notfallkontakte sind offline verfügbar. Dokumente liegen im geschützten Tresor." actions={isAdult(role) && <Button onClick={() => setAdding(true)}><Plus size={18} aria-hidden /> Kontakt hinzufügen</Button>} />
      <section aria-labelledby="contacts-h">
        <h2 id="contacts-h" className="mb-3 text-lg font-bold">Notfallkontakte</h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {contacts.map((c) => (
            <li key={c.id} className="rounded-lg border border-line bg-white p-4 shadow-card" data-testid="contact">
              <div className="flex items-start justify-between gap-2"><div><Badge tone="danger">{TYPE_LABEL[c.type]}</Badge>{c.is_demo && <Badge tone="demo" className="ml-1">Platzhalter</Badge>}<h3 className="mt-1 font-bold">{c.name}</h3></div>{isAdult(role) && <Button size="sm" variant="ghost" aria-label={`${c.name} löschen`} onClick={() => void remove('emergency_contacts', c.id)}><Trash2 size={14} aria-hidden /></Button>}</div>
              <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="mt-1 inline-flex min-h-11 items-center gap-2 text-lg font-bold text-deep"><Phone size={16} aria-hidden /> {c.phone || 'keine Nummer'}</a>
              {c.notes && <p className="text-sm text-slate">{c.notes}</p>}
            </li>
          ))}
        </ul>
        <div className="mt-3"><Notice tone="warn">Die hinterlegten Nummern sind Platzhalter. Trage vor der Reise echte, geprüfte Nummern ein.</Notice></div>
      </section>
      <Card>
        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><MapPin size={18} aria-hidden /> Standort teilen (optional)</h2>
        <p className="text-sm text-slate">Nur auf Knopfdruck, einmalig, ohne Hintergrund-Tracking. Der Standort wird nicht gespeichert; du kannst ihn kopieren und selbst senden.</p>
        <Button className="mt-3" variant="secondary" onClick={share}>Aktuellen Standort anzeigen</Button>
        {position && <p className="mt-2 font-mono" data-testid="position">{position}</p>}
        {geoError && <p role="alert" className="mt-2 text-sm text-danger">{geoError}</p>}
      </Card>
      <Card>
        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><Wrench size={18} aria-hidden /> Pannen-Checkliste</h2>
        <ol className="list-decimal space-y-1 pl-5 text-[15px]">{BREAKDOWN_STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
        <p className="mt-2 text-xs text-muted">Allgemeine Orientierung, redaktionell, nicht verifiziert. Keine verbindliche Anweisung.</p>
      </Card>
      <section aria-labelledby="hints-h">
        <h2 id="hints-h" className="mb-3 text-lg font-bold">Grenz-, Versicherungs- und Gesundheitshinweise</h2>
        <div className="grid gap-3 md:grid-cols-2">{tips.map((t) => <TipCard key={t.id} tip={t} />)}</div>
        <p className="mt-2 text-sm text-muted">Keine medizinischen Ratschläge. Aktualität jeweils mit der angegebenen Quelle prüfen.</p>
      </section>
      <section aria-labelledby="vault-h"><h2 id="vault-h" className="mb-3 text-lg font-bold">Dokumenten-Tresor</h2><DocumentVault /></section>
      <Dialog open={adding} onClose={() => setAdding(false)} title="Notfallkontakt hinzufügen">
        <form onSubmit={submit} noValidate className="space-y-4" aria-label="Kontakt">
          <Field label="Name" error={error}>{(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
          <Field label="Telefon">{(p) => <Input {...p} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</Field>
          <Field label="Art">{(p) => <Select {...p} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
          <Field label="Notiz">{(p) => <Textarea {...p} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}</Field>
          <div className="flex justify-end"><Button type="submit">Speichern</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
