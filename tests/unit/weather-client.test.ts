import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedWeather, refreshWeather } from '@/lib/weather/client';
import type { WeatherResult } from '@/lib/weather/types';

vi.mock('@/lib/supabase/auth-headers', () => ({ authHeaders: async () => ({}) }));

const stop = { id: 's1', latitude: -24.75, longitude: 15.29, arrive_at: '2026-10-14', depart_at: '2026-10-16' };
const result = (tmax: number): WeatherResult => ({ days: [{ date: '2026-10-14', source: 'forecast', tmax, tmin: 8, rainMm: 0, rainChance: 0, windMax: 10, uvMax: 9, sunrise: '2026-10-14T06:12', sunset: '2026-10-14T18:21' }], fetchedAt: '2026-10-12T08:00:00Z', attribution: 'Wetterdaten: Open-Meteo.com (CC BY 4.0)', climateYears: [] });
const HOUR = 3600_000;

/** Minimal in-memory localStorage; the client reads and writes it through `window`. */
function installStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) } });
}

describe('weather on the device: outage and recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T08:00:00Z'));
    installStorage();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps the last answer through an outage and marks it as old instead of dropping it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => result(30) })));
    expect(await refreshWeather(stop)).toMatchObject({ days: [{ tmax: 30 }] });
    expect(cachedWeather(stop)).toMatchObject({ isStale: false });

    vi.setSystemTime(new Date('2026-10-12T08:00:00Z').getTime() + 4 * HOUR); // past the 3 hour freshness
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Open-Meteo nicht erreichbar'); }));
    expect(await refreshWeather(stop)).toBeNull(); // no answer, but also no exception
    expect(cachedWeather(stop)).toMatchObject({ isStale: true, result: { days: [{ tmax: 30 }] } });
  });

  it('treats an error response like an outage and keeps the old data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => result(31) })));
    await refreshWeather(stop);
    vi.setSystemTime(new Date('2026-10-12T08:00:00Z').getTime() + 5 * HOUR);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })));
    expect(await refreshWeather(stop)).toBeNull();
    expect(cachedWeather(stop)?.result.days[0]?.tmax).toBe(31);
  });

  it('recovers: the next successful answer replaces the old one and is fresh again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => result(30) })));
    await refreshWeather(stop);
    vi.setSystemTime(new Date('2026-10-12T08:00:00Z').getTime() + 4 * HOUR);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => result(27) })));
    expect(await refreshWeather(stop)).toMatchObject({ days: [{ tmax: 27 }] });
    expect(cachedWeather(stop)).toMatchObject({ isStale: false, result: { days: [{ tmax: 27 }] } });
  });

  it('does not refetch while the data is fresh, and never reuses data for different dates', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => result(30) }));
    vi.stubGlobal('fetch', fetchMock);
    await refreshWeather(stop);
    await refreshWeather(stop);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cachedWeather({ ...stop, arrive_at: '2026-10-20', depart_at: '2026-10-22' })).toBeNull();
    expect(cachedWeather({ ...stop, latitude: null })).toBeNull();
  });
});
