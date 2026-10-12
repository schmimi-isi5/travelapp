import { authHeaders } from '@/lib/supabase/auth-headers';

export interface LoadedRate {
  rate: number;
  asOf: string;
  source: string;
}

/** The current reference rate from the app server, or null when offline or the service is down. */
export async function fetchReferenceRate(from: string, to: string): Promise<LoadedRate | null> {
  try {
    const res = await fetch(`/api/fx?${new URLSearchParams({ from, to })}`, { headers: await authHeaders(), cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as { rate?: number; asOf?: string; source?: string };
    return typeof json.rate === 'number' && json.asOf && json.source ? { rate: json.rate, asOf: json.asOf, source: json.source } : null;
  } catch {
    return null;
  }
}
