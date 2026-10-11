import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GET as getWeather } from '@/app/api/weather/route';
import { backendAvailable, createUser, deleteCreatedUsers, type TestUser } from './harness';

const available = await backendAvailable();
const realFetch = globalThis.fetch;

const call = (query: string, token: string | null) =>
  getWeather(new Request(`http://localhost/api/weather?${query}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }));
const valid = (from = '2026-10-13', to = '2026-10-14') => `lat=-24.5&lon=15.8&from=${from}&to=${to}`;

describe.skipIf(!available)('weather route (real authentication, stubbed weather service)', () => {
  let user: TestUser;
  const previous = process.env.NEXT_PUBLIC_APP_MODE;
  const upstream: string[] = [];

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_APP_MODE = 'supabase';
    user = await createUser('wetter');
    // only the weather service is faked; Supabase calls of the route pass through to the real stack
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes('open-meteo.com')) return realFetch(input, init);
      upstream.push(url);
      const start = new URL(url).searchParams.get('start_date')!;
      const end = new URL(url).searchParams.get('end_date')!;
      const list: string[] = [];
      for (let t = Date.parse(start); t <= Date.parse(end); t += 86_400_000) list.push(new Date(t).toISOString().slice(0, 10));
      return new Response(JSON.stringify({ daily: { time: list, temperature_2m_max: list.map(() => 33), temperature_2m_min: list.map(() => 9), precipitation_sum: list.map(() => 0), precipitation_probability_max: list.map(() => 0), wind_speed_10m_max: list.map(() => 18), uv_index_max: list.map(() => 9), sunrise: list.map((d) => `${d}T06:25`), sunset: list.map((d) => `${d}T19:01`) } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    process.env.NEXT_PUBLIC_APP_MODE = previous;
    await deleteCreatedUsers();
  });

  it('is no open proxy: visitors, made-up tokens and the anon key are refused', async () => {
    expect((await call(valid(), null)).status).toBe(401);
    expect((await call(valid(), 'not-a-token')).status).toBe(401);
    expect((await call(valid(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'x')).status).toBe(401);
    expect(upstream).toEqual([]);
  });

  it('answers a signed-in user with daily weather and the source', async () => {
    const res = await call(valid('2099-01-01', '2099-01-02'), user.accessToken); // far future: dates are valid, climate path
    expect([200, 502]).toContain(res.status);
    const near = await call(`lat=-19.2&lon=15.9&from=${new Date().toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`, user.accessToken);
    expect(near.status).toBe(200);
    const body = await near.json();
    expect(body.days[0]).toMatchObject({ source: 'forecast', tmax: 33, tmin: 9, uvMax: 9 });
    expect(body.attribution).toContain('Open-Meteo');
    expect(near.headers.get('cache-control')).toContain('private');
  });

  it('rejects invalid coordinates, dates and periods with 400', async () => {
    for (const bad of ['lat=abc&lon=1&from=2026-10-13&to=2026-10-14', 'lat=1&lon=1&from=2026-13-40&to=2026-10-14', 'lat=1&lon=1&from=2026-10-14&to=2026-10-13', 'lat=1&lon=1&from=2026-01-01&to=2026-12-31', '']) {
      expect((await call(bad, user.accessToken)).status, bad).toBe(400);
    }
  });
});
