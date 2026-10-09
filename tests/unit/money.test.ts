import { describe, expect, it } from 'vitest';
import { computeStayFinancials, consolidate, formatMinor, parseAmountToMinor, sumByCurrency } from '@/lib/domain/money';
import type { Payment } from '@/lib/domain/schemas';

const payment = (over: Partial<Payment>): Payment => ({
  id: 'p', version: 1, created_at: '', updated_at: '', created_by: null, is_demo: false, source_type: 'user_entered', family_id: 'f', booking_id: null, stay_id: 's',
  amount_minor: 100, currency: 'NAD', paid_at: null, verification_status: 'verified', source_document_id: null, notes: null, sync_state: 'synced', ...over,
});
const stay = { price_minor: 2_400_000, currency: 'NAD', quote_status: 'confirmed' as const, booking_status: 'confirmed' };

describe('parseAmountToMinor', () => {
  it.each([['1.234,50', 'EUR', 123_450], ['1234.5', 'EUR', 123_450], ['12', 'NAD', 1200], ['0,05', 'BWP', 5], ['1,234.56', 'USD', 123_456]])('parses %s %s', (input, cur, expected) => {
    expect(parseAmountToMinor(input, cur)).toBe(expected);
  });
  it.each(['', 'abc', '1,234,5x', '1.234,567'])('rejects %j', (input) => {
    expect(parseAmountToMinor(input, 'EUR')).toBeNull();
  });
});

describe('formatMinor', () => {
  it('shows the ISO code and German separators', () => {
    expect(formatMinor(123_456, 'NAD')).toMatch(/1\.234,56/);
    expect(formatMinor(123_456, 'NAD')).toContain('NAD');
  });
});

describe('computeStayFinancials', () => {
  it('computes remaining from verified payments only and keeps unverified separate', () => {
    const fin = computeStayFinancials(stay, [payment({ amount_minor: 800_000 }), payment({ id: 'p2', amount_minor: 400_000, verification_status: 'unverified' })]);
    expect(fin.state).toBe('partial');
    expect(fin.verifiedMinor).toBe(800_000);
    expect(fin.unverifiedMinor).toBe(400_000);
    expect(fin.remainingMinor).toBe(1_600_000);
  });
  it('is paid when verified payments cover the price', () => {
    expect(computeStayFinancials(stay, [payment({ amount_minor: 2_400_000 })]).state).toBe('paid');
  });
  it('reports overpayment separately instead of clamping it away', () => {
    const fin = computeStayFinancials(stay, [payment({ amount_minor: 2_500_000 })]);
    expect(fin.state).toBe('overpaid');
    expect(fin.remainingMinor).toBe(0);
    expect(fin.overpaidMinor).toBe(100_000);
  });
  it('is open without payments', () => {
    const fin = computeStayFinancials(stay, []);
    expect(fin.state).toBe('open');
    expect(fin.remainingMinor).toBe(2_400_000);
  });
  it('is unknown (not open/unpaid) when the price is only quoted or missing', () => {
    expect(computeStayFinancials({ ...stay, quote_status: 'quoted' }, []).remainingMinor).toBeNull();
    expect(computeStayFinancials({ ...stay, quote_status: 'quoted' }, []).state).toBe('unknown');
    expect(computeStayFinancials({ price_minor: null, currency: null, quote_status: 'none', booking_status: 'unknown' }, []).state).toBe('unknown');
  });
  it('does not count payments in another currency without documented FX', () => {
    const fin = computeStayFinancials(stay, [payment({ currency: 'EUR', amount_minor: 5_000_000 })]);
    expect(fin.verifiedMinor).toBe(0);
    expect(fin.foreignCurrencyPayments).toHaveLength(1);
    expect(fin.reasons.join(' ')).toMatch(/anderer Währung/);
  });
  it('ignores rejected payments', () => {
    expect(computeStayFinancials(stay, [payment({ verification_status: 'rejected' })]).verifiedMinor).toBe(0);
  });
});

describe('currency totals', () => {
  const items = [{ amount_minor: 100, currency: 'NAD' }, { amount_minor: 50, currency: 'NAD' }, { amount_minor: 30, currency: 'BWP' }, { amount_minor: 10, currency: 'EUR' }];
  it('sums per currency and never merges currencies', () => {
    expect(sumByCurrency(items)).toEqual([{ currency: 'BWP', totalMinor: 30, count: 1 }, { currency: 'EUR', totalMinor: 10, count: 1 }, { currency: 'NAD', totalMinor: 150, count: 2 }]);
  });
  it('refuses a consolidated EUR total without FX records', () => {
    expect(consolidate(sumByCurrency(items), 'EUR', [])).toBeNull();
  });
  it('consolidates with documented rates and reports them', () => {
    const rates = [{ from_currency: 'NAD', to_currency: 'EUR', rate: 0.05, as_of: '2026-10-01', source: 'Beleg' }, { from_currency: 'BWP', to_currency: 'EUR', rate: 0.07, as_of: '2026-10-01', source: 'Beleg' }];
    const result = consolidate(sumByCurrency(items), 'EUR', rates);
    expect(result?.totalMinor).toBe(Math.round(150 * 0.05) + Math.round(30 * 0.07) + 10);
    expect(result?.rateNotes).toHaveLength(2);
  });
  it('passes only EUR through without rates', () => {
    expect(consolidate([{ currency: 'EUR', totalMinor: 10, count: 1 }], 'EUR', [])?.totalMinor).toBe(10);
  });
});
