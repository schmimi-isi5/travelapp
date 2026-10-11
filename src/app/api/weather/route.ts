import { NextResponse } from 'next/server';
import { log, requestId } from '@/lib/server/logger';
import { clientKey, rateLimited } from '@/lib/server/rate-limit';
import { bearerToken, createUserClient, isServerConfigured } from '@/lib/server/supabase-admin';
import { loadWeather, parseQuery, WeatherInputError } from '@/lib/server/weather';

export const dynamic = 'force-dynamic';

const HOUR = 60 * 60_000;

/**
 * Daily weather for a station (forecast, later days as climate averages). The route is a thin proxy to Open-Meteo with a
 * cache; like the AI route it answers signed-in users only (a public proxy would be open to abuse) and is rate limited.
 */
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
  if (rateLimited(`weather:${caller}`, 240, HOUR)) return NextResponse.json({ error: 'RATE_LIMITED', message: 'Zu viele Wetteranfragen. Bitte später erneut versuchen.' }, { status: 429 });
  try {
    const query = parseQuery(new URL(request.url).searchParams);
    const result = await loadWeather(query);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=600' } });
  } catch (cause) {
    if (cause instanceof WeatherInputError) return NextResponse.json({ error: 'INVALID_REQUEST', message: cause.message }, { status: 400 });
    log('error', 'weather lookup failed', { requestId: id, detail: cause instanceof Error ? cause.message : String(cause) });
    return NextResponse.json({ error: 'WEATHER_UNAVAILABLE', message: 'Der Wetterdienst ist gerade nicht erreichbar.' }, { status: 502 });
  }
}
