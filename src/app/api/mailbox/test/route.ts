import { NextResponse } from 'next/server';
import { aiBudgetExceeded } from '@/lib/server/ai-guard';
import { log, requestId } from '@/lib/server/logger';
import { authorizeMailbox } from '@/lib/server/mailbox/access';
import { loadStoredSettings } from '@/lib/server/mailbox/config';
import { assertPublicHost, HostNotAllowedError } from '@/lib/server/mailbox/hosts';
import { mailboxSettingsInput } from '@/lib/server/mailbox/settings-schema';
import { createMailSourceFromEnv, describeImapError, ImapMailSource } from '@/lib/server/mailbox/source';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Tries a login with what the owner typed (or the stored password when none is typed) and reports how many mails the chosen folder holds (plus the folders that exist).
 * Nothing is saved and no mail is read. Owner only, with its own budget: a mail server is contacted on the caller's behalf.
 */
export async function POST(request: Request) {
  const id = requestId(request);
  const access = await authorizeMailbox(request);
  if (!access.ok) return access.response;
  const { admin, familyId, isOwner, key } = access.caller;
  if (!isOwner) return NextResponse.json({ error: 'FORBIDDEN', message: 'Nur der Besitzer der Familie richtet das Postfach ein.' }, { status: 403 });
  if (aiBudgetExceeded('mailbox-test', key, 10, 40)) return NextResponse.json({ error: 'RATE_LIMITED', message: 'Zu viele Versuche. Bitte später erneut versuchen.' }, { status: 429 });
  const parsed = mailboxSettingsInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_REQUEST', message: 'Bitte Server, Port und Benutzername ausfüllen.' }, { status: 400 });
  const input = parsed.data;
  try {
    await assertPublicHost(input.host);
  } catch (error) {
    if (error instanceof HostNotAllowedError) return NextResponse.json({ ok: false, message: error.message });
    throw error;
  }
  const password = input.password ?? (await loadStoredSettings(admin, familyId))?.password ?? null;
  if (!password) return NextResponse.json({ ok: false, message: 'Bitte das Passwort eingeben.' });
  const source = process.env.MAILBOX_SOURCE === 'stub' ? createMailSourceFromEnv() : new ImapMailSource({ host: input.host, port: input.port, user: input.user, password, isSecure: input.isSecure, folder: input.folder }, process.env.MAILBOX_ALLOW_PLAINTEXT !== 'true');
  try {
    const { messageCount, folders } = await source!.probe();
    const where = input.folder === 'INBOX' ? 'im Posteingang' : `im Ordner „${input.folder}“`;
    return NextResponse.json({ ok: true, messageCount, folders, message: `Verbindung steht. ${where[0]!.toUpperCase()}${where.slice(1)} liegen ${messageCount} ${messageCount === 1 ? 'Mail' : 'Mails'}.` }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // only the code goes to the log: messages of mail servers can contain the user name
    log('warn', 'mailbox test failed', { requestId: id, code: (error as { code?: string })?.code ?? 'unknown' });
    return NextResponse.json({ ok: false, message: describeImapError(error) });
  }
}
