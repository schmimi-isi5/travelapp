import { NextResponse } from 'next/server';
import { aiBudgetExceeded } from '@/lib/server/ai-guard';
import { log, requestId } from '@/lib/server/logger';
import { authorizeMailbox } from '@/lib/server/mailbox/access';
import { loadStoredSettings } from '@/lib/server/mailbox/config';
import { assertPublicHost, HostNotAllowedError } from '@/lib/server/mailbox/hosts';
import { encryptSecret } from '@/lib/server/mailbox/secret';
import { mailboxSettingsInput } from '@/lib/server/mailbox/settings-schema';

export const dynamic = 'force-dynamic';

const deny = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

/** The setup without the password (adults see it, only the owner may change it). */
export async function GET(request: Request) {
  const access = await authorizeMailbox(request);
  if (!access.ok) return access.response;
  const { admin, familyId, isOwner } = access.caller;
  const stored = await loadStoredSettings(admin, familyId);
  const settings = stored ? { host: stored.host, port: stored.port, isSecure: stored.isSecure, user: stored.user, hasPassword: stored.password !== null, passwordUnreadable: stored.password === null, updatedAt: stored.updatedAt } : null;
  return NextResponse.json({ settings, canEdit: isOwner }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Saves the access (owner only). The password is encrypted before it is stored and never sent back. */
export async function PUT(request: Request) {
  const id = requestId(request);
  const access = await authorizeMailbox(request);
  if (!access.ok) return access.response;
  const { admin, familyId, isOwner, userId } = access.caller;
  if (!isOwner) return deny(403, 'FORBIDDEN', 'Nur der Besitzer der Familie richtet das Postfach ein.');
  if (aiBudgetExceeded('mailbox-settings', access.caller.key, 20, 60)) return deny(429, 'RATE_LIMITED', 'Zu viele Versuche. Bitte später erneut versuchen.');
  const parsed = mailboxSettingsInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return deny(400, 'INVALID_REQUEST', 'Bitte Server, Port und Benutzername ausfüllen.');
  const input = parsed.data;
  try {
    await assertPublicHost(input.host);
  } catch (error) {
    if (error instanceof HostNotAllowedError) return deny(400, 'HOST_NOT_ALLOWED', error.message);
    throw error;
  }
  const existing = await admin.from('mailbox_settings').select('password_enc').eq('family_id', familyId).maybeSingle();
  if (!input.password && !existing.data) return deny(400, 'PASSWORD_REQUIRED', 'Bitte das Passwort eingeben.');
  const { error } = await admin.from('mailbox_settings').upsert({
    family_id: familyId,
    host: input.host,
    port: input.port,
    is_secure: input.isSecure,
    username: input.user,
    password_enc: input.password ? encryptSecret(input.password) : (existing.data!.password_enc as string),
    updated_by: userId,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    log('error', 'mailbox settings not saved', { requestId: id });
    return deny(502, 'SAVE_FAILED', 'Die Einstellungen konnten nicht gespeichert werden.');
  }
  // a new access may belong to a different mailbox: start reading from the beginning (known mails are skipped by Message-ID)
  await admin.from('mail_sync_state').delete().eq('family_id', familyId);
  log('info', 'mailbox settings saved', { requestId: id });
  return NextResponse.json({ ok: true });
}

/** Removes the access set up in the app (owner only). Mails already filed stay where they are. */
export async function DELETE(request: Request) {
  const access = await authorizeMailbox(request);
  if (!access.ok) return access.response;
  const { admin, familyId, isOwner } = access.caller;
  if (!isOwner) return deny(403, 'FORBIDDEN', 'Nur der Besitzer der Familie richtet das Postfach ein.');
  const { error } = await admin.from('mailbox_settings').delete().eq('family_id', familyId);
  if (error) return deny(502, 'DELETE_FAILED', 'Der Zugang konnte nicht entfernt werden.');
  return NextResponse.json({ ok: true });
}
