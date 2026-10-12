import { describe, expect, it } from 'vitest';
import { buildNotifications } from '../../src/lib/domain/notifications';
import type { ActionItem, Booking, Stay } from '../../src/lib/domain/schemas';

const base = { id: 'x', version: 1, created_at: '', updated_at: '', created_by: null, is_demo: false, source_type: 'user_entered' as const };
const item = (id: string, due: string | null, status: ActionItem['status'] = 'open'): ActionItem => ({ ...base, id, family_id: 'f', trip_id: 't', stop_id: null, stay_id: null, booking_id: null, title: `Aufgabe ${id}`, status, owner_user_id: null, due_at: due, priority: 'normal' });
const stay = (id: string, due: string | null, status: Stay['booking_status'] = 'confirmed'): Stay => ({ ...base, id, trip_id: 't', stop_id: null, name: `Stay ${id}`, address: null, check_in: null, check_out: null, booking_status: status, quote_status: 'none', price_minor: null, currency: null, booking_ref: null, due_at: due, contact: null, notes: null, verified_at: null, source_reference: null });
const booking = (id: string, deadline: string | null): Booking => ({ ...base, id, trip_id: 't', stop_id: null, stay_id: null, kind: 'car', title: `Buchung ${id}`, booking_status: 'confirmed', starts_at: null, deadline_at: deadline, reminder_at: null, amount_minor: null, currency: null, reference: null, provider: null, contact: null, notes: null, verified_at: null, source_reference: null });
const input = { today: '2026-10-12', role: 'owner' as const, items: [], stays: [], bookings: [], conflictCount: 0, pendingCount: 0 };

describe('buildNotifications', () => {
  it('reports overdue, today and imminent tasks, ignores far away, done and undated ones', () => {
    const list = buildNotifications({ ...input, items: [item('a', '2026-10-10'), item('b', '2026-10-12'), item('c', '2026-10-14'), item('d', '2026-10-30'), item('e', '2026-10-10', 'done'), item('f', null)] });
    expect(list.map((n) => [n.title, n.severity, n.detail])).toEqual([
      ['Aufgabe a', 'critical', 'Aufgabe seit 2 Tagen überfällig'],
      ['Aufgabe b', 'critical', 'Aufgabe heute fällig'],
      ['Aufgabe c', 'warning', 'Aufgabe in 2 Tagen fällig'],
    ]);
  });

  it('shows payment and booking deadlines only to adults and never for cancelled entries', () => {
    const data = { ...input, stays: [stay('s1', '2026-10-13'), stay('s2', '2026-10-13', 'cancelled')], bookings: [booking('b1', '2026-10-11')] };
    expect(buildNotifications(data).map((n) => n.title)).toEqual(['Buchung b1', 'Stay s1']);
    expect(buildNotifications({ ...data, role: 'child' })).toEqual([]);
  });

  it('puts sync conflicts first and pending changes last', () => {
    const list = buildNotifications({ ...input, items: [item('a', '2026-10-13')], conflictCount: 2, pendingCount: 1 });
    expect(list.map((n) => n.severity)).toEqual(['critical', 'warning', 'info']);
    expect(list[0]?.title).toBe('2 Synchronisationskonflikte');
  });

  it('changes the id when the due date changes, so a dismissed notice returns for a new date', () => {
    const first = buildNotifications({ ...input, items: [item('a', '2026-10-13')] })[0]!.id;
    const second = buildNotifications({ ...input, items: [item('a', '2026-10-14')] })[0]!.id;
    expect(first).not.toBe(second);
  });
});
