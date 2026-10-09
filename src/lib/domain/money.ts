import type { Payment } from './schemas';

/** Minor-unit exponent per currency; defaults to 2 for unlisted ISO-4217 codes. */
const MINOR_DIGITS: Record<string, number> = { JPY: 0, KRW: 0, BHD: 3, KWD: 3 };

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency] ?? 2;
}

/** Parses user input such as "1.234,50" or "1234.5" into minor units. Returns null when invalid. */
export function parseAmountToMinor(input: string, currency: string): number | null {
  const trimmed = input.trim().replace(/\s/g, '');
  if (!trimmed) return null;
  const digits = minorDigits(currency);
  let normalized = trimmed;
  const lastComma = trimmed.lastIndexOf(',');
  const lastDot = trimmed.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    normalized = lastComma > lastDot ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed.replace(/,/g, '');
  } else if (lastComma > -1) {
    normalized = trimmed.replace(',', '.');
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const [whole = '0', fraction = ''] = normalized.split('.');
  if (fraction.length > digits) return null;
  return Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0') || '0');
}

export function formatMinor(minor: number, currency: string, locale = 'de-DE'): string {
  const digits = minorDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}

export type PaymentState = 'unknown' | 'open' | 'partial' | 'paid' | 'overpaid';

export interface StayFinancials {
  state: PaymentState;
  currency: string | null;
  confirmedPriceMinor: number | null;
  verifiedMinor: number;
  /** Payments in the stay currency that are not verified yet; never counted as paid. */
  unverifiedMinor: number;
  /** null = unknown (price unconfirmed, no currency, or mixed currencies). */
  remainingMinor: number | null;
  overpaidMinor: number;
  /** Payments in another currency than the price: need a documented FX allocation. */
  foreignCurrencyPayments: Payment[];
  reasons: string[];
}

interface PriceLike {
  price_minor: number | null;
  currency: string | null;
  quote_status: 'none' | 'quoted' | 'confirmed';
  booking_status: string;
}

/**
 * remaining = max(0, confirmed_amount - verified_payments), only for equal currency and a confirmed price;
 * otherwise the remaining amount is unknown. Overpayment is reported separately, never clamped away.
 */
export function computeStayFinancials(stay: PriceLike, payments: readonly Payment[]): StayFinancials {
  const reasons: string[] = [];
  const currency = stay.currency;
  const sameCurrency = payments.filter((p) => p.verification_status !== 'rejected' && p.currency === currency);
  const foreign = payments.filter((p) => p.verification_status !== 'rejected' && currency !== null && p.currency !== currency);
  const verifiedMinor = sameCurrency.filter((p) => p.verification_status === 'verified').reduce((s, p) => s + p.amount_minor, 0);
  const unverifiedMinor = sameCurrency.filter((p) => p.verification_status === 'unverified').reduce((s, p) => s + p.amount_minor, 0);

  const priceConfirmed = stay.quote_status === 'confirmed' && stay.price_minor !== null && currency !== null;
  if (!priceConfirmed) reasons.push(stay.quote_status === 'quoted' ? 'Preis nur angeboten, nicht bestätigt' : 'Preis nicht erfasst');
  if (foreign.length > 0) reasons.push('Zahlungen in anderer Währung ohne belegte Umrechnung');

  if (!priceConfirmed) {
    return { state: 'unknown', currency, confirmedPriceMinor: null, verifiedMinor, unverifiedMinor, remainingMinor: null, overpaidMinor: 0, foreignCurrencyPayments: foreign, reasons };
  }
  const price = stay.price_minor as number;
  const remaining = Math.max(0, price - verifiedMinor);
  const overpaid = Math.max(0, verifiedMinor - price);
  let state: PaymentState;
  if (overpaid > 0) state = 'overpaid';
  else if (verifiedMinor >= price) state = 'paid';
  else if (verifiedMinor > 0) state = 'partial';
  else state = 'open';
  if (unverifiedMinor > 0) reasons.push('Es gibt nicht verifizierte Zahlungen');
  return { state, currency, confirmedPriceMinor: price, verifiedMinor, unverifiedMinor, remainingMinor: remaining, overpaidMinor: overpaid, foreignCurrencyPayments: foreign, reasons };
}

export interface CurrencyTotal {
  currency: string;
  totalMinor: number;
  count: number;
}

/** Sums per currency. Currencies are never merged. */
export function sumByCurrency(items: ReadonlyArray<{ amount_minor: number; currency: string }>): CurrencyTotal[] {
  const map = new Map<string, CurrencyTotal>();
  for (const item of items) {
    const entry = map.get(item.currency) ?? { currency: item.currency, totalMinor: 0, count: 0 };
    entry.totalMinor += item.amount_minor;
    entry.count += 1;
    map.set(item.currency, entry);
  }
  return [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export interface FxRateLike {
  from_currency: string;
  to_currency: string;
  rate: number;
  as_of: string;
  source: string;
}

export interface ConsolidatedTotal {
  currency: string;
  totalMinor: number;
  rateNotes: string[];
}

/**
 * Converts every currency into `target` only if a documented FX record (with timestamp and source) exists
 * for each foreign currency. Returns null when any rate is missing: no unlabeled consolidated sum.
 */
export function consolidate(totals: readonly CurrencyTotal[], target: string, rates: readonly FxRateLike[]): ConsolidatedTotal | null {
  let sum = 0;
  const rateNotes: string[] = [];
  for (const t of totals) {
    if (t.currency === target) {
      sum += t.totalMinor;
      continue;
    }
    const candidates = rates.filter((r) => r.from_currency === t.currency && r.to_currency === target).sort((a, b) => b.as_of.localeCompare(a.as_of));
    const rate = candidates[0];
    if (!rate) return null;
    const factor = 10 ** (minorDigits(target) - minorDigits(t.currency));
    sum += Math.round(t.totalMinor * rate.rate * factor);
    rateNotes.push(`${t.currency}→${target}: ${rate.rate} (${rate.source}, Stand ${rate.as_of})`);
  }
  return { currency: target, totalMinor: sum, rateNotes };
}
