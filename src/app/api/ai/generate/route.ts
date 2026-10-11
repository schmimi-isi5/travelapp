import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createProviderFromEnv } from '@/lib/ai/providers';
import { log, requestId } from '@/lib/server/logger';
import { clientKey, rateLimited } from '@/lib/server/rate-limit';
import { bearerToken, createUserClient, isServerConfigured } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

const MAX_TEXT = 8000;
const bodySchema = z.object({
  consent: z.literal(true),
  task: z.enum(['summarize_journal', 'answer_question', 'draft_day_text']),
  input: z.object({
    question: z.string().max(500).optional(),
    entries: z.array(z.object({ title: z.string().max(200), body: z.string().max(MAX_TEXT) })).max(20).optional(),
    stopTitle: z.string().max(200).optional(),
    facts: z.array(z.string().max(500)).max(30).optional(),
  }),
});

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
// Cost guard: a paid provider must not be usable by strangers or in bulk. Limits are per instance (in memory).
const LIMIT_PER_USER_HOUR = 30;
const LIMIT_PER_USER_DAY = 100;
const LIMIT_ALL_USERS_DAY = 500;

/** In supabase mode only a signed-in user may spend provider budget; the demo mode has no accounts. */
async function authorizeCaller(request: Request): Promise<{ ok: true; key: string } | { ok: false; response: NextResponse }> {
  if (process.env.NEXT_PUBLIC_APP_MODE !== 'supabase') return { ok: true, key: `ip:${clientKey(request)}` };
  const token = bearerToken(request);
  if (!token || !isServerConfigured()) return { ok: false, response: NextResponse.json({ error: 'UNAUTHENTICATED', message: 'Bitte anmelden, um die KI zu nutzen.' }, { status: 401 }) };
  const { data, error } = await createUserClient(token).auth.getUser(token);
  if (error || !data.user) return { ok: false, response: NextResponse.json({ error: 'UNAUTHENTICATED', message: 'Anmeldung abgelaufen. Bitte neu anmelden.' }, { status: 401 }) };
  return { ok: true, key: `user:${data.user.id}` };
}

export async function POST(request: Request) {
  const id = requestId(request);
  const caller = await authorizeCaller(request);
  if (!caller.ok) return caller.response;
  if (rateLimited(`ai-hour:${caller.key}`, LIMIT_PER_USER_HOUR, HOUR) || rateLimited(`ai-day:${caller.key}`, LIMIT_PER_USER_DAY, DAY) || rateLimited('ai-all-day', LIMIT_ALL_USERS_DAY, DAY)) {
    return NextResponse.json({ error: 'RATE_LIMITED', message: 'Das KI-Kontingent ist vorerst aufgebraucht. Es hilft die lokale, regelbasierte Hilfe.' }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST', message: 'Anfrage ungültig oder Einwilligung fehlt.' }, { status: 400 });
  }
  const provider = createProviderFromEnv();
  const status = provider.status();
  if (status.state !== 'ready') {
    return NextResponse.json({ error: 'AI_NOT_AVAILABLE', message: status.detail, provider: status.provider }, { status: 503 });
  }
  try {
    const result = await provider.generate({ task: parsed.data.task, input: parsed.data.input });
    return NextResponse.json(result);
  } catch (error) {
    log('error', 'ai provider failed', { requestId: id, provider: provider.id, detail: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'AI_PROVIDER_FAILED', message: 'Der KI-Dienst hat nicht geantwortet.' }, { status: 502 });
  }
}
