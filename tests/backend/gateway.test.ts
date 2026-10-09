import { describe, expect, it } from 'vitest';
import { backendAvailable, config } from './harness';

const available = await backendAvailable();
const APP_ORIGIN = process.env.APP_URL ?? 'http://localhost:18080';

// Headers the browser client really sends (supabase-js adds x-retry-count after a failed attempt, e.g. when the network returns).
const BROWSER_HEADERS = ['apikey', 'authorization', 'content-type', 'x-client-info', 'x-supabase-api-version', 'x-retry-count', 'prefer', 'range', 'accept-profile', 'content-profile', 'x-upsert'];

describe.skipIf(!available)('API gateway (Kong) for the browser app', () => {
  for (const path of ['/rest/v1/trips', '/auth/v1/token', '/storage/v1/object/media/x']) {
    it(`answers the CORS preflight for ${path} with every header the browser client sends`, async () => {
      const res = await fetch(`${config.url}${path}`, { method: 'OPTIONS', headers: { Origin: APP_ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': BROWSER_HEADERS.join(',') } });
      expect(res.status).toBeLessThan(300);
      expect(res.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
      const allowed = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase().split(/\s*,\s*/);
      for (const header of BROWSER_HEADERS) expect(allowed, header).toContain(header);
    });
  }

  it('does not grant cross-origin access to other sites', async () => {
    const res = await fetch(`${config.url}/rest/v1/trips`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } });
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
    expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
  });

  it('requires an API key for REST, auth and storage calls', async () => {
    for (const path of ['/rest/v1/trips', '/auth/v1/health', '/storage/v1/bucket']) {
      expect((await fetch(`${config.url}${path}`)).status, path).toBe(401);
    }
  });

  it('keeps PostgreSQL and internal services off the public gateway', async () => {
    for (const path of ['/pg/', '/meta/', '/studio/', '/realtime/v1/']) expect((await fetch(`${config.url}${path}`, { headers: { apikey: config.anonKey } })).status, path).toBeGreaterThanOrEqual(400);
  });
});

describe.skipIf(available)('API gateway (Kong) for the browser app', () => {
  it('is not_configured: no local Supabase stack reachable (run scripts/stack.sh up)', () => {
    expect(available).toBe(false);
  });
});
