import { describe, expect, it } from 'vitest';
import { buildPaymentOverview } from '@/lib/domain/payment-overview';
import type { Payment, Stay } from '@/lib/domain/schemas';

const stay = (over: Partial<Stay>): Stay => ({
  id: 's', version: 1, created_at: '', updated_at: '', created_by: null, is_demo: false, source_type: 'user_entered', family_id: 'f', trip_id: 't', stop_id: null,
  name: 'Lodge', check_in: null, check_out: null, booking_status: 'confirmed', booking_ref: null, quote_status: 'confirmed', price_minor: 100_000, currency: 'NAD',
  contact: null, due_at: null, notes: null, ...over,
} as Stay);
const payment = (over: Partial<Payment>): Payment => ({
  id: 'p', version: 1, created_at: '', updated_at: '', created_by: null, is_demo: false, source_type: 'user_entered', family_id: 'f', booking_id: null, stay_id: 's',
  amount_minor: 100, currency: 'NAD', paid_at: null, verification_status: 'verified', source_document_id: null, notes: null, sync_state: 'synced', ...over,
});

describe('buildPaymentOverview', () => {
  it('lists open and partly paid stays by due date with the remaining amount, totals per currency', () => {
    const stays = [
      stay({ id: 'a', name: 'Spät', due_at: '2026-11-01', price_minor: 50_000, currency: 'BWP' }),
      stay({ id: 'b', name: 'Früh', due_at: '2026-10-01' }),
      stay({ id: 'c', name: 'Ohne Datum' }),
    ];
    const o = buildPaymentOverview(stays, [payment({ stay_id: 'b', amount_minor: 40_000 })], '2026-10-13');
    expect(o.open.map((x) => [x.name, x.remainingMinor, x.isPartial, x.isOverdue])).toEqual([
      ['Früh', 60_000, true, true],
      ['Spät', 50_000, false, false],
      ['Ohne Datum', 100_000, false, false],
    ]);
    expect(o.openTotals).toEqual([{ currency: 'BWP', totalMinor: 50_000, count: 1 }, { currency: 'NAD', totalMinor: 160_000, count: 2 }]);
  });

  it('does not list paid or cancelled stays as open', () => {
    const o = buildPaymentOverview([stay({ id: 'a' }), stay({ id: 'b', booking_status: 'cancelled' })], [payment({ stay_id: 'a', amount_minor: 100_000 })], '2026-10-13');
    expect(o.open).toEqual([]);
    expect(o.toClarify).toEqual([]);
  });

  it('puts unknown prices, unknown bookings, foreign-currency and unverified payments under "to clarify", not under open', () => {
    const stays = [
      stay({ id: 'a', name: 'Preis offen', quote_status: 'quoted', booking_status: 'unknown' }),
      stay({ id: 'b', name: 'Fremdwährung' }),
      stay({ id: 'c', name: 'Unbelegt' }),
    ];
    const o = buildPaymentOverview(stays, [payment({ stay_id: 'b', currency: 'ZAR', amount_minor: 100_000 }), payment({ stay_id: 'c', amount_minor: 100, verification_status: 'unverified' })], '2026-10-13');
    expect(o.open.map((x) => x.name)).toEqual(['Fremdwährung', 'Unbelegt']);
    const reasons = Object.fromEntries(o.toClarify.map((c) => [c.name, c.reasons]));
    expect(reasons['Preis offen']).toEqual(['Buchungsstatus unbekannt', 'Preis nur angeboten, nicht bestätigt']);
    expect(reasons['Fremdwährung']).toEqual(['Zahlungen in anderer Währung ohne belegte Umrechnung']);
    expect(reasons['Unbelegt']).toEqual(['Es gibt nicht verifizierte Zahlungen']);
  });

  it('reports surplus payments as something to clarify', () => {
    const o = buildPaymentOverview([stay({ id: 'a' })], [payment({ stay_id: 'a', amount_minor: 120_000 })], '2026-10-13');
    expect(o.toClarify[0]?.reasons.join()).toMatch(/Mehr bezahlt als der Preis/);
  });
});
