/**
 * What a follower (someone with a private link, no account) may see. This module is the single place that decides it:
 * the server route feeds it database rows, the demo preview feeds it local data. It picks fields explicitly and
 * drops everything that is not meant for followers (bookings, prices, documents, addresses, GPS, private items).
 */

import { imagesForStop, type DestinationImage } from '@/lib/media/places';

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

/** The library photo of a place, as far as followers may see it (public reference imagery, never family media). */
export type FollowLibraryInput = DestinationImage;

export interface FollowSource {
  trip: FollowTrip;
  stops: FollowStopInput[];
  entries: FollowEntryInput[];
  media: FollowMediaInput[];
  sightings: FollowSightingInput[];
  /** Approved destination photos; optional, without them the view simply has no pictures of the places. */
  library?: FollowLibraryInput[];
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
  image: FollowerStopImage | null;
}

export interface FollowerStopImage {
  /** Paths below /media/destination/. */
  path: string;
  thumbPath: string | null;
  alt: string;
  /** True when the photo shows the region rather than proven this exact place. */
  isRegionMotif: boolean;
  /** Larger variants for a full-width picture (mobile 800, tablet 1200, desktop 1920 px wide), as far as they exist. */
  variantPaths: Partial<Record<'mobile' | 'tablet' | 'desktop', string>>;
}

export interface FollowerView {
  trip: {
    title: string;
    countries: string[];
    status: 'upcoming' | 'ongoing' | 'finished';
    /** Travel day number (1 = departure day) while the trip runs, else null. */
    day: number | null;
    /** Length of the trip in days, when start and end date are known. */
    totalDays: number | null;
    /** Days until departure while the trip has not begun, else null. */
    daysUntilStart: number | null;
  };
  generatedAt: string;
  stops: FollowerStop[];
  currentStopId: string | null;
  entries: { id: string; title: string; body: string; entry_date: string; author: string | null; stop: string | null }[];
  photos: { id: string; caption: string; captured_at: string | null; stop: string | null }[];
  sightings: { id: string; species: string; seen_at: string; count: number | null; notes: string; stop: string | null }[];
  /** Credits (author, licence, source) of the library photos shown above. */
  imageCredits: { place: string; text: string; url: string }[];
}

const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000);

/** Counters for the page header: which day it is, how long the trip is, how many days are left until departure. */
export function tripDays(trip: FollowTrip, today: string, status: FollowerView['trip']['status']): Pick<FollowerView['trip'], 'day' | 'totalDays' | 'daysUntilStart'> {
  const total = trip.start_date && trip.end_date ? dayNumber(trip.end_date) - dayNumber(trip.start_date) + 1 : null;
  const day = status === 'ongoing' && trip.start_date ? dayNumber(today) - dayNumber(trip.start_date) + 1 : null;
  return {
    day: day !== null && day >= 1 ? (total !== null ? Math.min(day, total) : day) : null,
    totalDays: total !== null && total > 0 ? total : null,
    daysUntilStart: status === 'upcoming' && trip.start_date ? Math.max(0, dayNumber(trip.start_date) - dayNumber(today)) : null,
  };
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
  // Place photos only for stops that are visible anyway, so no future stop leaks through its picture.
  const credits = new Map<string, { place: string; text: string; url: string }>();
  const imageOf = (stop: FollowStopInput): FollowerStopImage | null => {
    const images = imagesForStop(stop, source.library ?? []);
    const picked = images.card ?? images.hero ?? images.gallery[0];
    if (!picked) return null;
    const path = picked.variants.card ?? picked.variants.tablet ?? picked.variants.full ?? Object.values(picked.variants)[0];
    if (!path) return null;
    credits.set(picked.id, { place: picked.place_label, text: picked.attribution_text, url: picked.source_url });
    const variantPaths = Object.fromEntries((['mobile', 'tablet', 'desktop'] as const).flatMap((key) => (picked.variants[key] ? [[key, picked.variants[key]]] : [])));
    return { path, thumbPath: picked.variants.thumb ?? null, alt: picked.alt_text, isRegionMotif: !picked.location_verified, variantPaths };
  };
  const stopViews = stops.map((s) => ({ id: s.id, sequence: s.sequence, title: s.title, country: s.country, latitude: s.latitude, longitude: s.longitude, arrive_at: s.arrive_at, depart_at: s.depart_at, image: imageOf(s) }));

  return {
    trip: { title: trip.title, countries: trip.countries, status, ...tripDays(trip, today, status) },
    generatedAt: source.generatedAt,
    stops: stopViews,
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
    imageCredits: [...credits.values()].sort((a, b) => a.place.localeCompare(b.place, 'de')),
  };
}

/** Link status check shared by the view and media routes. */
export function isLinkUsable(link: { revoked_at: string | null; expires_at: string | null }, now = Date.now()): boolean {
  if (link.revoked_at) return false;
  return !link.expires_at || Date.parse(link.expires_at) > now;
}
