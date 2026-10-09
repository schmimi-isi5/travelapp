import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MIN_INVITE_TOKEN_LENGTH, sha256Hex } from '@/lib/auth/token';
import { log, requestId } from '@/lib/server/logger';
import { getMailConfig, sendInvitationMail } from '@/lib/server/mailer';
import { clientKey, rateLimited } from '@/lib/server/rate-limit';
import { bearerToken, createUserClient, isServerConfigured } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ invitationId: z.string().uuid(), token: z.string().min(MIN_INVITE_TOKEN_LENGTH).max(200) });

/**
 * Sends the invitation link by e-mail. The caller proves they may invite (RLS: owner/adult can read the invitation row)
 * and knows the raw token (its hash must match the stored one). The recipient address comes from the stored invitation.
 */
export async function POST(request: Request) {
  const id = requestId(request);
  const mail = getMailConfig();
  if (!mail) return NextResponse.json({ error: 'NOT_CONFIGURED', message: 'Der E-Mail-Versand ist nicht eingerichtet. Bitte den Link manuell weitergeben.' }, { status: 501 });
  if (!isServerConfigured()) return NextResponse.json({ error: 'NOT_CONFIGURED', message: 'Supabase ist serverseitig nicht konfiguriert.' }, { status: 503 });
  const accessToken = bearerToken(request);
  if (!accessToken) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (rateLimited(`invite-mail:${clientKey(request)}`, 20, 60 * 60_000)) return NextResponse.json({ error: 'RATE_LIMITED', message: 'Zu viele E-Mails. Bitte später erneut versuchen.' }, { status: 429 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });

  const client = createUserClient(accessToken);
  const { data, error } = await client.from('invitations').select('email, token_hash, expires_at, accepted_at, revoked_at, family_id').eq('id', parsed.data.invitationId).maybeSingle();
  const row = data as { email: string; token_hash: string; expires_at: string; accepted_at: string | null; revoked_at: string | null; family_id: string } | null;
  if (error || !row || row.accepted_at || row.revoked_at || Date.parse(row.expires_at) <= Date.now() || row.token_hash !== (await sha256Hex(parsed.data.token))) {
    return NextResponse.json({ error: 'INVITATION_INVALID', message: 'Die Einladung ist ungültig oder abgelaufen.' }, { status: 400 });
  }
  const [{ data: family }, { data: auth }] = await Promise.all([client.from('families').select('name').eq('id', row.family_id).maybeSingle(), client.auth.getUser(accessToken)]);
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  try {
    await sendInvitationMail(mail, {
      to: row.email,
      link: `${origin.replace(/\/$/, '')}/invite?token=${encodeURIComponent(parsed.data.token)}`,
      familyName: (family as { name: string } | null)?.name ?? null,
      inviterName: typeof auth.user?.user_metadata?.display_name === 'string' ? auth.user.user_metadata.display_name : null,
    });
  } catch (cause) {
    log('error', 'invitation mail failed', { requestId: id, detail: cause instanceof Error ? cause.message : String(cause) });
    return NextResponse.json({ error: 'MAIL_FAILED', message: 'Die E-Mail konnte nicht gesendet werden. Bitte den Link manuell weitergeben.' }, { status: 502 });
  }
  log('info', 'invitation mail sent', { requestId: id, invitationId: parsed.data.invitationId });
  return NextResponse.json({ ok: true });
}
