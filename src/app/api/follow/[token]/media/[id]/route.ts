import { NextResponse } from 'next/server';
import { isStopVisible } from '@/lib/follow/view';
import { loadTrip, resolveFollowerLink, travelToday } from '@/lib/server/follow';
import { FOLLOWER_IMAGE_WIDTHS, sanitizeImage, type FollowerImageWidth } from '@/lib/server/image';
import { log, requestId } from '@/lib/server/logger';
import { clientKey, rateLimited } from '@/lib/server/rate-limit';
import { createAdminClient, isServerConfigured } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = () => NextResponse.json({ error: 'NOT_FOUND' }, { status: 404, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } });

interface MediaRow {
  id: string;
  family_id: string;
  trip_id: string | null;
  stop_id: string | null;
  kind: string;
  visibility: string;
  shared_with_followers: boolean;
  storage_path: string;
}

/**
 * Serves one published photo of the link's trip as a re-encoded JPEG without metadata (no EXIF, no GPS).
 * The original file never leaves the private bucket.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const reqId = requestId(request);
  if (!isServerConfigured()) return NextResponse.json({ error: 'NOT_CONFIGURED' }, { status: 503 });
  const ip = clientKey(request);
  if (rateLimited(`follow-media:${ip}`, 1200, 10 * 60_000)) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  const { token, id } = await params;
  const requested = Number(new URL(request.url).searchParams.get('w') ?? FOLLOWER_IMAGE_WIDTHS[1]);
  const width = FOLLOWER_IMAGE_WIDTHS.find((w) => w === requested) as FollowerImageWidth | undefined;
  if (!UUID.test(id) || !width) return NOT_FOUND();
  try {
    const admin = createAdminClient();
    const link = await resolveFollowerLink(admin, token);
    if (!link) {
      if (rateLimited(`follow-miss:${ip}`, 30, 10 * 60_000)) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
      return NOT_FOUND();
    }
    const { data } = await admin
      .from('media_assets')
      .select('id, family_id, trip_id, stop_id, kind, visibility, shared_with_followers, storage_path')
      .eq('id', id)
      .maybeSingle();
    const media = data as MediaRow | null;
    if (!media || media.family_id !== link.family_id || media.trip_id !== link.trip_id || !media.shared_with_followers || media.visibility !== 'family' || media.kind !== 'photo') return NOT_FOUND();
    if (media.stop_id) {
      const [trip, stop] = await Promise.all([loadTrip(admin, link.trip_id), admin.from('trip_stops').select('arrive_at').eq('id', media.stop_id).maybeSingle()]);
      const arrive = (stop.data as { arrive_at: string | null } | null)?.arrive_at ?? null;
      if (!trip || !isStopVisible(trip, { arrive_at: arrive }, travelToday())) return NOT_FOUND();
    }
    const { data: file, error } = await admin.storage.from('media').download(media.storage_path);
    if (error || !file) return NOT_FOUND();
    let body: Buffer;
    try {
      body = await sanitizeImage(Buffer.from(await file.arrayBuffer()), width);
    } catch (cause) {
      log('warn', 'follower image not convertible', { requestId: reqId, mediaId: id, detail: cause instanceof Error ? cause.message : String(cause) });
      return NextResponse.json({ error: 'UNSUPPORTED_IMAGE' }, { status: 415, headers: { 'Cache-Control': 'private, no-store' } });
    }
    return new Response(new Uint8Array(body), {
      headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(body.length), 'Cache-Control': 'private, max-age=3600', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (cause) {
    log('error', 'follower media failed', { requestId: reqId, mediaId: id, detail: cause instanceof Error ? cause.message : String(cause) });
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
  }
}
