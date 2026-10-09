import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Server-side URL: inside the Docker network the gateway is reachable directly; falls back to the public URL. */
export function serverSupabaseUrl(): string | null {
  return process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || null;
}

export function isServerConfigured(): boolean {
  return Boolean(serverSupabaseUrl() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Service-role client. Bypasses RLS: only for narrowly scoped server routes that authorise the caller themselves. */
export function createAdminClient(): SupabaseClient {
  const url = serverSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL sind nicht gesetzt');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Client acting as the caller (RLS applies), built from the Bearer token of the request. */
export function createUserClient(accessToken: string): SupabaseClient {
  const url = serverSupabaseUrl();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase ist serverseitig nicht konfiguriert');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${accessToken}` } } });
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}
