import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/ai/generate/route';
import { GET as status } from '@/app/api/ai/status/route';
import { GET as health } from '@/app/api/health/route';

const post = (body: unknown) => POST(new Request('http://x/api/ai/generate', { method: 'POST', body: JSON.stringify(body) }));

afterEach(() => vi.unstubAllEnvs());

describe('AI API routes', () => {
  it('rejects requests without explicit consent', async () => {
    vi.stubEnv('AI_PROVIDER', 'stub');
    const res = await post({ task: 'answer_question', input: { question: 'hi' } });
    expect(res.status).toBe(400);
  });
  it('rejects oversized or malformed input', async () => {
    vi.stubEnv('AI_PROVIDER', 'stub');
    expect((await post({ consent: true, task: 'summarize_journal', input: { entries: [{ title: 't', body: 'x'.repeat(9000) }] } })).status).toBe(400);
    expect((await post({ consent: true, task: 'delete_everything', input: {} })).status).toBe(400);
  });
  it('answers 503 with a clear reason when no provider is configured', async () => {
    vi.stubEnv('AI_PROVIDER', 'disabled');
    const res = await post({ consent: true, task: 'answer_question', input: { question: 'hi' } });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('AI_NOT_AVAILABLE');
  });
  it('returns a labeled stub draft with consent', async () => {
    vi.stubEnv('AI_PROVIDER', 'stub');
    const res = await post({ consent: true, task: 'answer_question', input: { question: 'Wasserloch' } });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.origin).toBe('ai_generated');
    expect(json.text).toMatch(/Stub/);
  });
  it('status and health never leak secrets', async () => {
    vi.stubEnv('AI_PROVIDER', 'konturos');
    vi.stubEnv('KONTUROS_API_KEY', 'super-secret');
    const body = JSON.stringify(await (await status()).json()) + JSON.stringify(await (await health(new Request('http://x/api/health'))).json());
    expect(body).not.toContain('super-secret');
  });
});
