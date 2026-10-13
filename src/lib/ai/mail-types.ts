import { z } from 'zod';

export const MAIL_SUGGESTION_KINDS = ['payment_received', 'payment_due', 'booking_ref', 'cancellation', 'info'] as const;
export type MailSuggestionKind = (typeof MAIL_SUGGESTION_KINDS)[number];

/** One thing a mail says that the app may offer to enter. Nothing here is booked without an adult confirming it. */
export const mailSuggestionDraftSchema = z.object({
  kind: z.enum(MAIL_SUGGESTION_KINDS),
  amount_minor: z.number().int().positive().max(100_000_000_000).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  reference: z.string().min(3).max(40).nullable(),
  text: z.string().min(1).max(300),
  /** Quote from the mail that supports the suggestion; must occur in the mail text. */
  evidence: z.string().min(1).max(400),
});
export type MailSuggestionDraft = z.infer<typeof mailSuggestionDraftSchema>;

export const MAIL_SUGGESTION_STATUSES = ['pending', 'accepted', 'dismissed'] as const;
export const mailSuggestionSchema = mailSuggestionDraftSchema.extend({
  id: z.string().min(1),
  status: z.enum(MAIL_SUGGESTION_STATUSES),
});
export type MailSuggestion = z.infer<typeof mailSuggestionSchema>;

export interface MailFacts {
  summary: string | null;
  suggestions: MailSuggestionDraft[];
}

export interface MailFactsReading extends MailFacts {
  provider: string;
  generated_at: string;
}

const squash = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
const digitsOf = (value: number) => String(value);

/**
 * Keeps only suggestions that the mail text itself backs up: the quote must occur in the mail, payments need an amount whose digits
 * appear in the quote, dates and references must occur in the mail. Protects against invented values and against mails that try
 * to instruct the model. Invalid items are dropped one by one.
 */
export function verifySuggestions(drafts: readonly unknown[], mailText: string): MailSuggestionDraft[] {
  const haystack = squash(mailText);
  const out: MailSuggestionDraft[] = [];
  for (const raw of drafts) {
    const parsed = mailSuggestionDraftSchema.safeParse(raw);
    if (!parsed.success) continue;
    const s = parsed.data;
    if (!haystack.includes(squash(s.evidence))) continue;
    const isPayment = s.kind === 'payment_received' || s.kind === 'payment_due';
    if (s.kind === 'payment_received' && (s.amount_minor === null || s.currency === null)) continue;
    if (s.amount_minor !== null) {
      const compact = s.evidence.replace(/[\s.,'’]/g, '');
      const whole = Math.floor(s.amount_minor / 100);
      const cents = s.amount_minor % 100;
      // "1.234,50" and "1234.5" both reduce to 123450 / 12345; accept the amount with or without trailing zero cents
      const wanted = [digitsOf(s.amount_minor), cents === 0 ? digitsOf(whole) : '', cents % 10 === 0 ? digitsOf(whole * 10 + cents / 10) : ''].filter(Boolean);
      if (!wanted.some((d) => compact.includes(d))) continue;
    } else if (isPayment && s.kind !== 'payment_due') continue;
    if (s.date !== null && s.kind !== 'info' && s.kind !== 'cancellation' && !/\d/.test(s.evidence)) continue;
    if (s.kind === 'booking_ref' && (s.reference === null || !haystack.includes(s.reference.toLowerCase()))) continue;
    out.push(s);
  }
  return out;
}

/** The first JSON object in the model's answer (also inside a code fence): { summary, suggestions[] }. */
export function parseMailFactsText(text: string, mailText: string): MailFacts {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) throw new Error('Keine Mail-Auswertung in der Antwort');
  let raw: { summary?: unknown; suggestions?: unknown };
  try {
    raw = JSON.parse(match[0]) as typeof raw;
  } catch {
    throw new Error('Mail-Auswertung nicht lesbar');
  }
  const summary = typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim().slice(0, 400) : null;
  return { summary, suggestions: verifySuggestions(Array.isArray(raw.suggestions) ? raw.suggestions : [], mailText) };
}
