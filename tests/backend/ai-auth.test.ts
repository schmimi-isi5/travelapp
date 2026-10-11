import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as generate } from '@/app/api/ai/generate/route';
import { backendAvailable, createUser, deleteCreatedUsers, type TestUser } from './harness';

const available = await backendAvailable();

const call = (token: string | null, body: unknown = { consent: true, task: 'answer_question', input: { question: 'Wie ist das Wetter?' } }) =>
  generate(new Request('http://localhost/api/ai/generate', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));

describe.skipIf(!available)('AI route access control (supabase mode, real auth)', () => {
  let user: TestUser;
  const previous = { mode: process.env.NEXT_PUBLIC_APP_MODE, provider: process.env.AI_PROVIDER };

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_APP_MODE = 'supabase';
    process.env.AI_PROVIDER = 'stub';
    user = await createUser('ki');
  });
  afterAll(async () => {
    process.env.NEXT_PUBLIC_APP_MODE = previous.mode;
    process.env.AI_PROVIDER = previous.provider;
    await deleteCreatedUsers();
  });

  it('refuses strangers: no token, a made-up token and an anon key are all 401 and spend nothing', async () => {
    expect((await call(null)).status).toBe(401);
    expect((await call('not-a-real-token')).status).toBe(401);
    expect((await call(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'x')).status).toBe(401);
  });

  it('answers a signed-in user, but still requires the explicit consent flag', async () => {
    const ok = await call(user.accessToken);
    expect(ok.status).toBe(200);
    expect((await ok.json()).origin).toBe('ai_generated');
    expect((await call(user.accessToken, { consent: false, task: 'answer_question', input: { question: 'x' } })).status).toBe(400);
  });

  it('caps requests per user per hour so a runaway client cannot burn the budget', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 35; i++) statuses.push((await call(user.accessToken)).status);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
  });
});
