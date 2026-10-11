import { describe, expect, it, vi } from 'vitest';
import { loadWeather, parseQuery, WeatherInputError } from '@/lib/server/weather';

const NOW = new Date('2026-10-11T12:00:00Z'); // region date 2026-10-11, forecast window until 2026-10-26
const q = (lat: number, lon: number, from: string, to: string) => ({ latitude: lat, longitude: lon, from, to });
const iso = (d: number) => new Date(d * 86_400_000).toISOString().slice(0, 10);
const days = (from: string, to: string) => Array.from({ length: Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 }, (_, i) => iso(Math.floor(Date.parse(from) / 86_400_000) + i));

/** Fake Open-Meteo: forecast with fixed values; archive with a value per year (year % 10 degrees) and rain in every second year. */
function fakeFetch() {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    const from = u.searchParams.get('start_date')!;
    const to = u.searchParams.get('end_date')!;
    const list = days(from, to);
    if (u.hostname.startsWith('archive')) {
      const year = Number(from.slice(0, 4));
      return { ok: true, status: 200, json: async () => ({ daily: { time: list, temperature_2m_max: list.map(() => 20 + (year % 10)), temperature_2m_min: list.map(() => 10), precipitation_sum: list.map(() => (year % 2 === 0 ? 2 : 0)), wind_speed_10m_max: list.map(() => 20) } }) };
    }
    return { ok: true, status: 200, json: async () => ({ daily: { time: list, temperature_2m_max: list.map(() => 34), temperature_2m_min: list.map(() => 4), precipitation_sum: list.map(() => 0), precipitation_probability_max: list.map(() => 5), wind_speed_10m_max: list.map(() => 22), uv_index_max: list.map(() => 9.3), sunrise: list.map((d) => `${d}T06:25`), sunset: list.map((d) => `${d}T19:01`) } }) };
  });
  return { fn, calls };
}

describe('weather query', () => {
  it('accepts valid input and rejects bad coordinates, dates and periods', () => {
    expect(parseQuery(new URLSearchParams({ lat: '-24.5', lon: '15.8', from: '2026-10-13', to: '2026-10-15' }))).toEqual(q(-24.5, 15.8, '2026-10-13', '2026-10-15'));
    for (const bad of [{ lat: 'x', lon: '1', from: '2026-10-13', to: '2026-10-14' }, { lat: '95', lon: '1', from: '2026-10-13', to: '2026-10-14' }, { lat: '1', lon: '1', from: '13.10.', to: '2026-10-14' }, { lat: '1', lon: '1', from: '2026-10-15', to: '2026-10-14' }, { lat: '1', lon: '1', from: '2026-10-01', to: '2026-11-30' }]) {
      expect(() => parseQuery(new URLSearchParams(bad as Record<string, string>))).toThrow(WeatherInputError);
    }
  });
});

describe('loading weather', () => {
  it('uses the forecast for the next 15 days, with daylight times and UV', async () => {
    const { fn, calls } = fakeFetch();
    const result = await loadWeather(q(-24.51, 15.81, '2026-10-13', '2026-10-15'), { fetchImpl: fn, now: NOW });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('api.open-meteo.com/v1/forecast');
    expect(calls[0]).toContain('timezone=Africa%2FWindhoek');
    expect(result.days).toHaveLength(3);
    expect(result.days[0]).toMatchObject({ date: '2026-10-13', source: 'forecast', tmax: 34, tmin: 4, uvMax: 9.3, sunrise: '2026-10-13T06:25', sunset: '2026-10-13T19:01' });
    expect(result.climateYears).toEqual([]);
    expect(result.attribution).toContain('Open-Meteo');
  });

  it('switches to climate averages of the last five years for days beyond the forecast window and says so', async () => {
    const { fn, calls } = fakeFetch();
    const result = await loadWeather(q(-17.8, 25.15, '2026-10-25', '2026-10-28'), { fetchImpl: fn, now: NOW });
    expect(result.days.map((d) => [d.date, d.source])).toEqual([['2026-10-25', 'forecast'], ['2026-10-26', 'forecast'], ['2026-10-27', 'climate'], ['2026-10-28', 'climate']]);
    expect(calls.filter((c) => c.includes('archive-api')).length).toBe(5);
    expect(result.climateYears).toEqual([2021, 2022, 2023, 2024, 2025]);
    const climate = result.days[2]!;
    expect(climate.tmax).toBe(23); // mean of 21..25 (20 + year % 10 for 2021..2025)
    expect(climate.rainChance).toBe(40); // rain in 2022 and 2024 of five years
    expect(climate).toMatchObject({ uvMax: null, sunrise: null });
  });

  it('leaves out days in the past and survives a missing archive year', async () => {
    const { fn } = fakeFetch();
    const failing = vi.fn(async (url: string) => (url.includes('start_date=2023') && url.includes('archive') ? { ok: false, status: 500, json: async () => ({}) } : fn(url)));
    const result = await loadWeather(q(-22.5, 17.0, '2026-10-08', '2026-10-12'), { fetchImpl: failing, now: NOW });
    expect(result.days.map((d) => d.date)).toEqual(['2026-10-11', '2026-10-12']);
    const later = await loadWeather(q(-22.6, 17.1, '2026-11-20', '2026-11-21'), { fetchImpl: failing, now: NOW });
    expect(later.climateYears).toEqual([2021, 2022, 2024, 2025]);
    expect(later.days).toHaveLength(2);
  });

  it('caches answers so that repeated opening of a station does not hit the weather service again', async () => {
    const { fn } = fakeFetch();
    await loadWeather(q(-19.2, 15.9, '2026-10-21', '2026-10-22'), { fetchImpl: fn, now: NOW });
    const before = fn.mock.calls.length;
    await loadWeather(q(-19.2, 15.9, '2026-10-21', '2026-10-22'), { fetchImpl: fn, now: NOW });
    expect(fn.mock.calls.length).toBe(before);
  });

  it('reports an unavailable service as an error', async () => {
    const down = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    await expect(loadWeather(q(-20.5, 16.5, '2026-10-12', '2026-10-13'), { fetchImpl: down, now: NOW })).rejects.toThrow(/HTTP 503/);
  });
});
