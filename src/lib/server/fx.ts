const ENDPOINT = 'https://open.er-api.com/v6/latest';
const TTL_MS = 6 * 3600_000;
export const FX_SOURCE = 'open.er-api.com (Rates By Exchange Rate API)';

export class FxInputError extends Error {}

export interface FxRate {
  from: string;
  to: string;
  /** How many `to` one `from` is worth. */
  rate: number;
  /** Calendar day (YYYY-MM-DD) of the provider's last update. */
  asOf: string;
  source: string;
}

const CODE = /^[A-Z]{3}$/;
type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
const cache = new Map<string, { at: number; rates: Record<string, number>; asOf: string }>();

export function parseFxQuery(params: URLSearchParams): { from: string; to: string } {
  const from = (params.get('from') ?? '').toUpperCase();
  const to = (params.get('to') ?? '').toUpperCase();
  if (!CODE.test(from) || !CODE.test(to)) throw new FxInputError('Währungen als ISO-Code angeben, z. B. NAD und EUR.');
  if (from === to) throw new FxInputError('Die beiden Währungen müssen verschieden sein.');
  return { from, to };
}

/** Reference rate of a free service, cached for six hours. It is a market rate, not what a bureau de change pays. */
export async function loadFxRate({ from, to }: { from: string; to: string }, { fetchImpl = fetch as unknown as FetchLike, now = new Date() }: { fetchImpl?: FetchLike; now?: Date } = {}): Promise<FxRate> {
  let entry = cache.get(from);
  if (!entry || now.getTime() - entry.at > TTL_MS) {
    const res = await fetchImpl(`${ENDPOINT}/${from}`);
    if (!res.ok) throw new Error(`Kursdienst antwortete mit HTTP ${res.status}`);
    const json = (await res.json()) as { result?: string; rates?: Record<string, unknown>; time_last_update_utc?: string };
    if (json.result !== 'success' || !json.rates) throw new Error('Kursdienst lieferte keine Kurse');
    const updated = json.time_last_update_utc ? new Date(json.time_last_update_utc) : now;
    const rates = Object.fromEntries(Object.entries(json.rates).filter((pair): pair is [string, number] => typeof pair[1] === 'number' && pair[1] > 0));
    entry = { at: now.getTime(), rates, asOf: (Number.isNaN(updated.getTime()) ? now : updated).toISOString().slice(0, 10) };
    cache.set(from, entry);
  }
  const rate = entry.rates[to];
  if (!rate) throw new FxInputError(`Für ${to} gibt es keinen Kurs.`);
  return { from, to, rate, asOf: entry.asOf, source: FX_SOURCE };
}

/** For tests: forget cached rates. */
export function resetFxCache(): void {
  cache.clear();
}
