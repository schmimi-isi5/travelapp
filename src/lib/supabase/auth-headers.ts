import { getModeStatus } from '../db/mode';
import { getSupabase } from './client';

/** In live mode the server routes only answer signed-in users, so the session token travels with the request. */
export async function authHeaders(): Promise<Record<string, string>> {
  if (getModeStatus().effective !== 'supabase') return {};
  const { data } = await getSupabase().auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}
