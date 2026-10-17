import { describe, expect, it } from 'vitest';
import { assignStop, describeDistance, mapLink, type LocatedStop } from '@/lib/domain/photo-location';

const stop = (id: string, title: string, latitude: number | null, longitude: number | null, arrive: string | null, depart: string | null): LocatedStop => ({ id, title, latitude, longitude, arrive_at: arrive, depart_at: depart });
const windhoek = stop('w', 'Windhoek', -22.5609, 17.0658, '2026-10-13', '2026-10-15');
const sossus = stop('s', 'Sossusvlei', -24.7333, 15.3, '2026-10-15', '2026-10-18');
const etosha = stop('e', 'Etosha Nationalpark', -18.855, 16.3293, '2026-10-20', '2026-10-24');
const okaukuejo = stop('o', 'Okaukuejo Camp', -19.1, 15.92, '2026-10-22', '2026-10-23');
const stops = [windhoek, sossus, etosha, okaukuejo];

describe('assignStop with a position', () => {
  it('takes the nearest station and reports the distance', () => {
    expect(assignStop({ latitude: -18.86, longitude: 16.33, capturedAt: null }, stops)).toMatchObject({ stopId: 'e', source: 'gps', distanceKm: expect.any(Number) });
    expect(assignStop({ latitude: -22.6, longitude: 17.1, capturedAt: null }, stops)?.stopId).toBe('w');
  });

  it('leaves a photo taken far from every station without a station', () => {
    expect(assignStop({ latitude: 48.1, longitude: 11.6, capturedAt: '2026-10-20T10:00:00Z' }, stops)).toBeNull();
    expect(assignStop({ latitude: -23.5, longitude: 20.5, capturedAt: null }, stops)).toBeNull(); // the Kalahari between Windhoek and Maun, > 120 km from all
  });

  it('lets the shooting day decide between stations that are about equally near', () => {
    const near = stop('a', 'Camp A', -19.0, 16.0, '2026-10-20', '2026-10-21');
    const alsoNear = stop('b', 'Camp B', -19.02, 16.02, '2026-10-22', '2026-10-23');
    expect(assignStop({ latitude: -19.01, longitude: 16.01, capturedAt: '2026-10-22T08:00:00Z' }, [near, alsoNear])?.stopId).toBe('b');
    expect(assignStop({ latitude: -19.01, longitude: 16.01, capturedAt: '2026-10-20T08:00:00Z' }, [near, alsoNear])?.stopId).toBe('a');
  });

  it('ignores stations without coordinates when it has a position', () => {
    expect(assignStop({ latitude: -22.6, longitude: 17.1, capturedAt: null }, [stop('x', 'Ohne Ort', null, null, null, null), windhoek])?.stopId).toBe('w');
  });
});

describe('assignStop by date only', () => {
  it('takes the station whose stay covers the day, when exactly one does', () => {
    expect(assignStop({ latitude: null, longitude: null, capturedAt: '2026-10-16T12:00:00Z' }, stops)).toEqual({ stopId: 's', source: 'date', distanceKm: null });
    expect(assignStop({ latitude: null, longitude: null, capturedAt: '2026-10-21T12:00:00Z' }, stops)?.stopId).toBe('e');
  });

  it('does not guess on a change-over day or where stays overlap', () => {
    expect(assignStop({ latitude: null, longitude: null, capturedAt: '2026-10-15T12:00:00Z' }, stops)).toBeNull(); // Windhoek -> Sossusvlei
    expect(assignStop({ latitude: null, longitude: null, capturedAt: '2026-10-22T12:00:00Z' }, stops)).toBeNull(); // Etosha and Okaukuejo overlap
  });

  it('gives nothing without date and position, or outside every stay', () => {
    expect(assignStop({ latitude: null, longitude: null, capturedAt: null }, stops)).toBeNull();
    expect(assignStop({ latitude: null, longitude: null, capturedAt: '2026-12-01T12:00:00Z' }, stops)).toBeNull();
    expect(assignStop({ latitude: null, longitude: null, capturedAt: '2026-10-16T12:00:00Z' }, [stop('x', 'Ohne Datum', -20, 17, null, null)])).toBeNull();
  });
});

describe('describing the place', () => {
  it('says how far a photo is from its station', () => {
    expect(describeDistance(-18.86, 16.33, { title: 'Etosha Nationalpark', latitude: -18.855, longitude: 16.3293 })).toBe('bei Etosha Nationalpark');
    expect(describeDistance(-19.5, 16.33, { title: 'Etosha Nationalpark', latitude: -18.855, longitude: 16.3293 })).toMatch(/^ca\. \d+ km von Etosha Nationalpark$/);
  });
  it('links to a map position (opened only on a click)', () => {
    expect(mapLink(-18.855, 16.3293)).toBe('https://www.openstreetmap.org/?mlat=-18.855&mlon=16.3293#map=13/-18.855/16.3293');
  });
});
