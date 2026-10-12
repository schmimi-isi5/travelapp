/**
 * Speech to text for voice memos. Claude cannot take audio, so this is a separate, replaceable service behind one small
 * contract: an OpenAI-compatible `/audio/transcriptions` endpoint (OpenAI itself, Groq, or a self-hosted Whisper server).
 * Server side only: the key never reaches the browser, and the audio is neither stored nor logged here.
 */
export interface TranscriberStatus {
  provider: string;
  state: 'ready' | 'not_configured' | 'disabled';
  detail: string;
}

export interface Transcription {
  text: string;
  provider: string;
  generated_at: string;
}

export interface Transcriber {
  readonly id: string;
  status(): TranscriberStatus;
  transcribe(audio: Blob, options: { filename: string; language: string }): Promise<Transcription>;
}

/** Names the model should get right; it improves place names a lot and is no instruction. */
const VOCABULARY = 'Reisetagebuch einer Familie in Namibia und Botswana: Windhoek, Sossusvlei, Deadvlei, Swakopmund, Walvis Bay, Erongo, Etosha, Okaukuejo, Rundu, Popa Falls, Divundu, Okavango, Chobe, Kasane, Maun, Nata, Pula.';
const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini-transcribe';
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export class DisabledTranscriber implements Transcriber {
  readonly id = 'disabled';
  status(): TranscriberStatus {
    return { provider: this.id, state: 'disabled', detail: 'Die Abschrift von Sprachmemos ist nicht eingerichtet (TRANSCRIBE_PROVIDER).' };
  }
  async transcribe(): Promise<Transcription> {
    throw new Error('Transkription ist nicht eingerichtet');
  }
}

/** Test double: a fixed transcript with filler words, so that the tidy-up has something to do. */
export class StubTranscriber implements Transcriber {
  readonly id = 'stub';
  status(): TranscriberStatus {
    return { provider: this.id, state: 'ready', detail: 'Stub-Transkription für Tests.' };
  }
  async transcribe(): Promise<Transcription> {
    return { text: 'äh also wir waren heute am Wasserloch und ähm haben Elefanten gesehen', provider: this.id, generated_at: new Date().toISOString() };
  }
}

export class OpenAiCompatibleTranscriber implements Transcriber {
  readonly id = 'openai-compatible';
  constructor(
    private readonly config: { apiKey?: string; baseUrl?: string; model?: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private get model(): string {
    return this.config.model?.trim() || DEFAULT_MODEL;
  }

  status(): TranscriberStatus {
    if (!this.config.apiKey) return { provider: this.id, state: 'not_configured', detail: 'Nicht konfiguriert: TRANSCRIBE_API_KEY (oder OPENAI_API_KEY)' };
    return { provider: this.id, state: 'ready', detail: `Texterkennung (${this.model}) ist konfiguriert.` };
  }

  async transcribe(audio: Blob, options: { filename: string; language: string }): Promise<Transcription> {
    if (this.status().state !== 'ready') throw new Error('Transkription ist nicht konfiguriert');
    const form = new FormData();
    form.append('file', audio, options.filename);
    form.append('model', this.model);
    form.append('language', options.language);
    form.append('response_format', 'json');
    form.append('prompt', VOCABULARY);
    const response = await this.fetchImpl(`${(this.config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '')}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    // Only the status goes into the error: response bodies can contain the audio's words and are not logged.
    if (!response.ok) throw new Error(`Transkriptionsdienst antwortete mit HTTP ${response.status}`);
    const json = (await response.json()) as { text?: unknown };
    if (typeof json.text !== 'string') throw new Error('Transkriptionsdienst lieferte keinen Text');
    return { text: json.text.trim(), provider: `${this.id}:${this.model}`, generated_at: new Date().toISOString() };
  }
}

export function createTranscriberFromEnv(env: Record<string, string | undefined> = process.env): Transcriber {
  switch (env.TRANSCRIBE_PROVIDER) {
    case 'openai':
      return new OpenAiCompatibleTranscriber({ apiKey: env.TRANSCRIBE_API_KEY || env.OPENAI_API_KEY, baseUrl: env.TRANSCRIBE_BASE_URL, model: env.TRANSCRIBE_MODEL });
    case 'stub':
      return new StubTranscriber();
    default:
      return new DisabledTranscriber();
  }
}
