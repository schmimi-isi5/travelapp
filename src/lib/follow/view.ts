/**
 * What a follower (someone with a private link, no account) may see. This module is the single place that decides it:
 * the server route feeds it database rows, the demo preview feeds it local data. It picks fields explicitly and
 * drops everything that is not meant for followers (bookings, prices, documents, addresses, GPS, private items).
 */

export interface FollowTrip {
  title: string;
  countries: string[];
  start_date: string | null;
  end_date: string | null;
}

export interface FollowStopInput {
  id: string;
  sequence: number;
  title: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  arrive_at: string | null;
  depart_at: string | null;
}

export interface FollowEntryInput {
  id: string;
  stop_id: string | null;
  author_user_id: string;
  entry_date: string;
  title: string | null;
  body: string;
  visibility: string;
  status: string;
  shared_with_followers: boolean;
}

export interface FollowMediaInput {
  id: string;
  stop_id: string | null;
  kind: string;
  captured_at: string | null;
  caption: string | null;
  visibility: string;
  shared_with_followers: boolean;
}

export interface FollowSightingInput {
  id: string;
  stop_id: string | null;
  species_id: string;
  seen_at: string;
  count: number | null;
  notes: string | null;
  shared_with_followers: boolean;
}

export interface FollowSource {
  trip: FollowTrip;
  stops: FollowStopInput[];
  entries: FollowEntryInput[];
  media: FollowMediaInput[];
  sightings: FollowSightingInput[];
  /** user id -> display name (only the first name is exposed). */
  authorNames: Record<string, string>;
  /** species id -> German common name. */
  speciesNames: Record<string, string>;
  /** Calendar day (YYYY-MM-DD) used to decide which stops have been reached. */
  today: string;
  generatedAt: string;
}

export interface FollowerStop {
  id: string;
  sequence: number;
  title: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  arrive_at: string | null;
  depart_at: string | null;
}

export interface FollowerView {
  trip: { title: string; countries: string[]; status: 'upcoming' | 'ongoing' | 'finished' };
  generatedAt: string;
  stops: FollowerStop[];
  currentStopId: string | null;
  entries: { id: string; title: string; body: string; entry_date: string; author: string | null; stop: string | null }[];
  photos: { id: string; caption: string; captured_at: string | null; stop: string | null }[];
  sightings: { id: string; species: string; seen_at: string; count: number | null; notes: string; stop: string | null }[];
}

function tripStatus(trip: FollowTrip, visibleStops: number, today: string): FollowerView['trip']['status'] {
  if (trip.end_date && today > trip.end_date) return 'finished';
  if (visibleStops > 0) return 'ongoing';
  if (trip.start_date && today >= trip.start_date) return 'ongoing';
  return 'upcoming';
}

/** Stops the travellers have reached (arrival day has come), or all of them once the trip is over. Future stops stay hidden. */
export function visibleStops(trip: FollowTrip, stops: FollowStopInput[], today: string): FollowStopInput[] {
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  if (trip.end_date && today > trip.end_date) return ordered;
  return ordered.filter((stop) => stop.arrive_at !== null && stop.arrive_at <= today);
}

/** Single-stop variant of visibleStops, for routes that check one item at a time. */
export function isStopVisible(trip: FollowTrip, stop: Pick<FollowStopInput, 'arrive_at'>, today: string): boolean {
  if (trip.end_date && today > trip.end_date) return true;
  return stop.arrive_at !== null && stop.arrive_at <= today;
}

function currentStop(visible: FollowStopInput[], today: string, isFinished: boolean): FollowStopInput | null {
  if (isFinished || visible.length === 0) return null;
  const staying = visible.find((s) => s.arrive_at !== null && s.arrive_at <= today && (s.depart_at === null ? false : today <= s.depart_at));
  return staying ?? visible[visible.length - 1] ?? null;
}

function firstName(displayName: string | undefined): string | null {
  const name = displayName?.trim().split(/\s+/)[0];
  return name ? name : null;
}

const byDateDesc = <T,>(date: (item: T) => string) => (a: T, b: T) => date(b).localeCompare(date(a));

export function buildFollowerView(source: FollowSource): FollowerView {
  const { trip, today } = source;
  const stops = visibleStops(trip, source.stops, today);
  const status = tripStatus(trip, stops.length, today);
  const stopTitles = new Map(stops.map((s) => [s.id, s.title]));
  // An item that belongs to a stop the followers may not see yet is held back as well.
  const isReachable = (stopId: string | null) => stopId === null || stopTitles.has(stopId);
  const stopTitle = (stopId: string | null) => (stopId ? (stopTitles.get(stopId) ?? null) : null);
  const current = currentStop(stops, today, status === 'finished');

  return {
    trip: { title: trip.title, countries: trip.countries, status },
    generatedAt: source.generatedAt,
    stops: stops.map((s) => ({ id: s.id, sequence: s.sequence, title: s.title, country: s.country, latitude: s.latitude, longitude: s.longitude, arrive_at: s.arrive_at, depart_at: s.depart_at })),
    currentStopId: current?.id ?? null,
    entries: source.entries
      .filter((e) => e.shared_with_followers && e.visibility === 'family' && e.status === 'published' && isReachable(e.stop_id))
      .sort(byDateDesc((e) => e.entry_date))
      .map((e) => ({ id: e.id, title: e.title?.trim() || 'Ohne Titel', body: e.body, entry_date: e.entry_date, author: firstName(source.authorNames[e.author_user_id]), stop: stopTitle(e.stop_id) })),
    photos: source.media
      .filter((m) => m.shared_with_followers && m.visibility === 'family' && m.kind === 'photo' && isReachable(m.stop_id))
      .sort(byDateDesc((m) => m.captured_at ?? ''))
      .map((m) => ({ id: m.id, caption: m.caption ?? '', captured_at: m.captured_at, stop: stopTitle(m.stop_id) })),
    sightings: source.sightings
      .filter((s) => s.shared_with_followers && isReachable(s.stop_id))
      .sort(byDateDesc((s) => s.seen_at))
      .map((s) => ({ id: s.id, species: source.speciesNames[s.species_id] ?? 'Unbekannte Art', seen_at: s.seen_at, count: s.count, notes: s.notes ?? '', stop: stopTitle(s.stop_id) })),
  };
}

/** Link status check shared by the view and media routes. */
export function isLinkUsable(link: { revoked_at: string | null; expires_at: string | null }, now = Date.now()): boolean {
  if (link.revoked_at) return false;
  return !link.expires_at || Date.parse(link.expires_at) > now;
}
