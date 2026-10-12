import { daysBetween } from '@/lib/formatting';
import { isAdult } from './policy';
import type { ActionItem, Booking, Role, Stay } from './schemas';

/** How many days ahead a deadline counts as "soon". */
export const SOON_DAYS = 3;

export interface AppNotification {
  /** Stable per reason and date, so a dismissed notice returns only when the situation changes (e.g. a new date). */
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  href: string;
}

interface Input {
  today: string;
  role: Role;
  items: readonly ActionItem[];
  stays: readonly Stay[];
  bookings: readonly Booking[];
  conflictCount: number;
  pendingCount: number;
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;

function describeDue(dueDay: string, today: string): { severity: 'critical' | 'warning'; text: string } | null {
  const days = daysBetween(today, dueDay);
  if (days < 0) return { severity: 'critical', text: `seit ${-days} ${days === -1 ? 'Tag' : 'Tagen'} überfällig` };
  if (days === 0) return { severity: 'critical', text: 'heute fällig' };
  if (days <= SOON_DAYS) return { severity: 'warning', text: days === 1 ? 'morgen fällig' : `in ${days} Tagen fällig` };
  return null;
}

/**
 * Notices derived from the data on the device (no server push): overdue or imminent tasks, payment and booking deadlines
 * (adults only, like the finance data itself) and sync problems. Nothing here invents a status: only dates that exist count.
 */
export function buildNotifications({ today, role, items, stays, bookings, conflictCount, pendingCount }: Input): AppNotification[] {
  const result: AppNotification[] = [];
  if (conflictCount > 0) result.push({ id: `conflict:${conflictCount}`, severity: 'critical', title: `${conflictCount} Synchronisationskonflikt${conflictCount > 1 ? 'e' : ''}`, detail: 'Bitte entscheiden, welche Version gilt.', href: '/offline' });
  for (const item of items) {
    if (item.status === 'done' || !item.due_at) continue;
    const due = describeDue(item.due_at.slice(0, 10), today);
    if (due) result.push({ id: `task:${item.id}:${item.due_at.slice(0, 10)}`, severity: due.severity, title: item.title, detail: `Aufgabe ${due.text}`, href: item.stop_id ? `/route/${item.stop_id}` : item.stay_id ? '/stays' : '/' });
  }
  if (isAdult(role)) {
    for (const stay of stays) {
      if (stay.booking_status === 'cancelled' || !stay.due_at) continue;
      const due = describeDue(stay.due_at.slice(0, 10), today);
      if (due) result.push({ id: `stay:${stay.id}:${stay.due_at.slice(0, 10)}`, severity: due.severity, title: stay.name, detail: `Zahlungsfrist ${due.text}`, href: '/stays' });
    }
    for (const booking of bookings) {
      if (booking.booking_status === 'cancelled' || !booking.deadline_at) continue;
      const due = describeDue(booking.deadline_at.slice(0, 10), today);
      if (due) result.push({ id: `booking:${booking.id}:${booking.deadline_at.slice(0, 10)}`, severity: due.severity, title: booking.title, detail: `Frist ${due.text}`, href: '/bookings' });
    }
  }
  if (pendingCount > 0) result.push({ id: `pending:${pendingCount}`, severity: 'info', title: `${pendingCount} Änderung${pendingCount > 1 ? 'en' : ''} warte${pendingCount > 1 ? 'n' : 't'} auf Synchronisation`, detail: 'Wird übertragen, sobald du wieder online bist.', href: '/offline' });
  return result.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.title.localeCompare(b.title, 'de'));
}
