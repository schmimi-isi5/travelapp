import { computeStayFinancials, formatMinor, sumByCurrency, type CurrencyTotal } from './money';
import type { Payment, Stay } from './schemas';

export interface OpenPayment {
  stayId: string;
  name: string;
  dueAt: string | null;
  isOverdue: boolean;
  currency: string;
  remainingMinor: number;
  isPartial: boolean;
}

export interface PaymentToClarify {
  stayId: string;
  name: string;
  reasons: string[];
}

export interface PaymentOverview {
  open: OpenPayment[];
  openTotals: CurrencyTotal[];
  toClarify: PaymentToClarify[];
}

/**
 * Open = confirmed price, not fully covered by verified payments. To clarify = anything the numbers cannot settle:
 * unknown price or booking, payments in another currency, unverified or surplus payments.
 * Cancelled stays are left out. Totals are per currency and never merged.
 */
export function buildPaymentOverview(stays: readonly Stay[], payments: readonly Payment[], today: string): PaymentOverview {
  const open: OpenPayment[] = [];
  const toClarify: PaymentToClarify[] = [];
  for (const stay of stays.filter((s) => s.booking_status !== 'cancelled')) {
    const fin = computeStayFinancials(stay, payments.filter((p) => p.stay_id === stay.id));
    if ((fin.state === 'open' || fin.state === 'partial') && fin.remainingMinor !== null && fin.currency) {
      open.push({
        stayId: stay.id,
        name: stay.name,
        dueAt: stay.due_at,
        isOverdue: stay.due_at !== null && stay.due_at.slice(0, 10) < today,
        currency: fin.currency,
        remainingMinor: fin.remainingMinor,
        isPartial: fin.state === 'partial',
      });
    }
    const reasons = [...fin.reasons];
    if (stay.booking_status === 'unknown') reasons.unshift('Buchungsstatus unbekannt');
    if (fin.state === 'overpaid' && fin.currency) reasons.push(`Mehr bezahlt als der Preis: ${formatMinor(fin.overpaidMinor, fin.currency)}`);
    if (reasons.length > 0) toClarify.push({ stayId: stay.id, name: stay.name, reasons });
  }
  open.sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || a.name.localeCompare(b.name));
  toClarify.sort((a, b) => a.name.localeCompare(b.name));
  return { open, openTotals: sumByCurrency(open.map((o) => ({ amount_minor: o.remainingMinor, currency: o.currency }))), toClarify };
}
