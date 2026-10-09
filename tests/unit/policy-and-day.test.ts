import { describe, expect, it } from 'vitest';
import { canRead, canWrite, ForbiddenError, assertRead, canEditOwnedRow } from '@/lib/domain/policy';
import { buildDayBriefing } from '@/lib/domain/trip-day';
import { buildDemoData } from '@/lib/db/demo-data';
import { estimateRoute } from '@/lib/domain/geo';
import { daysBetween } from '@/lib/formatting';
import type { ActionItem, TripStop } from '@/lib/domain/schemas';

describe('role policy', () => {
  it.each(['child', 'member'] as const)('%s cannot read finance or documents', (role) => {
    for (const table of ['payments', 'documents', 'expenses', 'fx_rates'] as const) expect(canRead(role, table)).toBe(false);
    expect(() => assertRead(role, 'payments')).toThrow(ForbiddenError);
  });
  it('adults read finance', () => {
    expect(canRead('adult', 'payments')).toBe(true);
    expect(canRead('owner', 'documents')).toBe(true);
  });
  it('children can contribute journal entries but not edit planning', () => {
    expect(canWrite('child', 'journal_entries')).toBe(true);
    expect(canWrite('child', 'stays')).toBe(false);
    expect(canWrite('member', 'members')).toBe(false);
    expect(canWrite('owner', 'members')).toBe(true);
  });
  it('members edit only their own rows', () => {
    expect(canEditOwnedRow('member', 'a', 'a')).toBe(true);
    expect(canEditOwnedRow('member', 'a', 'b')).toBe(false);
    expect(canEditOwnedRow('adult', 'a', 'b')).toBe(true);
  });
});

describe('demo data', () => {
  const data = buildDemoData();
  it('validates against all schemas and is entirely flagged as demo', () => {
    for (const rows of Object.values(data)) for (const row of rows ?? []) expect(row.is_demo).toBe(true);
  });
  it('does not invent booking references, hotel prices or payment status for the unconfirmed demo stays', () => {
    const stays = (data.stays ?? []).filter((s) => s.id === 'demo-stay-etosha' || s.id === 'demo-stay-chobe');
    for (const s of stays) {
      expect(s.booking_ref).toBeNull();
      expect(s.price_minor).toBeNull();
      expect(s.booking_status).toBe('unknown');
    }
    expect((data.bookings ?? []).every((b) => b.reference === null)).toBe(true);
  });
  it('labels route durations as coarse offline estimates', () => {
    for (const r of data.routes ?? []) expect(r.duration_source).toBe('offline_estimate');
  });
});

describe('estimateRoute', () => {
  it('returns null without coordinates', () => {
    expect(estimateRoute({ latitude: null, longitude: null }, { latitude: 1, longitude: 1 })).toBeNull();
  });
  it('estimates Windhoek to Sossusvlei in a plausible range', () => {
    const e = estimateRoute({ latitude: -22.5609, longitude: 17.0658 }, { latitude: -24.7333, longitude: 15.3 });
    expect(e?.distance_km).toBeGreaterThan(300);
    expect(e?.distance_km).toBeLessThan(500);
  });
});

describe('day briefing', () => {
  const stops = (buildDemoData().trip_stops ?? []) as unknown as TripStop[];
  const items = (buildDemoData().action_items ?? []) as unknown as ActionItem[];
  it('before the trip: counts down and features the first station', () => {
    const b = buildDayBriefing(stops, items, '2026-10-09');
    expect(b.phase).toBe('before');
    expect(b.daysUntilStart).toBe(4);
    expect(b.featuredStop?.title).toBe('Windhoek');
  });
  it('during the trip: picks the current and the next station', () => {
    const b = buildDayBriefing(stops, items, '2026-10-21');
    expect(b.phase).toBe('during');
    expect(b.currentStop?.title).toBe('Etosha Nationalpark');
    expect(b.nextStop?.title).toBe('Kasane / Chobe');
  });
  it('switches station on the departure day', () => {
    expect(buildDayBriefing(stops, items, '2026-10-24').currentStop?.title).toBe('Kasane / Chobe');
  });
  it('after the trip it is over', () => {
    expect(buildDayBriefing(stops, items, '2026-12-01').phase).toBe('after');
  });
  it('lists only open items, soonest due first', () => {
    const b = buildDayBriefing(stops, items, '2026-10-09');
    expect(b.openItems.every((i) => i.status !== 'done')).toBe(true);
    expect(b.openItems[0]?.due_at).toBe('2026-10-11');
  });
  it('handles undated stops', () => {
    expect(buildDayBriefing([], [], '2026-10-09').phase).toBe('unknown');
  });
  it('daysBetween is DST-safe', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });
});
