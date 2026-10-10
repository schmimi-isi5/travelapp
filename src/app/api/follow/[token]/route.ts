import { NextResponse } from 'next/server';
import { buildFollowerView } from '@/lib/follow/view';
import { loadFollowerSource, recordVisit, resolveFollowerLink } from '@/lib/server/follow';
import { log, requestId } from '@/lib/server/logger';
import { clientKey, rateLimited } from '@/lib/server/rate-limit';
import { createAdminClient, isServerConfigured } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } as const;
const INVALID = { error: 'LINK_INVALID', message: 'Dieser Link ist nicht (mehr) gültig.' };

/** Read-only trip view for a follower link: reached stops plus the items the family explicitly published. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const id = requestId(request);
  if (!isServerConfigured()) return NextResponse.json({ error: 'NOT_CONFIGURED' }, { status: 503, headers: HEADERS });
  const ip = clientKey(request);
  if (rateLimited(`follow:${ip}`, 240, 10 * 60_000)) return NextResponse.json({ error: 'RATE_LIMITED', message: 'Zu viele Anfragen. Bitte später erneut versuchen.' }, { status: 429, headers: HEADERS });
  const { token } = await params;
  try {
    const admin = createAdminClient();
    const link = await resolveFollowerLink(admin, token);
    if (!link) {
      // Guessing protection: repeated misses from one address are throttled harder than normal use.
      if (rateLimited(`follow-miss:${ip}`, 30, 10 * 60_000)) return NextResponse.json({ error: 'RATE_LIMITED', message: 'Zu viele Anfragen. Bitte später erneut versuchen.' }, { status: 429, headers: HEADERS });
      return NextResponse.json(INVALID, { status: 404, headers: HEADERS });
    }
    const source = await loadFollowerSource(admin, link);
    if (!source) return NextResponse.json(INVALID, { status: 404, headers: HEADERS });
    await recordVisit(admin, link.id, id);
    return NextResponse.json(buildFollowerView(source), { headers: HEADERS });
  } catch (cause) {
    log('error', 'follower view failed', { requestId: id, detail: cause instanceof Error ? cause.message : String(cause) });
    return NextResponse.json({ error: 'SERVER_ERROR', message: 'Die Reise konnte gerade nicht geladen werden.' }, { status: 500, headers: HEADERS });
  }
}
