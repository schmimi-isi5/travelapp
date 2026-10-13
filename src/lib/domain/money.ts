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
  /** Payments in another currency than the price and without a documented rate: not counted. */
  foreignCurrencyPayments: Payment[];
  /** Payments in another currency that were converted with a documented rate (source and date in the note). */
  convertedPayments: ConvertedPayment[];
  reasons: string[];
}

export interface ConvertedPayment {
  payment: Payment;
  convertedMinor: number;
  note: string;
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
export function computeStayFinancials(stay: PriceLike, payments: readonly Payment[], rates: readonly FxRateLike[] = []): StayFinancials {
  const reasons: string[] = [];
  const currency = stay.currency;
  const live = payments.filter((p) => p.verification_status !== 'rejected');
  const converted: ConvertedPayment[] = [];
  const foreign: Payment[] = [];
  for (const payment of live.filter((p) => currency !== null && p.currency !== currency)) {
    const result = currency ? convertWithRate(payment.amount_minor, payment.currency, currency, rates) : null;
    if (result) converted.push({ payment, ...result });
    else foreign.push(payment);
  }
  // Converted payments count like payments in the stay currency, with their own verification status.
  const counted = [
    ...live.filter((p) => p.currency === currency).map((p) => ({ status: p.verification_status, minor: p.amount_minor })),
    ...converted.map((c) => ({ status: c.payment.verification_status, minor: c.convertedMinor })),
  ];
  const verifiedMinor = counted.filter((c) => c.status === 'verified').reduce((sum, c) => sum + c.minor, 0);
  const unverifiedMinor = counted.filter((c) => c.status === 'unverified').reduce((sum, c) => sum + c.minor, 0);

  const priceConfirmed = stay.quote_status === 'confirmed' && stay.price_minor !== null && currency !== null;
  if (!priceConfirmed) reasons.push(stay.quote_status === 'quoted' ? 'Preis nur angeboten, nicht bestätigt' : 'Preis nicht erfasst');
  if (foreign.length > 0) reasons.push('Zahlungen in anderer Währung ohne belegte Umrechnung');

  if (!priceConfirmed) {
    return { state: 'unknown', currency, confirmedPriceMinor: null, verifiedMinor, unverifiedMinor, remainingMinor: null, overpaidMinor: 0, foreignCurrencyPayments: foreign, convertedPayments: converted, reasons };
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
  return { state, currency, confirmedPriceMinor: price, verifiedMinor, unverifiedMinor, remainingMinor: remaining, overpaidMinor: overpaid, foreignCurrencyPayments: foreign, convertedPayments: converted, reasons };
}

/**
 * Converts with the newest documented rate from -> to; a documented rate to -> from is used inverted.
 * Returns null when no rate exists: nothing is converted without source and date.
 */
export function convertWithRate(amountMinor: number, from: string, to: string, rates: readonly FxRateLike[]): { convertedMinor: number; note: string } | null {
  const newest = (list: readonly FxRateLike[]) => [...list].sort((a, b) => b.as_of.localeCompare(a.as_of))[0];
  const direct = newest(rates.filter((r) => r.from_currency === from && r.to_currency === to));
  const inverse = direct ? undefined : newest(rates.filter((r) => r.from_currency === to && r.to_currency === from));
  const factor = 10 ** (minorDigits(to) - minorDigits(from));
  if (direct) return { convertedMinor: Math.round(amountMinor * direct.rate * factor), note: `${from}→${to}: ${direct.rate} (${direct.source}, Stand ${direct.as_of})` };
  if (inverse) return { convertedMinor: Math.round((amountMinor / inverse.rate) * factor), note: `${from}→${to}: 1/${inverse.rate} (${inverse.source}, Stand ${inverse.as_of})` };
  return null;
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
