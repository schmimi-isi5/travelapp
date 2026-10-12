import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as postReceipt } from '@/app/api/ai/receipt/route';
import { backendAvailable, createUser, deleteCreatedUsers, type TestUser } from './harness';

const available = await backendAvailable();
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'utf8').toString('utf8');
const call = (body: unknown, token: string | null) => postReceipt(new Request('http://localhost/api/ai/receipt', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));

describe.skipIf(!available)('receipt reading route (real authentication, stub provider)', () => {
  let user: TestUser;
  const previous = { mode: process.env.NEXT_PUBLIC_APP_MODE, provider: process.env.AI_PROVIDER };

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_APP_MODE = 'supabase';
    process.env.AI_PROVIDER = 'stub';
    user = await createUser('beleg');
  });
  afterAll(async () => {
    process.env.NEXT_PUBLIC_APP_MODE = previous.mode;
    if (previous.provider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = previous.provider;
    await deleteCreatedUsers();
  });

  it('is only for signed-in users', async () => {
    expect((await call({ consent: true, image: JPEG }, null)).status).toBe(401);
    expect((await call({ consent: true, image: JPEG }, 'not-a-token')).status).toBe(401);
  });

  it('returns suggested fields for a JPEG and never stores or caches the answer', async () => {
    const res = await call({ consent: true, image: JPEG }, user.accessToken);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ amount: 123.45, currency: 'NAD', merchant: 'Stub-Laden', provider: 'stub' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('refuses a missing consent, other file types, text, oversized photos and unknown fields in the shape', async () => {
    for (const bad of [{ image: JPEG }, { consent: true }, { consent: true, image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' }, { consent: true, image: '<script>alert(1)</script>' }, { consent: true, image: `/9j/${'A'.repeat(2_800_100)}` }, null]) {
      expect((await call(bad, user.accessToken)).status).toBe(400);
    }
  });

  it('says so honestly when no provider can read images', async () => {
    process.env.AI_PROVIDER = 'disabled';
    try {
      const res = await call({ consent: true, image: JPEG }, user.accessToken);
      expect(res.status).toBe(503);
      expect((await res.json()).message).toContain('nicht verfügbar');
    } finally {
      process.env.AI_PROVIDER = 'stub';
    }
  });
});
