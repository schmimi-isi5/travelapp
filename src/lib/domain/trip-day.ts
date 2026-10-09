import { daysBetween } from '../formatting';
import type { ActionItem, TripStop } from './schemas';

export interface DayBriefing {
  phase: 'before' | 'during' | 'after' | 'unknown';
  daysUntilStart: number | null;
  currentStop: TripStop | null;
  nextStop: TripStop | null;
  /** The stop to feature as "next travel day": current stop if travelling, else the first upcoming one. */
  featuredStop: TripStop | null;
  openItems: ActionItem[];
}

/** Derives the briefing for `today` (YYYY-MM-DD) from dated stops; undated stops never become "current". */
export function buildDayBriefing(stops: readonly TripStop[], items: readonly ActionItem[], today: string): DayBriefing {
  const dated = stops.filter((s) => s.arrive_at).sort((a, b) => a.sequence - b.sequence);
  const openItems = items.filter((i) => i.status !== 'done').sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'));
  if (dated.length === 0) {
    return { phase: 'unknown', daysUntilStart: null, currentStop: null, nextStop: stops[0] ?? null, featuredStop: stops[0] ?? null, openItems };
  }
  const first = dated[0] as TripStop;
  const last = dated[dated.length - 1] as TripStop;
  const startDay = (first.arrive_at as string).slice(0, 10);
  const endDay = (last.depart_at ?? last.arrive_at) as string;
  if (today < startDay) {
    return { phase: 'before', daysUntilStart: daysBetween(today, startDay), currentStop: null, nextStop: first, featuredStop: first, openItems };
  }
  if (today > endDay.slice(0, 10)) {
    return { phase: 'after', daysUntilStart: null, currentStop: null, nextStop: null, featuredStop: last, openItems };
  }
  const current =
    dated.find((s) => (s.arrive_at as string).slice(0, 10) <= today && today < (s.depart_at ?? s.arrive_at as string).slice(0, 10)) ?? last;
  const next = dated.find((s) => s.sequence > current.sequence) ?? null;
  return { phase: 'during', daysUntilStart: null, currentStop: current, nextStop: next, featuredStop: current, openItems };
}
