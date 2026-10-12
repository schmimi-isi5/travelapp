import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getFx } from '@/app/api/fx/route';
import { resetFxCache } from '@/lib/server/fx';
import { backendAvailable, createUser, deleteCreatedUsers, type TestUser } from './harness';

const available = await backendAvailable();
const realFetch = globalThis.fetch;
const call = (query: string, token: string | null) => getFx(new Request(`http://localhost/api/fx?${query}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }));

describe.skipIf(!available)('exchange rate route (real authentication, stubbed rate service)', () => {
  let user: TestUser;
  const previous = process.env.NEXT_PUBLIC_APP_MODE;
  const upstream: string[] = [];
  let isUp = true;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_APP_MODE = 'supabase';
    user = await createUser('kurs');
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes('open.er-api.com')) return realFetch(input, init);
      upstream.push(url);
      if (!isUp) return new Response('down', { status: 503 });
      return new Response(JSON.stringify({ result: 'success', time_last_update_utc: 'Mon, 12 Oct 2026 00:02:31 +0000', rates: { NAD: 20.5, BWP: 15.2 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
  });
  beforeEach(() => {
    resetFxCache();
    isUp = true;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    process.env.NEXT_PUBLIC_APP_MODE = previous;
    await deleteCreatedUsers();
  });

  it('is no open proxy: visitors, made-up tokens and the anon key are refused', async () => {
    expect((await call('from=EUR&to=NAD', null)).status).toBe(401);
    expect((await call('from=EUR&to=NAD', 'not-a-token')).status).toBe(401);
    expect((await call('from=EUR&to=NAD', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'x')).status).toBe(401);
    expect(upstream).toEqual([]);
  });

  it('answers a signed-in user with the rate, its day and its source', async () => {
    const res = await call('from=EUR&to=NAD', user.accessToken);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ from: 'EUR', to: 'NAD', rate: 20.5, asOf: '2026-10-12', source: expect.stringContaining('open.er-api.com') });
    expect(res.headers.get('cache-control')).toContain('private');
  });

  it('rejects invalid currencies with 400 and reports an unreachable service as 502', async () => {
    for (const bad of ['', 'from=EUR', 'from=EUR&to=EUR', 'from=EURO&to=NAD', 'from=EUR&to=ZZZ']) expect((await call(bad, user.accessToken)).status, bad).toBe(400);
    isUp = false;
    resetFxCache(); // the earlier request cached EUR; the outage is only visible without the cache
    expect((await call('from=EUR&to=NAD', user.accessToken)).status).toBe(502);
  });
});
