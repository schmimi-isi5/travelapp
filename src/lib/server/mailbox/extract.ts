import { parseAmountToMinor } from '@/lib/domain/money';
import { verifySuggestions, type MailFacts, type MailSuggestionDraft } from '@/lib/ai/mail-types';

const CURRENCY_WORDS: Record<string, string> = { '€': 'EUR', EUR: 'EUR', EURO: 'EUR', USD: 'USD', $: 'USD', NAD: 'NAD', 'N$': 'NAD', ZAR: 'ZAR', RAND: 'ZAR', BWP: 'BWP', PULA: 'BWP' };
const AMOUNT = /(?:(N\$|€|\$|EUR|USD|NAD|ZAR|BWP)\s?)?(\d{1,3}(?:[.,' ]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s?(EUR|USD|NAD|ZAR|BWP|€|\$|Euro|Rand|Pula)?/gi;
const RECEIVED = /(zahlung[^.]{0,40}erhalten|anzahlung[^.]{0,40}erhalten|zahlungseingang|eingegangen|payment[^.]{0,40}received|received[^.]{0,40}payment|deposit[^.]{0,40}received|received[^.]{0,40}deposit|thank you for (?:your )?payment|payment confirmed|haben wir erhalten)/i;
const DUE = /(fällig|zahlbar bis|bitte[^.]{0,40}überweisen|due (?:on|by|date)|balance[^.]{0,30}due|outstanding balance|please (?:pay|transfer)|restbetrag|payable (?:by|before))/i;
const CANCELLED = /(storniert|stornierung|cancell?ed|cancell?ation)/i;
const REF = /(?:booking|reservation|confirmation|buchungs?(?:nummer|nr)?|reservierung(?:snummer)?|referenz(?:nummer)?|reference)(?:\s*(?:reference|ref|number|no|nr|id|nummer))?\.?\s*[:#-]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,19})/gi;
const MONTHS: Record<string, number> = { january: 1, januar: 1, february: 2, februar: 2, march: 3, märz: 3, maerz: 3, april: 4, may: 5, mai: 5, june: 6, juni: 6, july: 7, juli: 7, august: 8, september: 9, october: 10, oktober: 10, november: 11, december: 12, dezember: 12 };

const pad = (n: number) => String(n).padStart(2, '0');
const isDate = (y: number, m: number, d: number) => y >= 2024 && y <= 2035 && m >= 1 && m <= 12 && d >= 1 && d <= 31;

/** Every date written in the text as YYYY-MM-DD (ISO, dd.mm.yyyy, "13 October 2026", "October 13, 2026"), with its position. */
export function findDates(text: string): { date: string; index: number }[] {
  const found: { date: string; index: number }[] = [];
  const add = (y: number, m: number, d: number, index: number) => isDate(y, m, d) && found.push({ date: `${y}-${pad(m)}-${pad(d)}`, index });
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) add(+m[1]!, +m[2]!, +m[3]!, m.index ?? 0);
  for (const m of text.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g)) add(+m[3]!, +m[2]!, +m[1]!, m.index ?? 0);
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\.?\s+([A-Za-zäöü]+)\s+(\d{4})\b/g)) add(+m[3]!, MONTHS[m[2]!.toLowerCase()] ?? 0, +m[1]!, m.index ?? 0);
  for (const m of text.matchAll(/\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g)) add(+m[3]!, MONTHS[m[1]!.toLowerCase()] ?? 0, +m[2]!, m.index ?? 0);
  return found.sort((a, b) => a.index - b.index);
}

/** Sentences and lines; a full stop inside a number ("1.234,50") does not end a sentence because no space follows it. */
function sentences(text: string): { text: string }[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((part) => part.trim()).filter(Boolean).map((part) => ({ text: part.slice(0, 380) }));
}

function amountsIn(sentence: string): { amountMinor: number; currency: string }[] {
  const out: { amountMinor: number; currency: string }[] = [];
  for (const m of sentence.matchAll(AMOUNT)) {
    const symbol = (m[1] ?? m[3] ?? '').toUpperCase();
    const currency = CURRENCY_WORDS[symbol];
    if (!currency) continue;
    const minor = parseAmountToMinor(m[2]!.replace(/ /g, ''), currency);
    if (minor !== null && minor > 0) out.push({ amountMinor: minor, currency });
  }
  return out;
}

/**
 * Pattern-based reading of one mail: payments received, payments due, booking references, cancellations. Conservative: it only
 * suggests what the text states in one sentence (amount + currency + keyword). Used when AI reading is off, and as the base
 * the AI result is merged into.
 */
export function extractFactsByRules(text: string): MailFacts {
  const body = text.slice(0, 20_000);
  const drafts: MailSuggestionDraft[] = [];
  for (const sentence of sentences(body)) {
    const isReceived = RECEIVED.test(sentence.text);
    const isDue = !isReceived && DUE.test(sentence.text);
    if (isReceived || isDue) {
      const amount = amountsIn(sentence.text)[0];
      const date = findDates(sentence.text)[0]?.date ?? null;
      if (isReceived && amount) drafts.push({ kind: 'payment_received', amount_minor: amount.amountMinor, currency: amount.currency, date, reference: null, text: 'Zahlung laut Mail erhalten', evidence: sentence.text });
      if (isDue && (amount || date)) drafts.push({ kind: 'payment_due', amount_minor: amount?.amountMinor ?? null, currency: amount?.currency ?? null, date, reference: null, text: 'Zahlung laut Mail fällig', evidence: sentence.text });
    }
    if (CANCELLED.test(sentence.text)) drafts.push({ kind: 'cancellation', amount_minor: null, currency: null, date: null, reference: null, text: 'Die Mail erwähnt eine Stornierung', evidence: sentence.text });
  }
  const seenRefs = new Set<string>();
  for (const m of body.matchAll(REF)) {
    const ref = m[1]!.toUpperCase();
    if (!/\d/.test(ref) || seenRefs.has(ref)) continue;
    seenRefs.add(ref);
    drafts.push({ kind: 'booking_ref', amount_minor: null, currency: null, date: null, reference: ref, text: `Buchungsreferenz ${ref}`, evidence: m[0].trim().slice(0, 200) });
  }
  return { summary: null, suggestions: verifySuggestions(drafts, body) };
}

const keyOf = (s: MailSuggestionDraft) => [s.kind, s.amount_minor, s.currency, s.date, s.reference].join('|');

/** Union of rule-based and AI suggestions without duplicates; the AI summary (if any) is kept. */
export function mergeFacts(rules: MailFacts, ai: MailFacts | null): MailFacts {
  if (!ai) return rules;
  const seen = new Set<string>();
  const suggestions = [...rules.suggestions, ...ai.suggestions].filter((s) => {
    const key = keyOf(s);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { summary: ai.summary ?? rules.summary, suggestions };
}
