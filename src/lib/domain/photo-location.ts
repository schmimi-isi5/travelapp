import { haversineKm } from './geo';

export interface LocatedStop {
  id: string;
  title: string;
  /** A station without coordinates can only be found by date. */
  latitude: number | null;
  longitude: number | null;
  arrive_at: string | null;
  depart_at: string | null;
}

export type StopSource = 'manual' | 'gps' | 'date';

export interface StopAssignment {
  stopId: string;
  source: Exclude<StopSource, 'manual'>;
  /** Distance to the station for a GPS match. */
  distanceKm: number | null;
}

/** Farther from every station than this: the photo was taken somewhere else (stations are towns and parks, not buildings). */
export const MAX_STATION_DISTANCE_KM = 120;
/** Two stations this close in distance count as equally near; the shooting date decides. */
const TIE_KM = 8;

const dateOnly = (value: string | null | undefined) => (value ? value.slice(0, 10) : null);
const isInWindow = (stop: LocatedStop, day: string) => {
  const from = dateOnly(stop.arrive_at);
  const to = dateOnly(stop.depart_at) ?? from;
  return from !== null && to !== null && day >= from && day <= to;
};

/**
 * Assigns a photo to a station. With a GPS position: the nearest station within MAX_STATION_DISTANCE_KM (when two are about equally
 * near, the one whose stay covers the shooting day). Without GPS: the station whose stay covers the shooting day, only if exactly one
 * does (a change-over day belongs to two stations, so it stays open). Returns null when nothing is certain enough.
 */
export function assignStop(photo: { latitude: number | null; longitude: number | null; capturedAt: string | null }, stops: readonly LocatedStop[]): StopAssignment | null {
  const day = dateOnly(photo.capturedAt);
  if (photo.latitude !== null && photo.longitude !== null) {
    const ranked = stops
      .filter((stop): stop is LocatedStop & { latitude: number; longitude: number } => stop.latitude !== null && stop.longitude !== null)
      .map((stop) => ({ stop, km: haversineKm({ latitude: photo.latitude!, longitude: photo.longitude! }, stop) }))
      .filter((r) => r.km <= MAX_STATION_DISTANCE_KM)
      .sort((a, b) => a.km - b.km);
    const nearest = ranked[0];
    if (!nearest) return null;
    const close = ranked.filter((r) => r.km - nearest.km <= TIE_KM);
    const byDay = day ? close.find((r) => isInWindow(r.stop, day)) : undefined;
    const pick = byDay ?? nearest;
    return { stopId: pick.stop.id, source: 'gps', distanceKm: Math.round(pick.km * 10) / 10 };
  }
  if (day) {
    // no position in the photo: the date alone decides
    const covering = stops.filter((stop) => isInWindow(stop, day));
    if (covering.length === 1) return { stopId: covering[0]!.id, source: 'date', distanceKm: null };
  }
  return null;
}

/** "ca. 12 km von Etosha" for a place and a station; the station name alone when closer than a kilometre. */
export function describeDistance(latitude: number, longitude: number, stop: { title: string; latitude: number; longitude: number }): string {
  const km = haversineKm({ latitude, longitude }, stop);
  return km < 1 ? `bei ${stop.title}` : `ca. ${Math.round(km)} km von ${stop.title}`;
}

/** Link to the position on a map: opens only when somebody clicks it. */
export function mapLink(latitude: number, longitude: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=13/${latitude}/${longitude}`;
}

export const stopSourceLabel: Record<StopSource, string> = {
  gps: 'nach Aufnahmeort zugeordnet',
  date: 'nach Aufnahmedatum zugeordnet',
  manual: 'von Hand zugeordnet',
};
