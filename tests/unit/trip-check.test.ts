import { describe, expect, it } from 'vitest';
import type { Booking, Route, Stay, TripStop } from '../../src/lib/domain/schemas';
import { checkTripPlan, findingFacts, LONG_DRIVE_MINUTES } from '../../src/lib/domain/trip-check';

const base = { id: 'x', version: 1, created_at: '', updated_at: '', created_by: null, is_demo: false, source_type: 'user_entered' as const };
const stop = (id: string, sequence: number, title: string, arrive: string | null, depart: string | null, over: Partial<TripStop> = {}): TripStop => ({ ...base, id, trip_id: 't', title, country: 'Namibia', latitude: -19, longitude: 16, arrive_at: arrive, depart_at: depart, sequence, summary: '', highlights: [], verified_at: null, source_reference: null, ...over });
const route = (from: string, to: string, minutes: number | null): Route => ({ ...base, id: `${from}-${to}`, trip_id: 't', from_stop_id: from, to_stop_id: to, distance_km: 400, duration_minutes: minutes, duration_source: 'offline_estimate' });
const stay = (stopId: string, over: Partial<Stay> = {}): Stay => ({ ...base, id: `s-${stopId}`, trip_id: 't', stop_id: stopId, name: `Lodge ${stopId}`, address: null, check_in: null, check_out: null, booking_status: 'confirmed', quote_status: 'none', price_minor: null, currency: null, booking_ref: null, due_at: null, contact: null, notes: null, verified_at: null, source_reference: null, ...over });
const booking = (over: Partial<Booking> = {}): Booking => ({ ...base, id: 'b1', trip_id: 't', stop_id: null, stay_id: null, kind: 'car', title: 'Mietwagen', booking_status: 'confirmed', starts_at: null, deadline_at: null, reminder_at: null, amount_minor: null, currency: null, reference: null, provider: null, contact: null, notes: null, verified_at: null, source_reference: null, ...over });
const check = (over: Partial<Parameters<typeof checkTripPlan>[0]> = {}) => checkTripPlan({ stops: [], routes: [], stays: [], bookings: [], today: '2026-10-12', ...over });
const titles = (findings: ReturnType<typeof check>) => findings.map((f) => f.title);

describe('trip plan check', () => {
  const a = stop('a', 1, 'Windhoek', '2026-10-13', '2026-10-15');
  const b = stop('b', 2, 'Etosha Nationalpark', '2026-10-15', '2026-10-18');

  it('finds nothing in a clean plan', () => {
    expect(check({ stops: [a, b], stays: [stay('a', { check_in: '2026-10-13', check_out: '2026-10-15' }), stay('b', { check_in: '2026-10-15', check_out: '2026-10-18' })], routes: [route('a', 'b', 300)] })).toEqual([]);
  });

  it('reports a station without accommodation, missing dates and missing coordinates, but not a single-day stop', () => {
    const noDate = stop('c', 3, 'Rundu', null, null, { latitude: null, longitude: null });
    const flight = stop('f', 0, 'Anreise: Flug', '2026-10-13', '2026-10-13');
    const result = titles(check({ stops: [flight, a, noDate], stays: [] }));
    expect(result).toContain('Windhoek: keine Unterkunft erfasst');
    expect(result).toContain('Rundu: Ankunftsdatum fehlt');
    expect(result).toContain('Rundu: keine Koordinaten');
    expect(result).not.toContain('Anreise: Flug: keine Unterkunft erfasst');
  });

  it('reports stay dates that differ from the station and nights without a station or overlaps between stations', () => {
    const c = stop('c', 3, 'Chobe', '2026-10-20', '2026-10-22'); // two nights after Etosha
    const d = stop('d', 4, 'Maun', '2026-10-21', '2026-10-23'); // starts before Chobe ends
    const result = check({ stops: [a, b, c, d], stays: [stay('a', { check_in: '2026-10-14', check_out: '2026-10-15' }), stay('b'), stay('c'), stay('d')] });
    expect(titles(result)).toEqual(expect.arrayContaining(['Lodge a: Check-in weicht ab', '2 Nächte ohne Station', 'Chobe und Maun überschneiden sich']));
    expect(result.find((f) => f.title.includes('überschneiden'))?.severity).toBe('critical');
  });

  it('calls out long drive days and treats very long ones as critical', () => {
    const long = check({ stops: [a, b], stays: [stay('a'), stay('b')], routes: [route('a', 'b', LONG_DRIVE_MINUTES + 30)] });
    expect(long.find((f) => f.id.startsWith('drive'))).toMatchObject({ severity: 'warning', title: 'Langer Fahrtag: Windhoek nach Etosha Nationalpark' });
    const veryLong = check({ stops: [a, b], stays: [stay('a'), stay('b')], routes: [route('a', 'b', 9 * 60)] });
    expect(veryLong.find((f) => f.id.startsWith('drive'))?.severity).toBe('critical');
    expect(check({ stops: [a, b], stays: [stay('a'), stay('b')], routes: [route('a', 'b', LONG_DRIVE_MINUTES)] }).some((f) => f.id.startsWith('drive'))).toBe(false);
  });

  it('flags unconfirmed stays and bookings only when they are close, more urgent within a week, never cancelled ones', () => {
    const result = check({
      stops: [a, b],
      stays: [stay('a', { check_in: '2026-10-13', booking_status: 'unknown' }), stay('b', { check_in: '2026-11-30', booking_status: 'unknown' })],
      bookings: [booking({ starts_at: '2026-10-25', booking_status: 'requested' }), booking({ id: 'b2', title: 'Storniert', starts_at: '2026-10-14', booking_status: 'cancelled' })],
    });
    expect(result.find((f) => f.title === 'Lodge a: Buchung nicht bestätigt')?.severity).toBe('critical');
    expect(result.find((f) => f.title === 'Mietwagen: nicht bestätigt')?.severity).toBe('warning');
    expect(titles(result)).not.toContain('Lodge b: Buchung nicht bestätigt');
    expect(titles(result)).not.toContain('Storniert: nicht bestätigt');
  });

  it('sorts critical before warnings and gives the findings as plain sentences', () => {
    const result = check({ stops: [a, stop('x', 2, 'Etosha Nationalpark', '2026-10-14', '2026-10-17')], stays: [stay('a'), stay('x')] });
    expect(result[0]?.severity).toBe('critical');
    expect(findingFacts(result)[0]).toMatch(/überschneiden sich\. Etosha Nationalpark beginnt/);
  });
});
