import { z } from 'zod';
import { EXPENSE_CATEGORIES } from '../domain/schemas';

/** What the AI may read from a receipt photo. Every field can be null: nothing is guessed. */
export const receiptSchema = z.object({
  amount: z.number().positive().max(10_000_000).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  merchant: z.string().max(80).nullable(),
  category: z.enum(EXPENSE_CATEGORIES).nullable(),
});
export type ReceiptSuggestion = z.infer<typeof receiptSchema>;

/** "1.234,50" and "1234.50" both mean the same amount; everything else is not a number. */
export function toAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(text)) return null;
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  const decimalAt = Math.max(lastComma, lastDot);
  const digits = decimalAt >= 0 && text.length - decimalAt - 1 <= 2 ? `${text.slice(0, decimalAt).replace(/[.,]/g, '')}.${text.slice(decimalAt + 1)}` : text.replace(/[.,]/g, '');
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The first JSON object in the model's answer (also inside a code fence), checked against the schema; unusable fields become null. */
export function parseReceiptText(text: string): ReceiptSuggestion {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) throw new Error('Keine Beleg-Daten in der Antwort');
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    throw new Error('Beleg-Daten nicht lesbar');
  }
  const candidate = {
    amount: toAmount(raw.amount),
    currency: typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : null,
    date: typeof raw.date === 'string' ? raw.date.trim() : null,
    merchant: typeof raw.merchant === 'string' && raw.merchant.trim() ? raw.merchant.trim().slice(0, 80) : null,
    category: typeof raw.category === 'string' ? raw.category.trim().toLowerCase() : null,
  };
  const out = { ...candidate };
  // a single wrong field must not throw away the others
  for (const key of Object.keys(candidate) as (keyof typeof candidate)[]) {
    if (!receiptSchema.shape[key].safeParse(candidate[key]).success) (out as Record<string, unknown>)[key] = null;
  }
  return receiptSchema.parse(out);
}
