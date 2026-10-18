import { describe, expect, it } from 'vitest';
import { canShareFiles, findNewIds, photoFileName, photoSrcSet, photoUrl, readSeenIds, writeSeenIds } from '@/features/follow/photo-url';
import { buildFollowerView, tripDays, type FollowSource } from '@/lib/follow/view';

const trip: { title: string; countries: string[]; start_date: string | null; end_date: string | null } = { title: 'Afrika', countries: ['Namibia'], start_date: '2026-10-13', end_date: '2026-11-03' };
const source = (today: string, t = trip): FollowSource => ({
  trip: t,
  stops: [{ id: 'a', sequence: 1, title: 'Windhoek', country: 'Namibia', latitude: -22.5, longitude: 17, arrive_at: '2026-10-13', depart_at: '2026-10-15' }],
  entries: [], media: [], sightings: [], authorNames: {}, speciesNames: {}, today, generatedAt: '2026-10-16T08:00:00.000Z',
});

describe('trip counters for the page header', () => {
  it('counts down to departure before the trip', () => {
    expect(buildFollowerView(source('2026-10-01')).trip).toMatchObject({ status: 'upcoming', day: null, totalDays: 22, daysUntilStart: 12 });
    expect(tripDays(trip, '2026-10-12', 'upcoming').daysUntilStart).toBe(1);
  });

  it('numbers the travel days during the trip, the departure day being day 1', () => {
    expect(buildFollowerView(source('2026-10-13')).trip).toMatchObject({ status: 'ongoing', day: 1, totalDays: 22, daysUntilStart: null });
    expect(buildFollowerView(source('2026-10-23')).trip).toMatchObject({ day: 11 });
    expect(buildFollowerView(source('2026-11-03')).trip).toMatchObject({ status: 'ongoing', day: 22 });
  });

  it('shows no day and no countdown once the trip is over, but keeps its length', () => {
    expect(buildFollowerView(source('2026-11-04')).trip).toMatchObject({ status: 'finished', day: null, totalDays: 22, daysUntilStart: null });
  });

  it('copes with missing dates: no counters instead of wrong ones', () => {
    const undated = { ...trip, start_date: null, end_date: null };
    expect(buildFollowerView(source('2026-10-20', undated)).trip).toMatchObject({ day: null, totalDays: null, daysUntilStart: null });
    expect(tripDays({ ...trip, end_date: null }, '2026-10-20', 'ongoing')).toEqual({ day: 8, totalDays: null, daysUntilStart: null });
  });

  it('exposes larger variants of a place photo for the title picture', () => {
    const library = [{ id: 'i1', place_key: 'windhoek', place_label: 'Windhoek', country: 'Namibia', latitude: -22.5, longitude: 17, radius_km: 50, role: 'card', variants: { thumb: 'w/t.webp', card: 'w/c.webp', mobile: 'w/m.webp', desktop: 'w/d.webp' }, width: 1920, height: 1080, alt_text: 'Windhoek', source_provider: 'x', source_url: 'https://example.test', photographer: 'p', license_type: 'CC0', license_url: '', attribution_text: 'a', location_verified: true, status: 'approved' }] as never;
    const image = buildFollowerView({ ...source('2026-10-14'), library }).stops[0]?.image;
    expect(image?.variantPaths).toEqual({ mobile: 'w/m.webp', desktop: 'w/d.webp' });
  });
});

describe('photo helpers', () => {
  it('builds the picture URLs with the widths the server serves', () => {
    expect(photoUrl('tok/en', 'abc', 960)).toBe('/api/follow/tok%2Fen/media/abc?w=960');
    expect(photoUrl('tok', 'abc', 2400, true)).toBe('/api/follow/tok/media/abc?w=2400&d=1');
    expect(photoSrcSet('tok', 'abc')).toBe('/api/follow/tok/media/abc?w=480 480w, /api/follow/tok/media/abc?w=960 960w, /api/follow/tok/media/abc?w=1600 1600w');
  });

  it('names saved photos by day and id, without anything personal', () => {
    expect(photoFileName({ id: '1a2b3c4d-0000-0000-0000-000000000000', captured_at: '2026-10-21T17:30:00.000Z' })).toBe('Namibia-Botswana-2026-10-21-1a2b3c4d.jpg');
    expect(photoFileName({ id: '1a2b3c4d-0000-0000-0000-000000000000', captured_at: null })).toBe('Namibia-Botswana-1a2b3c4d.jpg');
  });

  it('reports no share support outside a browser that has it', () => {
    expect(canShareFiles()).toBe(false);
  });
});

describe('what is new since the last visit', () => {
  it('flags nothing on a first visit and what was not there before afterwards', () => {
    expect(findNewIds(null, ['a', 'b'])).toEqual([]);
    expect(findNewIds(['a'], ['a', 'b', 'c'])).toEqual(['b', 'c']);
    expect(findNewIds(['a', 'b'], ['a', 'b'])).toEqual([]);
    expect(findNewIds([], ['a'])).toEqual(['a']);
  });

  it('keeps the seen items per link on this device, and survives blocked storage', () => {
    const store = new Map<string, string>();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } } });
    try {
      expect(readSeenIds('abcdefghijklmnop')).toBeNull();
      writeSeenIds('abcdefghijklmnop', ['x', 'y']);
      expect(readSeenIds('abcdefghijklmnop')).toEqual(['x', 'y']);
      expect(readSeenIds('zzzzzzzzzzzzzzzz')).toBeNull();
      store.set('nb-follow-seen:abcdefghij', '{"not":"a list"}');
      expect(readSeenIds('abcdefghijklmnop')).toBeNull();
      Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } } });
      expect(readSeenIds('abcdefghijklmnop')).toBeNull();
      expect(() => writeSeenIds('abcdefghijklmnop', ['x'])).not.toThrow();
    } finally {
      if (original) Object.defineProperty(globalThis, 'window', original);
      else delete (globalThis as { window?: unknown }).window;
    }
  });
});
