import type { JournalEntry, TravelTip, TripStop, WildlifeSighting, WildlifeSpecies, Booking } from '@/lib/domain/schemas';

export interface SearchHit {
  id: string;
  kind: 'journal' | 'sighting' | 'stop' | 'tip' | 'booking';
  title: string;
  snippet: string;
  date: string | null;
  stopId: string | null;
  personId: string | null;
}

function normalize(text: string): string {
  return text.toLocaleLowerCase('de-DE').normalize('NFD').replace(/\p{M}/gu, '');
}

/** A search term also matches its singular-ish stem, so "Elefanten" finds "Elefant". */
function variants(term: string): string[] {
  const stem = term.length > 5 ? term.replace(/(en|er|n|e|s)$/, '') : term;
  return stem === term ? [term] : [term, stem];
}

function snippet(text: string, terms: string[]): string {
  const norm = normalize(text);
  const at = Math.max(0, ...terms.flatMap(variants).map((t) => norm.indexOf(t)).filter((i) => i >= 0).slice(0, 1));
  return (at > 40 ? '…' : '') + text.slice(Math.max(0, at - 40), at + 120).trim() + (text.length > at + 120 ? '…' : '');
}

export interface SearchSources {
  journal: JournalEntry[];
  sightings: WildlifeSighting[];
  species: WildlifeSpecies[];
  stops: TripStop[];
  tips: TravelTip[];
  bookings: Booking[];
}

/** Full-text search over text content on the device. All terms must match (AND), accents/case ignored. */
export function searchArchive(query: string, src: SearchSources): SearchHit[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];
  const add = (hit: Omit<SearchHit, 'snippet'>, text: string) => {
    const norm = normalize(text);
    if (terms.length === 0 || terms.every((t) => variants(t).some((v) => norm.includes(v)))) hits.push({ ...hit, snippet: snippet(text, terms) });
  };
  for (const e of src.journal) add({ id: e.id, kind: 'journal', title: e.title, date: e.entry_date, stopId: e.stop_id, personId: e.author_user_id }, `${e.title} ${e.body}`);
  for (const s of src.sightings) {
    const name = src.species.find((sp) => sp.id === s.species_id)?.common_name_de ?? 'Unbekannte Art';
    add({ id: s.id, kind: 'sighting', title: `Sichtung: ${name}`, date: s.seen_at.slice(0, 10), stopId: s.stop_id, personId: s.recorded_by }, `${name} ${s.notes}`);
  }
  for (const s of src.stops) add({ id: s.id, kind: 'stop', title: s.title, date: s.arrive_at, stopId: s.id, personId: null }, `${s.title} ${s.country} ${s.summary} ${s.highlights.join(' ')}`);
  for (const t of src.tips) add({ id: t.id, kind: 'tip', title: t.title, date: null, stopId: t.stop_id, personId: null }, `${t.title} ${t.body}`);
  for (const b of src.bookings) add({ id: b.id, kind: 'booking', title: b.title, date: b.starts_at, stopId: b.stop_id, personId: null }, `${b.title} ${b.notes ?? ''}`);
  return hits.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}
