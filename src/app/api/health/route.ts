import { NextResponse } from 'next/server';
import { getModeStatus } from '@/lib/db/mode';
import { getMailConfig } from '@/lib/server/mailer';
import { serverSupabaseUrl } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

const DEEP_TIMEOUT_MS = 2500;

/**
 * Liveness: always 200 while the process serves requests (used by the container healthcheck, must not depend on Supabase).
 * Readiness: `?deep=1` additionally probes the auth service and answers 503 when the backend is unreachable.
 */
export async function GET(request: Request) {
  const mode = getModeStatus();
  const body: Record<string, unknown> = {
    status: 'ok',
    mode: mode.effective,
    supabase: mode.requested === 'supabase' ? (mode.notConfiguredReason ? 'not_configured' : 'configured') : 'not_requested',
    mail: getMailConfig() ? 'configured' : 'not_configured',
  };
  if (new URL(request.url).searchParams.get('deep') === '1' && mode.effective === 'supabase') {
    const base = serverSupabaseUrl();
    try {
      const res = await fetch(`${base}/auth/v1/health`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' }, signal: AbortSignal.timeout(DEEP_TIMEOUT_MS), cache: 'no-store' });
      body.backend = res.ok ? 'ok' : `http_${res.status}`;
    } catch {
      body.backend = 'unreachable';
    }
    if (body.backend !== 'ok') {
      body.status = 'degraded';
      return NextResponse.json(body, { status: 503 });
    }
  }
  return NextResponse.json(body);
}
