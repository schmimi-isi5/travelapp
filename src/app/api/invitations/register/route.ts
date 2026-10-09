import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password';
import { MIN_INVITE_TOKEN_LENGTH, sha256Hex } from '@/lib/auth/token';
import { log, requestId } from '@/lib/server/logger';
import { clientKey, rateLimited } from '@/lib/server/rate-limit';
import { createAdminClient, isServerConfigured } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  token: z.string().min(MIN_INVITE_TOKEN_LENGTH).max(200),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  displayName: z.string().trim().min(1).max(100).optional(),
});

/** Registration attempts per client address and 10 minutes. Raise via REGISTER_RATE_LIMIT only for automated tests. */
const DEFAULT_REGISTER_LIMIT = 10;

const GENERIC_INVALID = { error: 'INVITATION_INVALID', message: 'Die Einladung ist ungültig, abgelaufen oder bereits verwendet.' };

/**
 * Invitation-only registration. Public sign-up is disabled in the auth service, so the account is created here with the
 * service role, but only for a valid, open, unexpired invitation. The invited e-mail address comes from the invitation,
 * never from the request. The family membership itself is created afterwards by the user through `accept_invitation`.
 */
export async function POST(request: Request) {
  const id = requestId(request);
  const limit = Number(process.env.REGISTER_RATE_LIMIT) || DEFAULT_REGISTER_LIMIT;
  if (rateLimited(`register:${clientKey(request)}`, limit, 10 * 60_000)) {
    log('warn', 'invitation registration rate limited', { requestId: id });
    return NextResponse.json({ error: 'RATE_LIMITED', message: 'Zu viele Versuche. Bitte später erneut versuchen.' }, { status: 429 });
  }
  if (!isServerConfigured()) return NextResponse.json({ error: 'NOT_CONFIGURED', message: 'Der Server ist nicht für Supabase konfiguriert.' }, { status: 503 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_REQUEST', message: `Bitte ein Passwort mit mindestens ${MIN_PASSWORD_LENGTH} Zeichen und einen gültigen Einladungslink verwenden.` }, { status: 400 });

  const admin = createAdminClient();
  const { data: invitation, error: lookupError } = await admin
    .from('invitations')
    .select('id, email, expires_at, accepted_at, revoked_at')
    .eq('token_hash', await sha256Hex(parsed.data.token))
    .maybeSingle();
  if (lookupError) {
    log('error', 'invitation lookup failed', { requestId: id, detail: lookupError.message });
    return NextResponse.json({ error: 'SERVER_ERROR', message: 'Die Einladung konnte nicht geprüft werden.' }, { status: 502 });
  }
  const row = invitation as { id: string; email: string; expires_at: string; accepted_at: string | null; revoked_at: string | null } | null;
  if (!row || row.accepted_at || row.revoked_at || Date.parse(row.expires_at) <= Date.now()) {
    log('info', 'invitation registration refused', { requestId: id });
    return NextResponse.json(GENERIC_INVALID, { status: 400 });
  }

  const { error: createError } = await admin.auth.admin.createUser({
    email: row.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: parsed.data.displayName ? { display_name: parsed.data.displayName } : undefined,
  });
  if (createError) {
    if (createError.code === 'email_exists') {
      return NextResponse.json({ error: 'ACCOUNT_EXISTS', message: 'Für diese Einladung gibt es bereits ein Konto. Bitte melde dich an, um sie anzunehmen.' }, { status: 409 });
    }
    if (createError.code === 'weak_password') return NextResponse.json({ error: 'WEAK_PASSWORD', message: 'Das Passwort ist zu schwach. Bitte ein längeres, weniger gebräuchliches wählen.' }, { status: 400 });
    log('error', 'user creation failed', { requestId: id, invitationId: row.id, detail: createError.message });
    return NextResponse.json({ error: 'SERVER_ERROR', message: 'Das Konto konnte nicht angelegt werden.' }, { status: 502 });
  }
  log('info', 'invited user registered', { requestId: id, invitationId: row.id });
  return NextResponse.json({ ok: true, email: row.email });
}
