import type { SupabaseClient } from '@supabase/supabase-js';
import { MIN_INVITE_TOKEN_LENGTH, sha256Hex } from '@/lib/auth/token';
import { isLinkUsable, type FollowSource, type FollowTrip } from '@/lib/follow/view';
import { log } from './logger';

export interface FollowerLinkRow {
  id: string;
  family_id: string;
  trip_id: string;
  label: string;
  revoked_at: string | null;
  expires_at: string | null;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_ENTRIES = 200;
const MAX_PHOTOS = 300;
const MAX_SIGHTINGS = 300;

/** Calendar day in the travel region. Namibia and Botswana both run on UTC+2 all year. */
export function travelToday(now = new Date()): string {
  return new Date(now.getTime() + 2 * 3600_000).toISOString().slice(0, 10);
}

/** Looks the link up by token hash. Unknown, revoked and expired links are indistinguishable to the caller (null). */
export async function resolveFollowerLink(admin: SupabaseClient, token: string): Promise<FollowerLinkRow | null> {
  if (token.length < MIN_INVITE_TOKEN_LENGTH || token.length > 200 || !TOKEN_PATTERN.test(token)) return null;
  const { data, error } = await admin
    .from('follower_links')
    .select('id, family_id, trip_id, label, revoked_at, expires_at')
    .eq('token_hash', await sha256Hex(token))
    .maybeSingle();
  if (error) throw new Error(`follower link lookup failed: ${error.message}`);
  const link = data as FollowerLinkRow | null;
  return link && isLinkUsable(link) ? link : null;
}

export async function loadTrip(admin: SupabaseClient, tripId: string): Promise<FollowTrip | null> {
  const { data, error } = await admin.from('trips').select('title, countries, start_date, end_date').eq('id', tripId).maybeSingle();
  if (error) throw new Error(`trip lookup failed: ${error.message}`);
  return (data as FollowTrip | null) ?? null;
}

async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${what}: ${error.message}`);
  return (data ?? []) as T[];
}

/** Loads exactly the rows that can be published (opt-in flag, family-visible) for the link's trip, with bounded result sets. */
export async function loadFollowerSource(admin: SupabaseClient, link: FollowerLinkRow): Promise<FollowSource | null> {
  const trip = await loadTrip(admin, link.trip_id);
  if (!trip) return null;
  const [stops, entries, media, sightings] = await Promise.all([
    rows<FollowSource['stops'][number]>(admin.from('trip_stops').select('id, sequence, title, country, latitude, longitude, arrive_at, depart_at').eq('trip_id', link.trip_id).order('sequence'), 'stops'),
    rows<FollowSource['entries'][number]>(
      admin.from('journal_entries').select('id, stop_id, author_user_id, entry_date, title, body, visibility, status, shared_with_followers')
        .eq('trip_id', link.trip_id).eq('shared_with_followers', true).eq('visibility', 'family').eq('status', 'published').order('entry_date', { ascending: false }).limit(MAX_ENTRIES),
      'journal',
    ),
    rows<FollowSource['media'][number]>(
      admin.from('media_assets').select('id, stop_id, kind, captured_at, caption, visibility, shared_with_followers')
        .eq('trip_id', link.trip_id).eq('shared_with_followers', true).eq('visibility', 'family').eq('kind', 'photo').order('captured_at', { ascending: false }).limit(MAX_PHOTOS),
      'media',
    ),
    rows<FollowSource['sightings'][number]>(
      admin.from('wildlife_sightings').select('id, stop_id, species_id, seen_at, count, notes, shared_with_followers')
        .eq('trip_id', link.trip_id).eq('shared_with_followers', true).order('seen_at', { ascending: false }).limit(MAX_SIGHTINGS),
      'sightings',
    ),
  ]);

  const authorIds = [...new Set(entries.map((e) => e.author_user_id))];
  const speciesIds = [...new Set(sightings.map((s) => s.species_id))];
  const [profiles, species] = await Promise.all([
    authorIds.length ? rows<{ user_id: string; display_name: string }>(admin.from('profiles').select('user_id, display_name').in('user_id', authorIds), 'profiles') : Promise.resolve([]),
    speciesIds.length ? rows<{ id: string; common_name_de: string }>(admin.from('wildlife_species').select('id, common_name_de').in('id', speciesIds), 'species') : Promise.resolve([]),
  ]);

  return {
    trip,
    stops,
    entries,
    media,
    sightings,
    authorNames: Object.fromEntries(profiles.map((p) => [p.user_id, p.display_name])),
    speciesNames: Object.fromEntries(species.map((s) => [s.id, s.common_name_de])),
    today: travelToday(),
    generatedAt: new Date().toISOString(),
  };
}

/** Counts a visit. Failures are logged, never shown to the follower. */
export async function recordVisit(admin: SupabaseClient, linkId: string, requestId: string): Promise<void> {
  const { error } = await admin.rpc('touch_follower_link', { p_link_id: linkId });
  if (error) log('warn', 'follower visit not recorded', { requestId, linkId, detail: error.message });
}
