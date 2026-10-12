import { describe, expect, it, vi } from 'vitest';
import { createTranscriberFromEnv, OpenAiCompatibleTranscriber } from '@/lib/server/transcribe';

const audio = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });
const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('transcriber choice and status', () => {
  it('is off by default, ready as stub, and not configured without a key', () => {
    expect(createTranscriberFromEnv({}).status().state).toBe('disabled');
    expect(createTranscriberFromEnv({ TRANSCRIBE_PROVIDER: 'stub' }).status().state).toBe('ready');
    expect(createTranscriberFromEnv({ TRANSCRIBE_PROVIDER: 'openai' }).status()).toMatchObject({ state: 'not_configured', detail: expect.stringContaining('TRANSCRIBE_API_KEY') });
    expect(createTranscriberFromEnv({ TRANSCRIBE_PROVIDER: 'openai', OPENAI_API_KEY: 'k' }).status().state).toBe('ready');
    expect(createTranscriberFromEnv({ TRANSCRIBE_PROVIDER: 'openai', TRANSCRIBE_API_KEY: 'k', TRANSCRIBE_MODEL: 'whisper-large-v3-turbo' }).status().detail).toContain('whisper-large-v3-turbo');
  });
});

describe('OpenAI-compatible transcription', () => {
  it('posts the audio as multipart with model, German language and a place-name hint, and returns the trimmed text', async () => {
    const fetchMock = reply({ text: '  Wir waren in Etosha.  ' });
    const result = await new OpenAiCompatibleTranscriber({ apiKey: 'sk-test', baseUrl: 'https://stt.example/v1/', model: 'm1' }, fetchMock as unknown as typeof fetch).transcribe(audio, { filename: 'memo.webm', language: 'de' });
    expect(result).toMatchObject({ text: 'Wir waren in Etosha.', provider: 'openai-compatible:m1' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://stt.example/v1/audio/transcriptions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-test' });
    const form = init.body as FormData;
    expect(form.get('model')).toBe('m1');
    expect(form.get('language')).toBe('de');
    expect(String(form.get('prompt'))).toContain('Sossusvlei');
    expect((form.get('file') as File).name).toBe('memo.webm');
  });

  it('puts only the HTTP status into errors (the body may contain the spoken words) and refuses without a key', async () => {
    const down = reply({ error: { message: 'secret words from the memo' } }, 500);
    await expect(new OpenAiCompatibleTranscriber({ apiKey: 'k' }, down as unknown as typeof fetch).transcribe(audio, { filename: 'a.webm', language: 'de' })).rejects.toThrow('HTTP 500');
    await expect(new OpenAiCompatibleTranscriber({ apiKey: 'k' }, down as unknown as typeof fetch).transcribe(audio, { filename: 'a.webm', language: 'de' })).rejects.not.toThrow(/secret/);
    await expect(new OpenAiCompatibleTranscriber({}).transcribe(audio, { filename: 'a.webm', language: 'de' })).rejects.toThrow('nicht konfiguriert');
    await expect(new OpenAiCompatibleTranscriber({ apiKey: 'k' }, reply({ text: 5 }) as unknown as typeof fetch).transcribe(audio, { filename: 'a.webm', language: 'de' })).rejects.toThrow('keinen Text');
  });
});
