export type AiTask =
  | 'summarize_journal'
  | 'answer_question'
  | 'draft_day_text'
  /** A short friendly preview of the day, from the facts of the day briefing only. */
  | 'day_briefing'
  /** Next steps for the findings of the rule-based plan check (the findings are given as facts). */
  | 'check_plan'
  /** Three title ideas for a journal entry. */
  | 'suggest_title'
  /** Species names matching a sighting note (the species already known to the family are given as facts). */
  | 'suggest_species'
  /** A personal look back at the trip from journal entries and facts. */
  | 'trip_review'
  /** Smooths an automatic transcript of a voice memo: fixes recognition errors and filler words, invents nothing. */
  | 'clean_transcript';

export const AI_TASKS = ['summarize_journal', 'answer_question', 'draft_day_text', 'day_briefing', 'check_plan', 'suggest_title', 'suggest_species', 'trip_review', 'clean_transcript'] as const satisfies readonly AiTask[];

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

export interface ReceiptReading {
  receipt: import('./receipt-types').ReceiptSuggestion;
  provider: string;
  generated_at: string;
}

/** Server-side contract for AI backends. Implementations never run in the browser (no keys client-side). */
export interface AiProvider {
  readonly id: string;
  status(): ProviderStatus;
  generate(request: AiRequest): Promise<AiResult>;
  /** Reads a receipt photo (JPEG, base64). Only providers that can see images implement it. */
  extractReceipt?(image: { mediaType: 'image/jpeg'; base64: string }): Promise<ReceiptReading>;
}
