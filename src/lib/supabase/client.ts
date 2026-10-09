import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** Browser-side configuration. NEXT_PUBLIC_* values are inlined at build time (see docs/DEPLOYMENT.md). */
export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export const AUTH_STORAGE_KEY = 'nb-auth';

let browserClient: SupabaseClient | null = null;

/**
 * Singleton browser client. The session lives in localStorage (supabase-js default), refreshes automatically
 * and stays usable offline until the refresh token expires. Only the public anon key is used here; row level
 * security in the database is the actual access control.
 */
export function getSupabase(): SupabaseClient {
  if (browserClient) return browserClient;
  const config = getSupabaseConfig();
  if (!config) throw new Error('Supabase ist nicht konfiguriert (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY fehlen)');
  browserClient = createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY },
  });
  return browserClient;
}

/** Test/server helper: a client that never persists a session. */
export function createEphemeralClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
