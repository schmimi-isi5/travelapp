import { NextResponse } from 'next/server';
import { FxInputError, loadFxRate, parseFxQuery } from '@/lib/server/fx';
import { log, requestId } from '@/lib/server/logger';
import { clientKey, rateLimited } from '@/lib/server/rate-limit';
import { bearerToken, createUserClient, isServerConfigured } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

const HOUR = 60 * 60_000;

/** Reference exchange rate (for the form that records a documented rate). Signed-in users only, rate limited, cached. */
export async function GET(request: Request) {
  const id = requestId(request);
  let caller = `ip:${clientKey(request)}`;
  if (process.env.NEXT_PUBLIC_APP_MODE === 'supabase') {
    const token = bearerToken(request);
    if (!token || !isServerConfigured()) return NextResponse.json({ error: 'UNAUTHENTICATED', message: 'Bitte anmelden.' }, { status: 401 });
    const { data, error } = await createUserClient(token).auth.getUser(token);
    if (error || !data.user) return NextResponse.json({ error: 'UNAUTHENTICATED', message: 'Anmeldung abgelaufen.' }, { status: 401 });
    caller = `user:${data.user.id}`;
  }
  if (rateLimited(`fx:${caller}`, 60, HOUR)) return NextResponse.json({ error: 'RATE_LIMITED', message: 'Zu viele Kursanfragen. Bitte später erneut versuchen.' }, { status: 429 });
  try {
    const result = await loadFxRate(parseFxQuery(new URL(request.url).searchParams));
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=600' } });
  } catch (cause) {
    if (cause instanceof FxInputError) return NextResponse.json({ error: 'INVALID_REQUEST', message: cause.message }, { status: 400 });
    log('error', 'fx lookup failed', { requestId: id, detail: cause instanceof Error ? cause.message : String(cause) });
    return NextResponse.json({ error: 'FX_UNAVAILABLE', message: 'Der Kursdienst ist gerade nicht erreichbar.' }, { status: 502 });
  }
}
