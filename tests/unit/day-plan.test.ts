import { describe, expect, it } from 'vitest';
import { ARRIVAL_BUFFER_MINUTES, buildDayPlan, latestDeparture } from '../../src/lib/domain/day-plan';
import type { ActionItem, Booking, Route, Stay, TripStop } from '../../src/lib/domain/schemas';
import type { WeatherDay } from '../../src/lib/weather/types';

const base = { id: 'x', version: 1, created_at: '', updated_at: '', created_by: null, is_demo: false, source_type: 'user_entered' as const };
const stop = (id: string, sequence: number, title: string, arrive: string, depart: string): TripStop => ({ ...base, id, trip_id: 't', title, country: 'Namibia', latitude: -19, longitude: 16, arrive_at: arrive, depart_at: depart, sequence, summary: '', highlights: [], verified_at: null, source_reference: null });
const leg = (minutes: number | null, km: number | null): Route => ({ ...base, id: 'l', trip_id: 't', from_stop_id: 'a', to_stop_id: 'b', distance_km: km, duration_minutes: minutes, duration_source: 'offline_estimate' });
const stay = (over: Partial<Stay> = {}): Stay => ({ ...base, trip_id: 't', stop_id: 'b', name: 'Onguma Tamboti Campsite', address: null, check_in: '2026-10-20', check_out: '2026-10-22', booking_status: 'confirmed', quote_status: 'none', price_minor: null, currency: null, booking_ref: null, due_at: null, contact: null, notes: 'Art: Camping.', verified_at: null, source_reference: null, ...over });
const booking = (over: Partial<Booking> = {}): Booking => ({ ...base, trip_id: 't', stop_id: 'b', stay_id: null, kind: 'activity', title: 'Pirschfahrt', booking_status: 'confirmed', starts_at: '2026-10-21T06:00', deadline_at: null, reminder_at: null, amount_minor: null, currency: null, reference: null, provider: null, contact: null, notes: null, verified_at: null, source_reference: null, ...over });
const item = (title: string, due: string | null, status: ActionItem['status'] = 'open'): ActionItem => ({ ...base, family_id: 'f', trip_id: 't', stop_id: 'b', stay_id: null, booking_id: null, title, status, owner_user_id: null, due_at: due, priority: 'normal' });
const day = (over: Partial<WeatherDay> = {}): WeatherDay => ({ date: '2026-10-20', source: 'forecast', tmax: 34, tmin: 12, rainMm: 0, rainChance: 5, windMax: 18, uvMax: 10, sunrise: '2026-10-20T06:10', sunset: '2026-10-20T18:50', ...over });

const a = stop('a', 7, 'Okavango', '2026-10-17', '2026-10-20');
const b = stop('b', 8, 'Etosha Nationalpark', '2026-10-20', '2026-10-22');
const input = { stop: b, stopCount: 14, previous: a, leg: leg(270, 320), stays: [stay()], bookings: [booking()], items: [item('Tickets drucken', '2026-10-19')], weatherDay: day(), today: '2026-10-20' };

describe('latest departure', () => {
  it('counts back from sunset minus the arrival buffer and the drive time', () => {
    expect(latestDeparture(270, '18:50')).toEqual({ departBy: '13:35', daylightMinutes: null }); // 18:50 - 45 min - 4:30 h
    expect(ARRIVAL_BUFFER_MINUTES).toBe(45);
  });
  it('is unknown without drive time or sunset', () => {
    expect(latestDeparture(null, '18:50')).toBeNull();
    expect(latestDeparture(270, null)).toBeNull();
  });
});

describe('day plan', () => {
  it('lists what is known about the day: station, drive with latest departure, stay with type, weather, light, activity and tasks', () => {
    const plan = buildDayPlan(input);
    const text = (key: string) => plan.rows.find((r) => r.key === key)?.text ?? '';
    expect(text('station')).toContain('Station 8 von 14');
    expect(text('station')).toContain('2 Nächte');
    expect(text('travel')).toContain('Von Okavango');
    expect(text('travel')).toContain('ca. 320 km');
    expect(text('travel')).toContain('Spätestens um 13:35 losfahren');
    expect(text('stay')).toBe('Onguma Tamboti Campsite (Camping)');
    expect(text('weather')).toContain('12 bis 34 °C, trocken');
    expect(text('weather')).toContain('UV 10');
    expect(text('light')).toContain('Sonnenaufgang 06:10, Sonnenuntergang 18:50');
    expect(text('activities')).toContain('Pirschfahrt');
    expect(text('tasks')).toContain('1 offen, davon 1 überfällig');
    expect(plan.facts[0]).toMatch(/^Datum:/);
    expect(plan.facts.some((f) => f.startsWith('Wetter:'))).toBe(true);
  });

  it('shows no weather or light row and no departure time when there is no weather, and says so honestly for the stay', () => {
    const plan = buildDayPlan({ ...input, weatherDay: undefined, stays: [] });
    expect(plan.rows.map((r) => r.key)).not.toContain('weather');
    expect(plan.rows.map((r) => r.key)).not.toContain('light');
    expect(plan.rows.find((r) => r.key === 'travel')?.text).not.toContain('losfahren');
    expect(plan.rows.find((r) => r.key === 'stay')).toMatchObject({ text: 'Noch keine Unterkunft erfasst.', isAttention: true });
  });

  it('flags an unconfirmed booking and a tight day', () => {
    const plan = buildDayPlan({ ...input, stays: [stay({ booking_status: 'unknown' })], leg: leg(700, 900), weatherDay: day({ sunrise: '2026-10-20T06:10', sunset: '2026-10-20T18:00' }) });
    expect(plan.rows.find((r) => r.key === 'stay')).toMatchObject({ isAttention: true });
    expect(plan.rows.find((r) => r.key === 'stay')?.text).toContain('Buchung noch nicht bestätigt');
    expect(plan.rows.find((r) => r.key === 'travel')).toMatchObject({ isAttention: true });
    expect(plan.rows.find((r) => r.key === 'travel')?.text).toContain('knapp');
  });

  it('marks climate averages as not a forecast and ignores cancelled activities and finished tasks', () => {
    const plan = buildDayPlan({ ...input, weatherDay: day({ source: 'climate', rainChance: 40, rainMm: 2 }), bookings: [booking({ booking_status: 'cancelled' })], items: [item('Erledigt', null, 'done')] });
    expect(plan.rows.find((r) => r.key === 'weather')?.text).toContain('Durchschnitt, keine Vorhersage');
    expect(plan.rows.map((r) => r.key)).not.toContain('activities');
    expect(plan.rows.map((r) => r.key)).not.toContain('tasks');
  });
});
