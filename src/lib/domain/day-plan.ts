import { daysBetween, formatDate, formatShortDate } from '../formatting';
import { driveSummary } from '../labels';
import { accommodationKind } from '../tips/recommend';
import type { WeatherDay } from '../weather/types';
import type { ActionItem, Booking, Route, Stay, TripStop } from './schemas';

export interface DayPlanRow {
  key: 'station' | 'travel' | 'stay' | 'weather' | 'light' | 'activities' | 'tasks';
  label: string;
  text: string;
  /** Something to look at first (tight daylight, unconfirmed booking). */
  isAttention: boolean;
}

export interface DayPlan {
  rows: DayPlanRow[];
  /** The same content as plain sentences: what the optional AI preview may use, nothing else. */
  facts: string[];
}

interface Input {
  stop: TripStop;
  stopCount: number;
  previous: TripStop | null;
  leg: Route | undefined;
  stays: readonly Stay[];
  bookings: readonly Booking[];
  items: readonly ActionItem[];
  weatherDay: WeatherDay | undefined;
  today: string;
}

/** Minutes of daylight to keep between arriving and sunset when planning the latest departure. */
export const ARRIVAL_BUFFER_MINUTES = 45;
const MAX_LISTED = 3;

const KIND_TEXT = { camping: 'Camping', lodge: 'Lodge', tented: 'Zelt-Lodge', unknown: '' } as const;
const timeOf = (iso: string | null | undefined) => (iso && iso.length >= 16 ? iso.slice(11, 16) : null);

