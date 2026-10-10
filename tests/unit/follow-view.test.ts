import { describe, expect, it } from 'vitest';
import { buildFollowerView, isLinkUsable, type FollowSource } from '@/lib/follow/view';

const stop = (id: string, sequence: number, arrive: string | null, depart: string | null) => ({
  id, sequence, title: `Ort ${id}`, country: 'Namibia', latitude: -22 - sequence, longitude: 17 + sequence, arrive_at: arrive, depart_at: depart,
});

function source(overrides: Partial<FollowSource> = {}): FollowSource {
  return {
    trip: { title: 'Afrika', countries: ['Namibia', 'Botswana'], start_date: '2026-10-13', end_date: '2026-10-30' },
    stops: [stop('a', 1, '2026-10-13', '2026-10-15'), stop('b', 2, '2026-10-15', '2026-10-18'), stop('c', 3, '2026-10-18', '2026-10-20')],
    entries: [],
    media: [],
    sightings: [],
    authorNames: { u1: 'Anna Beispiel' },
    speciesNames: { s1: 'Elefant' },
    today: '2026-10-16',
    generatedAt: '2026-10-16T08:00:00.000Z',
    ...overrides,
  };
}

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'e1', stop_id: 'a', author_user_id: 'u1', entry_date: '2026-10-14', title: 'Tag 1', body: 'Text', visibility: 'family', status: 'published', shared_with_followers: true, ...over,
});

describe('follower view: stops', () => {
  it('shows reached stops only and marks the one the family is in', () => {
    const view = buildFollowerView(source());
    expect(view.stops.map((s) => s.id)).toEqual(['a', 'b']);
    expect(view.currentStopId).toBe('b');
    expect(view.trip.status).toBe('ongoing');
  });

  it('never reveals future stops before the trip, only the trip title', () => {
    const view = buildFollowerView(source({ today: '2026-10-01' }));
    expect(view.stops).toEqual([]);
    expect(view.currentStopId).toBeNull();
    expect(view.trip.status).toBe('upcoming');
  });

  it('shows the whole route once the trip is over', () => {
    const view = buildFollowerView(source({ today: '2026-11-02' }));
    expect(view.stops).toHaveLength(3);
    expect(view.trip.status).toBe('finished');
    expect(view.currentStopId).toBeNull();
  });

  it('keeps the latest reached stop as current between two stays', () => {
    const view = buildFollowerView(source({ stops: [stop('a', 1, '2026-10-13', '2026-10-14'), stop('b', 2, '2026-10-18', null)], today: '2026-10-16' }));
    expect(view.currentStopId).toBe('a');
  });

  it('exposes no booking, price or address fields on a stop', () => {
    const noisy = { ...stop('a', 1, '2026-10-13', null), address: 'Hidden Lodge 1', price_minor: 5000, booking_ref: 'XYZ' };
    const view = buildFollowerView(source({ stops: [noisy] }));
    expect(Object.keys(view.stops[0]!).sort()).toEqual(['arrive_at', 'country', 'depart_at', 'id', 'latitude', 'longitude', 'sequence', 'title']);
  });
});

describe('follower view: published content', () => {
  it('includes only items explicitly shared, published and not private', () => {
    const view = buildFollowerView(source({
      entries: [entry(), entry({ id: 'e2', shared_with_followers: false }), entry({ id: 'e3', visibility: 'private' }), entry({ id: 'e4', status: 'draft' })],
      media: [
        { id: 'm1', stop_id: 'a', kind: 'photo', captured_at: '2026-10-14T10:00:00Z', caption: 'Düne', visibility: 'family', shared_with_followers: true },
        { id: 'm2', stop_id: 'a', kind: 'photo', captured_at: null, caption: '', visibility: 'family', shared_with_followers: false },
        { id: 'm3', stop_id: 'a', kind: 'video', captured_at: null, caption: '', visibility: 'family', shared_with_followers: true },
        { id: 'm4', stop_id: 'a', kind: 'photo', captured_at: null, caption: '', visibility: 'private', shared_with_followers: true },
      ],
      sightings: [
        { id: 's-1', stop_id: 'a', species_id: 's1', seen_at: '2026-10-14T17:00:00Z', count: 4, notes: 'Herde', shared_with_followers: true },
        { id: 's-2', stop_id: 'a', species_id: 's1', seen_at: '2026-10-14T18:00:00Z', count: 1, notes: '', shared_with_followers: false },
      ],
    }));
    expect(view.entries.map((e) => e.id)).toEqual(['e1']);
    expect(view.photos.map((p) => p.id)).toEqual(['m1']);
    expect(view.sightings.map((s) => s.id)).toEqual(['s-1']);
    expect(view.sightings[0]).toMatchObject({ species: 'Elefant', count: 4, stop: 'Ort a' });
  });

  it('shows only the author first name and never journal GPS', () => {
    const view = buildFollowerView(source({ entries: [{ ...entry(), location: { latitude: 1, longitude: 2 } } as never] }));
    expect(view.entries[0]!.author).toBe('Anna');
    expect(JSON.stringify(view)).not.toContain('latitude":1');
    expect(Object.keys(view.entries[0]!).sort()).toEqual(['author', 'body', 'entry_date', 'id', 'stop', 'title']);
  });

  it('holds back items of stops that have not been reached yet', () => {
    const view = buildFollowerView(source({ entries: [entry({ id: 'future', stop_id: 'c' })] }));
    expect(view.entries).toEqual([]);
  });

  it('sorts newest first and labels untitled entries', () => {
    const view = buildFollowerView(source({ entries: [entry({ id: 'old', entry_date: '2026-10-13' }), entry({ id: 'new', entry_date: '2026-10-15', title: '  ' })] }));
    expect(view.entries.map((e) => e.id)).toEqual(['new', 'old']);
    expect(view.entries[0]!.title).toBe('Ohne Titel');
  });
});

describe('link usability', () => {
  const now = Date.parse('2026-10-16T00:00:00Z');
  it('rejects revoked and expired links, accepts open and future-dated ones', () => {
    expect(isLinkUsable({ revoked_at: '2026-10-15T00:00:00Z', expires_at: null }, now)).toBe(false);
    expect(isLinkUsable({ revoked_at: null, expires_at: '2026-10-15T00:00:00Z' }, now)).toBe(false);
    expect(isLinkUsable({ revoked_at: null, expires_at: null }, now)).toBe(true);
    expect(isLinkUsable({ revoked_at: null, expires_at: '2026-11-01T00:00:00Z' }, now)).toBe(true);
  });
});
