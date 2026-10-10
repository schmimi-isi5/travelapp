'use client';

import { Heart, PawPrint, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Chip, Dialog, EmptyState, Field, Input, PageHeader, Select, Textarea, Toolbar } from '@/components/ui';
import { FollowerShareToggle } from '@/features/follow/share-toggle';
import { MediaBody } from '@/features/media/media-tile';
import { addMedia, MediaError } from '@/lib/db/media';
import { useTable } from '@/lib/db/hooks';
import { create, remove, update } from '@/lib/db/repo';
import { canEditOwnedRow } from '@/lib/domain/policy';
import { formatDateTime } from '@/lib/formatting';

function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function SightingsPage() {
  const { tripId, familyId, currentUser, members, role } = useApp();
  const species = useTable('wildlife_species').rows;
  const sightings = useTable('wildlife_sightings').rows;
  const stops = useTable('trip_stops').rows;
  const media = useTable('media_assets').rows;
  const favorites = useTable('sighting_favorites').rows;
  const [speciesFilter, setSpeciesFilter] = useState('all');
  const [stopFilter, setStopFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ species_id: '', seen_at: nowLocalInput(), stop_id: '', count: '', notes: '', newSpecies: '' });
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const me = currentUser?.id ?? '';
  const sortedSpecies = [...species].sort((a, b) => a.common_name_de.localeCompare(b.common_name_de, 'de'));
  const countFor = (id: string) => sightings.filter((s) => s.species_id === id).length;
  const myFavs = new Set(favorites.filter((f) => f.user_id === me).map((f) => f.species_id));

  const log = sightings
    .filter((s) => (speciesFilter === 'all' ? true : s.species_id === speciesFilter))
    .filter((s) => (stopFilter === 'all' ? true : s.stop_id === stopFilter))
    .sort((a, b) => b.seen_at.localeCompare(a.seen_at));

  async function toggleFav(speciesId: string) {
    const existing = favorites.find((f) => f.species_id === speciesId && f.user_id === me);
    if (existing) await remove('sighting_favorites', existing.id);
    else await create('sighting_favorites', { species_id: speciesId, user_id: me });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    let speciesId = form.species_id;
    if (!speciesId && !form.newSpecies.trim()) return setError('Bitte eine Art wählen oder neu anlegen.');
    const countValue = form.count.trim() ? Number(form.count) : null;
    if (countValue !== null && (!Number.isInteger(countValue) || countValue < 1)) return setError('Anzahl muss eine ganze Zahl ab 1 sein.');
    setError(null);
    if (!speciesId) speciesId = (await create('wildlife_species', { common_name_de: form.newSpecies.trim(), scientific_name: null })).id;
    let mediaId: string | null = null;
    const file = fileRef.current?.files?.[0];
    if (file) {
      try {
        mediaId = (await addMedia({ file, familyId, tripId, stopId: form.stop_id || null, caption: 'Tiersichtung', album: 'Tiersichtungen' })).id;
      } catch (err) {
        return setError(err instanceof MediaError ? err.message : 'Bild konnte nicht gespeichert werden.');
      }
    }
    await create('wildlife_sightings', { trip_id: tripId, stop_id: form.stop_id || null, species_id: speciesId, seen_at: new Date(form.seen_at).toISOString(), recorded_by: me, count: countValue, notes: form.notes, media_id: mediaId });
    setAdding(false);
    setForm({ species_id: '', seen_at: nowLocalInput(), stop_id: '', count: '', notes: '', newSpecies: '' });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Safari-Tracker" subtitle="Gemeinsame Artenliste und chronologisches Sichtungslog." actions={<Button onClick={() => setAdding(true)}><Plus size={18} aria-hidden /> Sichtung eintragen</Button>} />
      <section aria-label="Arten" className="mb-6">
        <ul className="flex flex-wrap gap-2">
          {sortedSpecies.map((sp) => (
            <li key={sp.id} className="flex items-center rounded-full border border-line bg-white" data-testid="species-chip">
              <button type="button" aria-pressed={speciesFilter === sp.id} onClick={() => setSpeciesFilter(speciesFilter === sp.id ? 'all' : sp.id)} className={`min-h-10 rounded-l-full px-4 text-sm font-semibold ${speciesFilter === sp.id ? 'bg-deep text-white' : ''}`}>
                {sp.common_name_de} <span className="ml-1 rounded-full bg-sand px-1.5 text-xs text-slate">{countFor(sp.id)}</span>
              </button>
              <button type="button" aria-pressed={myFavs.has(sp.id)} aria-label={`${sp.common_name_de} als persönlichen Favoriten ${myFavs.has(sp.id) ? 'entfernen' : 'markieren'}`} onClick={() => void toggleFav(sp.id)} className="grid size-10 place-items-center rounded-r-full"><Heart size={16} aria-hidden className={myFavs.has(sp.id) ? 'fill-clay text-clay' : 'text-muted'} /></button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-muted">{sightings.length} Sichtungen · {new Set(sightings.map((s) => s.species_id)).size} von {species.length} Arten gesehen</p>
      </section>
      <Toolbar>
        <Select aria-label="Nach Station filtern" value={stopFilter} onChange={(e) => setStopFilter(e.target.value)} className="w-auto min-w-48"><option value="all">Alle Stationen</option>{[...stops].sort((a, b) => a.sequence - b.sequence).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</Select>
        {speciesFilter !== 'all' && <Chip active onClick={() => setSpeciesFilter('all')}>Filter zurücksetzen</Chip>}
      </Toolbar>
      {log.length === 0 ? (
        <EmptyState icon={<PawPrint />} title="Keine Sichtungen" text="Trage die erste Tiersichtung ein, gern mit Uhrzeit, Anzahl und Foto." action={<Button onClick={() => setAdding(true)}>Sichtung eintragen</Button>} />
      ) : (
        <ol className="space-y-3" aria-label="Sichtungslog">
          {log.map((s) => {
            const sp = species.find((x) => x.id === s.species_id);
            const img = media.find((m) => m.id === s.media_id);
            return (
              <li key={s.id} className="flex gap-4 rounded-lg border border-line bg-white p-4 shadow-card" data-testid="sighting-row">
                {img && <div className="size-20 shrink-0 overflow-hidden rounded-md"><MediaBody asset={img} /></div>}
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold">{sp?.common_name_de ?? 'Unbekannte Art'}{s.count ? ` × ${s.count}` : ''}</h3>
                  <p className="text-sm text-slate">{formatDateTime(s.seen_at)} · {stops.find((x) => x.id === s.stop_id)?.title ?? 'ohne Station'} · {members.find((m) => m.id === s.recorded_by)?.display_name ?? 'Unbekannt'}</p>
                  {s.notes && <p className="mt-1 text-sm">{s.notes}</p>}
                  {s.is_demo && <Badge tone="demo" className="mt-1">Demo</Badge>}
                  <FollowerShareToggle checked={s.shared_with_followers} label="Für Follower freigeben" onChange={async (next) => void (await update('wildlife_sightings', s.id, { shared_with_followers: next }))} />
                </div>
                {currentUser && canEditOwnedRow(role, s.recorded_by, currentUser.id) && <Button size="sm" variant="ghost" onClick={() => void remove('wildlife_sightings', s.id)}>Löschen</Button>}
              </li>
            );
          })}
        </ol>
      )}
      <Dialog open={adding} onClose={() => setAdding(false)} title="Sichtung eintragen">
        <form onSubmit={submit} noValidate className="space-y-4" aria-label="Sichtung">
          <Field label="Art">{(p) => <Select {...p} value={form.species_id} onChange={(e) => setForm({ ...form, species_id: e.target.value })}><option value="">Art wählen …</option>{sortedSpecies.map((sp) => <option key={sp.id} value={sp.id}>{sp.common_name_de}</option>)}</Select>}</Field>
          {!form.species_id && <Field label="Oder neue Art" hint="Nur wenn nicht in der Liste.">{(p) => <Input {...p} value={form.newSpecies} onChange={(e) => setForm({ ...form, newSpecies: e.target.value })} />}</Field>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Zeitpunkt">{(p) => <Input {...p} type="datetime-local" value={form.seen_at} onChange={(e) => setForm({ ...form, seen_at: e.target.value })} />}</Field>
            <Field label="Anzahl (optional)">{(p) => <Input {...p} inputMode="numeric" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />}</Field>
          </div>
          <Field label="Station">{(p) => <Select {...p} value={form.stop_id} onChange={(e) => setForm({ ...form, stop_id: e.target.value })}><option value="">Keine</option>{[...stops].sort((a, b) => a.sequence - b.sequence).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</Select>}</Field>
          <Field label="Foto (optional)">{(p) => <Input {...p} ref={fileRef} type="file" accept="image/*" />}</Field>
          <Field label="Notiz">{(p) => <Textarea {...p} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />}</Field>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end"><Button type="submit">Speichern</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
