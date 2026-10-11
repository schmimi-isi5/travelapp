import type { WeatherDay, WeatherResult } from '@/lib/weather/types';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const TIMEZONE = 'Africa/Windhoek'; // Namibia and Botswana share UTC+2 all year
const FORECAST_DAYS_AHEAD = 15;
const CLIMATE_YEARS = 5;
const MAX_SPAN_DAYS = 21;
const FORECAST_TTL_MS = 3 * 3600_000;
const CLIMATE_TTL_MS = 7 * 24 * 3600_000;

export class WeatherInputError extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const isoOf = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);
const todayInRegion = (now: Date) => new Date(now.getTime() + 2 * 3600_000).toISOString().slice(0, 10);

export interface WeatherQuery {
  latitude: number;
  longitude: number;
  from: string;
  to: string;
}

export function parseQuery(params: URLSearchParams): WeatherQuery {
  const latitude = Number(params.get('lat'));
  const longitude = Number(params.get('lon'));
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new WeatherInputError('Ungültige Koordinaten.');
  if (!DATE.test(from) || !DATE.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) throw new WeatherInputError('Ungültiges Datum.');
  const span = dayNumber(to) - dayNumber(from) + 1;
  if (span < 1 || span > MAX_SPAN_DAYS) throw new WeatherInputError(`Der Zeitraum muss 1 bis ${MAX_SPAN_DAYS} Tage umfassen.`);
  return { latitude, longitude, from, to };
}

type Daily = Record<string, (number | string | null)[]>;
type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
const cache = new Map<string, { at: number; value: unknown }>();

async function fetchDaily(fetchImpl: FetchLike, url: string, ttl: number, now: number): Promise<Daily> {
  const hit = cache.get(url);
  if (hit && now - hit.at < ttl) return hit.value as Daily;
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Open-Meteo antwortete mit HTTP ${response.status}`);
  const json = (await response.json()) as { daily?: Daily };
  if (!json.daily?.time) throw new Error('Open-Meteo lieferte keine Tageswerte');
  cache.set(url, { at: now, value: json.daily });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return json.daily;
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const mean = (values: (number | null)[]): number | null => {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 10) / 10 : null;
};

function coords(q: WeatherQuery) {
  return `latitude=${q.latitude.toFixed(2)}&longitude=${q.longitude.toFixed(2)}&timezone=${encodeURIComponent(TIMEZONE)}`;
}

/**
 * Daily weather for a place and period. Days up to 15 days ahead are a model forecast; later days are climate values
 * (average of the same calendar days of the last five years) and are labelled as such. Days in the past are left out.
 */
export async function loadWeather(query: WeatherQuery, { fetchImpl = fetch as unknown as FetchLike, now = new Date() }: { fetchImpl?: FetchLike; now?: Date } = {}): Promise<WeatherResult> {
  const today = dayNumber(todayInRegion(now));
  const first = Math.max(dayNumber(query.from), today);
  const last = dayNumber(query.to);
  const days: WeatherDay[] = [];
  const climateYears: number[] = [];
  const t = now.getTime();

  const forecastLast = Math.min(last, today + FORECAST_DAYS_AHEAD);
  if (first <= forecastLast) {
    const url = `${FORECAST_URL}?${coords(query)}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max,sunrise,sunset&start_date=${isoOf(first)}&end_date=${isoOf(forecastLast)}`;
    const d = await fetchDaily(fetchImpl, url, FORECAST_TTL_MS, t);
    (d.time as string[]).forEach((date, i) =>
      days.push({ date, source: 'forecast', tmax: num(d.temperature_2m_max?.[i]), tmin: num(d.temperature_2m_min?.[i]), rainMm: num(d.precipitation_sum?.[i]), rainChance: num(d.precipitation_probability_max?.[i]), windMax: num(d.wind_speed_10m_max?.[i]), uvMax: num(d.uv_index_max?.[i]), sunrise: (d.sunrise?.[i] as string) ?? null, sunset: (d.sunset?.[i] as string) ?? null }),
    );
  }

  const climateFirst = Math.max(first, today + FORECAST_DAYS_AHEAD + 1);
  if (climateFirst <= last) {
    const year = new Date(now).getUTCFullYear();
    const wanted = Array.from({ length: last - climateFirst + 1 }, (_, i) => isoOf(climateFirst + i));
    const perDay = new Map<string, { tmax: (number | null)[]; tmin: (number | null)[]; rain: (number | null)[]; wind: (number | null)[]; uv: (number | null)[] }>(wanted.map((d) => [d, { tmax: [], tmin: [], rain: [], wind: [], uv: [] }]));
    for (let back = 1; back <= CLIMATE_YEARS; back++) {
      const y = year - back;
      const shift = (date: string) => `${y}${date.slice(4)}`;
      const url = `${ARCHIVE_URL}?${coords(query)}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&start_date=${shift(wanted[0]!)}&end_date=${shift(wanted[wanted.length - 1]!)}`;
      try {
        const d = await fetchDaily(fetchImpl, url, CLIMATE_TTL_MS, t);
        (d.time as string[]).forEach((date, i) => {
          const bucket = perDay.get(`${year}${date.slice(4)}`) ?? perDay.get(wanted.find((w) => w.slice(5) === date.slice(5)) ?? '');
          if (!bucket) return;
          bucket.tmax.push(num(d.temperature_2m_max?.[i]));
          bucket.tmin.push(num(d.temperature_2m_min?.[i]));
          bucket.rain.push(num(d.precipitation_sum?.[i]));
          bucket.wind.push(num(d.wind_speed_10m_max?.[i]));
        });
        climateYears.push(y);
      } catch {
        // one missing year only thins the average
      }
    }
    for (const date of wanted) {
      const b = perDay.get(date)!;
      if (b.tmax.length === 0) continue;
      const rainy = b.rain.filter((r): r is number => r !== null);
      days.push({ date, source: 'climate', tmax: mean(b.tmax), tmin: mean(b.tmin), rainMm: mean(b.rain), rainChance: rainy.length ? Math.round((rainy.filter((r) => r >= 1).length / rainy.length) * 100) : null, windMax: mean(b.wind), uvMax: null, sunrise: null, sunset: null });
    }
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return { days, fetchedAt: now.toISOString(), attribution: 'Wetterdaten: Open-Meteo.com (CC BY 4.0)', climateYears: climateYears.sort() };
}
