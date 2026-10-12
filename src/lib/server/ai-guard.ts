import { NextResponse } from 'next/server';
import { clientKey, rateLimited } from './rate-limit';
import { bearerToken, createUserClient, isServerConfigured } from './supabase-admin';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
/** Cost guard for every AI route: all users together per day. Limits are per instance (in memory). */
const LIMIT_ALL_USERS_DAY = 500;

/** In supabase mode only a signed-in user may spend provider budget; the demo mode has no accounts. */
export async function authorizeCaller(request: Request): Promise<{ ok: true; key: string } | { ok: false; response: NextResponse }> {
  if (process.env.NEXT_PUBLIC_APP_MODE !== 'supabase') return { ok: true, key: `ip:${clientKey(request)}` };
  const token = bearerToken(request);
  if (!token || !isServerConfigured()) return { ok: false, response: NextResponse.json({ error: 'UNAUTHENTICATED', message: 'Bitte anmelden, um die KI zu nutzen.' }, { status: 401 }) };
  const { data, error } = await createUserClient(token).auth.getUser(token);
  if (error || !data.user) return { ok: false, response: NextResponse.json({ error: 'UNAUTHENTICATED', message: 'Anmeldung abgelaufen. Bitte neu anmelden.' }, { status: 401 }) };
  return { ok: true, key: `user:${data.user.id}` };
}

/** True when this caller, or all callers together, used up the budget of the named AI feature. */
export function aiBudgetExceeded(feature: string, callerKey: string, perHour: number, perDay: number): boolean {
  return rateLimited(`${feature}-hour:${callerKey}`, perHour, HOUR) || rateLimited(`${feature}-day:${callerKey}`, perDay, DAY) || rateLimited('ai-all-day', LIMIT_ALL_USERS_DAY, DAY);
}
