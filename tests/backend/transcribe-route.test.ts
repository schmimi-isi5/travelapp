import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as getStatus, POST as postTranscribe } from '@/app/api/ai/transcribe/route';
import { backendAvailable, createUser, deleteCreatedUsers, type TestUser } from './harness';

const available = await backendAvailable();
const memo = (type = 'audio/webm', size = 2048) => new File([new Uint8Array(size).fill(7)], 'memo.webm', { type });
const call = (fields: Record<string, string | Blob | undefined>, token: string | null) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) form.append(key, value);
  return postTranscribe(new Request('http://localhost/api/ai/transcribe', { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: form }));
};

describe.skipIf(!available)('transcription route (real authentication, stub service)', () => {
  let user: TestUser;
  const previous = { mode: process.env.NEXT_PUBLIC_APP_MODE, provider: process.env.TRANSCRIBE_PROVIDER };

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_APP_MODE = 'supabase';
    process.env.TRANSCRIBE_PROVIDER = 'stub';
    user = await createUser('abschrift');
  });
  afterAll(async () => {
    process.env.NEXT_PUBLIC_APP_MODE = previous.mode;
    if (previous.provider === undefined) delete process.env.TRANSCRIBE_PROVIDER;
    else process.env.TRANSCRIBE_PROVIDER = previous.provider;
    await deleteCreatedUsers();
  });

  it('is only for signed-in users', async () => {
    expect((await call({ consent: 'true', file: memo() }, null)).status).toBe(401);
    expect((await call({ consent: 'true', file: memo() }, 'not-a-token')).status).toBe(401);
  });

  it('returns the text of a voice memo and neither stores nor caches it', async () => {
    const res = await call({ consent: 'true', language: 'de', file: memo() }, user.accessToken);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ text: expect.stringContaining('Wasserloch'), provider: 'stub' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('refuses a missing consent or file, other file types and empty or oversized recordings', async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'x.webm', { type: 'audio/webm' });
    for (const bad of [{ file: memo() }, { consent: 'true' }, { consent: 'true', file: memo('image/png') }, { consent: 'true', file: memo('audio/webm', 0) }, { consent: 'true', file: big }, { consent: 'yes', file: memo() }]) {
      expect((await call(bad, user.accessToken)).status).toBe(400);
    }
  });

  it('accepts what phones record (webm/opus on Android, mp4/aac on iPhone)', async () => {
    expect((await call({ consent: 'true', file: memo('audio/webm;codecs=opus') }, user.accessToken)).status).toBe(200);
    expect((await call({ consent: 'true', file: memo('audio/mp4') }, user.accessToken)).status).toBe(200);
  });

  it('says honestly when no service is set up, and the status tells so before anyone records', async () => {
    expect(await (await getStatus()).json()).toMatchObject({ state: 'ready', provider: 'stub' });
    process.env.TRANSCRIBE_PROVIDER = 'disabled';
    try {
      const res = await call({ consent: 'true', file: memo() }, user.accessToken);
      expect(res.status).toBe(503);
      expect((await res.json()).message).toContain('nicht eingerichtet');
      expect(await (await getStatus()).json()).toMatchObject({ state: 'disabled' });
    } finally {
      process.env.TRANSCRIBE_PROVIDER = 'stub';
    }
  });
});
