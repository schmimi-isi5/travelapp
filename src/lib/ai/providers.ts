import { runLocal } from './fallback';
import type { AiProvider, AiRequest, AiResult, ProviderStatus } from './types';

/** Used when AI is disabled: always answers with clearly labeled local rules. */
export class DeterministicFallbackProvider implements AiProvider {
  readonly id = 'local-rules';
  status(): ProviderStatus {
    return { provider: this.id, state: 'disabled', detail: 'KI ist deaktiviert (AI_PROVIDER=disabled). Es werden lokale, regelbasierte Hilfen genutzt.' };
  }
  async generate(request: AiRequest): Promise<AiResult> {
    return runLocal(request);
  }
}

/** Test double (AI_PROVIDER=stub). Output is explicitly marked as stub output and must never ship to production. */
export class StubProvider implements AiProvider {
  readonly id = 'stub';
  status(): ProviderStatus {
    return { provider: this.id, state: 'ready', detail: 'Stub-Provider für Tests, erzeugt keine echten KI-Antworten.' };
  }
  async generate(request: AiRequest): Promise<AiResult> {
    const subject = request.input.question ?? request.input.stopTitle ?? `${request.input.entries?.length ?? 0} Einträge`;
    return {
      text: `[Stub-KI-Entwurf] Aufgabe „${request.task}“ zu: ${subject}`,
      origin: 'ai_generated',
      provider: this.id,
      generated_at: new Date().toISOString(),
      availability_note: 'Testentwurf des Stub-Providers, nicht inhaltlich geprüft.',
      sources: [],
    };
  }
}

/**
 * Konturos adapter. The API contract is not part of the handoff, so nothing is assumed beyond configuration:
 * the endpoint path comes from KONTUROS_COMPLETIONS_PATH and the response must contain `text`.
 * See docs/AI_INTEGRATION.md for the assumed request/response shape.
 */
export class KonturosProvider implements AiProvider {
  readonly id = 'konturos';
  constructor(
    private readonly config: { baseUrl?: string; apiKey?: string; path?: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  status(): ProviderStatus {
    const missing = [!this.config.baseUrl && 'KONTUROS_BASE_URL', !this.config.apiKey && 'KONTUROS_API_KEY', !this.config.path && 'KONTUROS_COMPLETIONS_PATH'].filter(Boolean);
    if (missing.length) return { provider: this.id, state: 'not_configured', detail: `Nicht konfiguriert: ${missing.join(', ')}` };
    return { provider: this.id, state: 'ready', detail: 'Konturos ist konfiguriert.' };
  }

  async generate(request: AiRequest): Promise<AiResult> {
    if (this.status().state !== 'ready') throw new Error('Konturos ist nicht konfiguriert');
    const url = new URL(this.config.path as string, this.config.baseUrl as string).toString();
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({ task: request.task, language: 'de', input: request.input }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Konturos antwortete mit HTTP ${response.status}`);
    const json = (await response.json()) as { text?: unknown; sources?: { title: string; url?: string }[] };
    if (typeof json.text !== 'string' || !json.text.trim()) throw new Error('Konturos lieferte keinen Text');
    return {
      text: json.text,
      origin: 'ai_generated',
      provider: this.id,
      generated_at: new Date().toISOString(),
      availability_note: 'KI-generierter Entwurf, nicht redaktionell geprüft. Keine Live-Daten garantiert.',
      sources: Array.isArray(json.sources) ? json.sources : [],
    };
  }
}

export function createProviderFromEnv(env: Record<string, string | undefined> = process.env): AiProvider {
  switch (env.AI_PROVIDER) {
    case 'konturos':
      return new KonturosProvider({ baseUrl: env.KONTUROS_BASE_URL, apiKey: env.KONTUROS_API_KEY, path: env.KONTUROS_COMPLETIONS_PATH });
    case 'stub':
      return new StubProvider();
    default:
      return new DeterministicFallbackProvider();
  }
}
