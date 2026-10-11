import type { TripStop } from '@/lib/domain/schemas';
import { authHeaders } from '@/lib/supabase/auth-headers';
import type { WeatherResult } from './types';

const CACHE_KEY = 'nb-weather-v1';
const MAX_DAYS = 7;
const FRESH_MS = 3 * 3600_000;

interface CacheEntry {
  key: string;
  fetchedAt: number;
  result: WeatherResult;
}

type StopForWeather = Pick<TripStop, 'id' | 'latitude' | 'longitude' | 'arrive_at' | 'depart_at'>;

/** The days a station covers (arrival to departure, at most a week), or null when coordinates or dates are missing. */
export function periodFor(stop: StopForWeather): { from: string; to: string; key: string } | null {
  if (stop.latitude === null || stop.longitude === null || !stop.arrive_at) return null;
  const from = stop.arrive_at.slice(0, 10);
  const end = (stop.depart_at ?? stop.arrive_at).slice(0, 10);
  const last = new Date(Math.min(Date.parse(`${end}T00:00:00Z`), Date.parse(`${from}T00:00:00Z`) + (MAX_DAYS - 1) * 86_400_000)).toISOString().slice(0, 10);
  return { from, to: last < from ? from : last, key: `${stop.latitude.toFixed(2)},${stop.longitude.toFixed(2)},${from},${last}` };
}

function readAll(): Record<string, CacheEntry> {
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

export function cachedWeather(stop: StopForWeather): { result: WeatherResult; isStale: boolean } | null {
  const period = periodFor(stop);
  const entry = period ? readAll()[stop.id] : undefined;
  if (!period || !entry || entry.key !== period.key) return null;
  return { result: entry.result, isStale: Date.now() - entry.fetchedAt > FRESH_MS };
}

/** Fetches the weather of a station and keeps the last answer on the device for use without network. Null when not possible. */
export async function refreshWeather(stop: StopForWeather): Promise<WeatherResult | null> {
  const period = periodFor(stop);
  if (!period) return null;
  const cached = cachedWeather(stop);
  if (cached && !cached.isStale) return cached.result;
  const params = new URLSearchParams({ lat: String(stop.latitude), lon: String(stop.longitude), from: period.from, to: period.to });
  try {
    const res = await fetch(`/api/weather?${params}`, { headers: await authHeaders(), cache: 'no-store' });
    if (!res.ok) return null;
    const result = (await res.json()) as WeatherResult;
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ...readAll(), [stop.id]: { key: period.key, fetchedAt: Date.now(), result } satisfies CacheEntry }));
    } catch {
      /* storage full or blocked: the answer is still used this time */
    }
    return result;
  } catch {
    return null;
  }
}
