export type AiTask = 'summarize_journal' | 'answer_question' | 'draft_day_text';

export interface AiRequest {
  task: AiTask;
  /** Only the text the user explicitly chose to send. Never documents, passports or payment data. */
  input: { question?: string; entries?: { title: string; body: string }[]; stopTitle?: string; facts?: string[] };
}

/** `ai_generated` text comes from a model; `local_rule_based` is deterministic and says so in the UI. */
export type AiOrigin = 'ai_generated' | 'local_rule_based';

export interface AiResult {
  text: string;
  origin: AiOrigin;
  provider: string;
  generated_at: string;
  /** Human-readable note about freshness, e.g. "keine Live-Daten". */
  availability_note: string;
  sources: { title: string; url?: string }[];
}

export type ProviderState = 'disabled' | 'not_configured' | 'ready';

export interface ProviderStatus {
  provider: string;
  state: ProviderState;
  detail: string;
}

/** Server-side contract for AI backends. Implementations never run in the browser (no keys client-side). */
export interface AiProvider {
  readonly id: string;
  status(): ProviderStatus;
  generate(request: AiRequest): Promise<AiResult>;
}