function minutesOfDay(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function clock(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/** Latest departure so that the family arrives before the end of daylight, or null when drive time or sunset is unknown. */
export function latestDeparture(durationMinutes: number | null | undefined, sunset: string | null): { departBy: string; daylightMinutes: number | null } | null {
  if (durationMinutes === null || durationMinutes === undefined || !sunset) return null;
  return { departBy: clock(minutesOfDay(sunset) - ARRIVAL_BUFFER_MINUTES - durationMinutes), daylightMinutes: null };
}

function weatherText(day: WeatherDay): string {
  const parts: string[] = [];
  if (day.tmin !== null && day.tmax !== null) parts.push(`${Math.round(day.tmin)} bis ${Math.round(day.tmax)} °C`);
  const isDry = (day.rainMm ?? 0) < 1 && (day.rainChance ?? 0) < 20;
  parts.push(isDry ? 'trocken' : day.source === 'forecast' ? `Regen ${Math.round(day.rainChance ?? 0)} %` : `Regen in ${Math.round(day.rainChance ?? 0)} % der Jahre`);
  if (day.windMax !== null && day.windMax >= 30) parts.push(`Wind bis ${Math.round(day.windMax)} km/h`);
  if (day.uvMax !== null && day.uvMax >= 8) parts.push(`UV ${Math.round(day.uvMax)}`);
  return `${parts.join(', ')} (${day.source === 'forecast' ? 'Vorhersage' : 'Durchschnitt, keine Vorhersage'})`;
}

/**
 * The day briefing of a station: everything that is known about the day, in rows for the screen and as plain facts for the
 * optional AI preview. Nothing here is guessed: missing data simply produces no row.
 */
export function buildDayPlan({ stop, stopCount, previous, leg, stays, bookings, items, weatherDay, today }: Input): DayPlan {
  const rows: DayPlanRow[] = [];
  const add = (row: DayPlanRow) => rows.push(row);
  const nights = stop.arrive_at && stop.depart_at ? daysBetween(stop.arrive_at, stop.depart_at) : null;
  const stationText = `Station ${stop.sequence} von ${stopCount}${stop.arrive_at ? ` · ${formatShortDate(stop.arrive_at)}${stop.depart_at ? ` bis ${formatShortDate(stop.depart_at)}` : ''}` : ''}${nights !== null && nights > 0 ? ` (${nights} ${nights === 1 ? 'Nacht' : 'Nächte'})` : ''}`;
  add({ key: 'station', label: 'Station', text: stationText, isAttention: false });

  const sunset = timeOf(weatherDay?.sunset);
  const sunrise = timeOf(weatherDay?.sunrise);
  const drive = leg && previous ? driveSummary(leg.distance_km, leg.duration_minutes) : null;
  if (previous && drive) {
    const timing = latestDeparture(leg?.duration_minutes, sunset);
    const isTight = timing !== null && sunrise !== null && minutesOfDay(timing.departBy) < minutesOfDay(sunrise);
    const departure = timing ? (isTight ? ` Das ist knapp: Selbst bei Sonnenaufgang (${sunrise}) wäre die Ankunft vor Sonnenuntergang (${sunset}) nur mit Puffer von weniger als ${ARRIVAL_BUFFER_MINUTES} Minuten möglich.` : ` Spätestens um ${timing.departBy} losfahren, damit ihr ${ARRIVAL_BUFFER_MINUTES} Minuten vor Sonnenuntergang (${sunset}) ankommt.`) : '';
    add({ key: 'travel', label: 'Anreise', text: `Von ${previous.title.split('/').pop()?.trim()}: ${drive}, grobe Schätzung ohne Pisten und Grenzen.${departure}`, isAttention: isTight });
  }

  if (stays.length > 0) {
    const parts = stays.map((s) => {
      const kind = KIND_TEXT[accommodationKind(s)];
      const unconfirmed = s.booking_status === 'unknown' || s.booking_status === 'requested';
      return { text: `${s.name}${kind ? ` (${kind})` : ''}${unconfirmed ? ', Buchung noch nicht bestätigt' : ''}`, unconfirmed };
    });
    add({ key: 'stay', label: 'Unterkunft', text: parts.map((p) => p.text).join('; '), isAttention: parts.some((p) => p.unconfirmed) });
  } else {
    add({ key: 'stay', label: 'Unterkunft', text: 'Noch keine Unterkunft erfasst.', isAttention: true });
  }

  if (weatherDay) add({ key: 'weather', label: 'Wetter', text: weatherText(weatherDay), isAttention: false });
  if (sunrise || sunset) add({ key: 'light', label: 'Tageslicht', text: `Sonnenaufgang ${sunrise ?? 'unbekannt'}, Sonnenuntergang ${sunset ?? 'unbekannt'}. Nach Einbruch der Dunkelheit nicht mehr fahren.`, isAttention: false });

  const activities = bookings.filter((b) => (b.kind === 'activity' || b.kind === 'park') && b.booking_status !== 'cancelled');
  if (activities.length > 0) {
    const listed = activities.slice(0, MAX_LISTED).map((b) => `${b.title}${b.starts_at ? ` (${b.starts_at.includes('T') ? `${formatShortDate(b.starts_at)}, ${b.starts_at.slice(11, 16)} Uhr` : formatShortDate(b.starts_at)})` : ''}`);
    add({ key: 'activities', label: 'Aktivitäten', text: `${listed.join('; ')}${activities.length > MAX_LISTED ? ` und ${activities.length - MAX_LISTED} weitere` : ''}`, isAttention: false });
  }

  const open = items.filter((i) => i.status !== 'done');
  if (open.length > 0) {
    const overdue = open.filter((i) => i.due_at && daysBetween(today, i.due_at.slice(0, 10)) < 0).length;
    const titles = open.slice(0, MAX_LISTED).map((i) => i.title).join('; ');
    add({ key: 'tasks', label: 'Aufgaben', text: `${open.length} offen${overdue ? `, davon ${overdue} überfällig` : ''}: ${titles}${open.length > MAX_LISTED ? ' …' : ''}`, isAttention: overdue > 0 });
  }

  const facts = rows.map((r) => `${r.label}: ${r.text}`);
  if (stop.arrive_at) facts.unshift(`Datum: ${formatDate(stop.arrive_at)}`);
  return { rows, facts };
}
