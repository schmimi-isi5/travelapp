import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FX_SOURCE, FxInputError, loadFxRate, parseFxQuery, resetFxCache } from '@/lib/server/fx';

const NOW = new Date('2026-10-12T12:00:00Z');
const upstream = (rates: Record<string, unknown> = { NAD: 20.5, BWP: 15.2, EUR: 1 }) =>
  vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ result: 'success', time_last_update_utc: 'Mon, 12 Oct 2026 00:02:31 +0000', rates }) }));

describe('exchange rate lookup', () => {
  beforeEach(resetFxCache);

  it('accepts ISO codes in any case and rejects nonsense and equal currencies', () => {
    expect(parseFxQuery(new URLSearchParams({ from: 'eur', to: 'nad' }))).toEqual({ from: 'EUR', to: 'NAD' });
    for (const bad of [{ from: 'EURO', to: 'NAD' }, { from: 'EUR', to: '' }, { from: 'EUR', to: 'EUR' }, { from: '../x', to: 'NAD' }]) expect(() => parseFxQuery(new URLSearchParams(bad))).toThrow(FxInputError);
  });

  it('returns the rate with source and the provider day, and fetches one base only once within six hours', async () => {
    const fetchImpl = upstream();
    const first = await loadFxRate({ from: 'EUR', to: 'NAD' }, { fetchImpl, now: NOW });
    expect(first).toEqual({ from: 'EUR', to: 'NAD', rate: 20.5, asOf: '2026-10-12', source: FX_SOURCE });
    expect((await loadFxRate({ from: 'EUR', to: 'BWP' }, { fetchImpl, now: new Date(NOW.getTime() + 3600_000) })).rate).toBe(15.2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('https://open.er-api.com/v6/latest/EUR');
    await loadFxRate({ from: 'EUR', to: 'NAD' }, { fetchImpl, now: new Date(NOW.getTime() + 7 * 3600_000) });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('fails clearly for an unknown target currency, a service error and an unusable answer', async () => {
    await expect(loadFxRate({ from: 'EUR', to: 'XXX' }, { fetchImpl: upstream(), now: NOW })).rejects.toThrow(FxInputError);
    resetFxCache();
    await expect(loadFxRate({ from: 'EUR', to: 'NAD' }, { fetchImpl: vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })), now: NOW })).rejects.toThrow('HTTP 503');
    resetFxCache();
    await expect(loadFxRate({ from: 'EUR', to: 'NAD' }, { fetchImpl: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ result: 'error' }) })), now: NOW })).rejects.toThrow('keine Kurse');
  });

  it('ignores non-numeric and non-positive rates', async () => {
    await expect(loadFxRate({ from: 'EUR', to: 'NAD' }, { fetchImpl: upstream({ NAD: 'viel', BWP: 0 }), now: NOW })).rejects.toThrow(FxInputError);
  });
});
