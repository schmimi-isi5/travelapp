import { daysBetween } from '../formatting';
import { driveSummary } from '../labels';
import type { Booking, Route, Stay, TripStop } from './schemas';

export type CheckSeverity = 'critical' | 'warning' | 'info';

export interface PlanFinding {
  id: string;
  severity: CheckSeverity;
  title: string;
  detail: string;
  /** Where to fix it. */
  href: string;
}

interface Input {
  stops: readonly TripStop[];
  routes: readonly Route[];
  stays: readonly Stay[];
  bookings: readonly Booking[];
  today: string;
}

/** A drive day longer than this is called out; much longer counts as critical. */
export const LONG_DRIVE_MINUTES = 6 * 60;
export const VERY_LONG_DRIVE_MINUTES = 8 * 60;
/** Unconfirmed bookings are only a finding when the stay is this close. */
export const UNCONFIRMED_WITHIN_DAYS = 21;

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;
const name = (stop: Pick<TripStop, 'title'>) => stop.title.split('/').pop()?.trim() ?? stop.title;

/**
 * Rule-based check of the plan: what a careful person would notice when reading it through. The findings are plain data,
 * so they work offline; the AI only phrases next steps for them on request.
 */
export function checkTripPlan({ stops, routes, stays, bookings, today }: Input): PlanFinding[] {
  const findings: PlanFinding[] = [];
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  const add = (finding: PlanFinding) => findings.push(finding);

  for (const [index, stop] of ordered.entries()) {
    const label = name(stop);
    const href = `/route/${stop.id}`;
    const isInRegion = stop.country === 'Namibia' || stop.country === 'Botswana';
    if (!stop.arrive_at) add({ id: `nodate:${stop.id}`, severity: 'warning', title: `${label}: Ankunftsdatum fehlt`, detail: 'Ohne Datum gibt es weder Wetter noch Tagesbriefing für diese Station.', href });
    if (stop.latitude === null || stop.longitude === null) add({ id: `nocoords:${stop.id}`, severity: 'info', title: `${label}: keine Koordinaten`, detail: 'Die Station fehlt auf der Karte und ohne Wetter.', href });

    const stopStays = stays.filter((s) => s.stop_id === stop.id && s.booking_status !== 'cancelled');
    if (isInRegion && stop.depart_at && stop.arrive_at && stop.depart_at !== stop.arrive_at && stopStays.length === 0) {
      add({ id: `nostay:${stop.id}`, severity: 'warning', title: `${label}: keine Unterkunft erfasst`, detail: 'Für diese Station gibt es keine Unterkunft in der Planung.', href: '/stays' });
    }
    for (const stay of stopStays) {
      if (stay.check_in && stop.arrive_at && stay.check_in.slice(0, 10) !== stop.arrive_at.slice(0, 10)) {
        add({ id: `checkin:${stay.id}`, severity: 'warning', title: `${stay.name}: Check-in weicht ab`, detail: `Check-in ${stay.check_in.slice(0, 10)}, Ankunft an der Station ${stop.arrive_at.slice(0, 10)}.`, href: '/stays' });
      }
      if (stay.check_out && stop.depart_at && stay.check_out.slice(0, 10) !== stop.depart_at.slice(0, 10)) {
        add({ id: `checkout:${stay.id}`, severity: 'warning', title: `${stay.name}: Check-out weicht ab`, detail: `Check-out ${stay.check_out.slice(0, 10)}, Abreise von der Station ${stop.depart_at.slice(0, 10)}.`, href: '/stays' });
      }
      const daysToStay = stay.check_in ? daysBetween(today, stay.check_in.slice(0, 10)) : null;
      if ((stay.booking_status === 'unknown' || stay.booking_status === 'requested') && daysToStay !== null && daysToStay <= UNCONFIRMED_WITHIN_DAYS && daysToStay >= -1) {
        add({ id: `unconfirmed:${stay.id}`, severity: daysToStay <= 7 ? 'critical' : 'warning', title: `${stay.name}: Buchung nicht bestätigt`, detail: `Check-in in ${Math.max(daysToStay, 0)} Tagen, Status „${stay.booking_status === 'unknown' ? 'unbekannt' : 'angefragt'}“.`, href: '/stays' });
      }
    }

    const next = ordered[index + 1];
    if (next && stop.depart_at && next.arrive_at) {
      const gap = daysBetween(stop.depart_at, next.arrive_at);
      if (gap > 0) add({ id: `gap:${stop.id}`, severity: 'warning', title: `${gap} ${gap === 1 ? 'Nacht' : 'Nächte'} ohne Station`, detail: `Zwischen ${label} (Abreise ${stop.depart_at.slice(0, 10)}) und ${name(next)} (Ankunft ${next.arrive_at.slice(0, 10)}) ist nichts geplant.`, href: '/route' });
      if (gap < 0) add({ id: `overlap:${stop.id}`, severity: 'critical', title: `${label} und ${name(next)} überschneiden sich`, detail: `${name(next)} beginnt ${-gap} ${gap === -1 ? 'Tag' : 'Tage'} vor dem Ende von ${label}.`, href: '/route' });
      const leg = routes.find((r) => r.from_stop_id === stop.id && r.to_stop_id === next.id);
      if (leg?.duration_minutes && leg.duration_minutes > LONG_DRIVE_MINUTES) {
        const isVeryLong = leg.duration_minutes > VERY_LONG_DRIVE_MINUTES;
        add({ id: `drive:${leg.id}`, severity: isVeryLong ? 'critical' : 'warning', title: `Langer Fahrtag: ${label} nach ${name(next)}`, detail: `${driveSummary(leg.distance_km, leg.duration_minutes)}, eine grobe Schätzung. Schotter, Grenze und Pausen kommen dazu; früh starten und das Tageslicht prüfen.`, href: `/route/${next.id}` });
      }
    }
  }

  for (const booking of bookings) {
    if (booking.booking_status === 'cancelled' || !booking.starts_at) continue;
    const days = daysBetween(today, booking.starts_at.slice(0, 10));
    if ((booking.booking_status === 'unknown' || booking.booking_status === 'requested') && days >= -1 && days <= UNCONFIRMED_WITHIN_DAYS) {
      add({ id: `booking:${booking.id}`, severity: days <= 7 ? 'critical' : 'warning', title: `${booking.title}: nicht bestätigt`, detail: `Beginn in ${Math.max(days, 0)} Tagen, Status „${booking.booking_status === 'unknown' ? 'unbekannt' : 'angefragt'}“.`, href: '/bookings' });
    }
  }

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.title.localeCompare(b.title, 'de'));
}

/** The findings as plain sentences, the only thing the AI check receives. */
export function findingFacts(findings: readonly PlanFinding[]): string[] {
  return findings.map((f) => `${f.title}. ${f.detail}`);
}
