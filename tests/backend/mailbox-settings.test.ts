import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as getInbox } from '@/app/api/mailbox/inbox/route';
import { DELETE as deleteSettings, GET as getSettings, PUT as putSettings } from '@/app/api/mailbox/settings/route';
import { POST as postSync } from '@/app/api/mailbox/sync/route';
import { POST as postTest } from '@/app/api/mailbox/test/route';
import { decryptSecret } from '@/lib/server/mailbox/secret';
import { admin, backendAvailable, createFamilyWithRoles, deleteCreatedUsers } from './harness';

const available = await backendAvailable();
const imapHost = process.env.IMAP_TEST_HOST ?? '127.0.0.1';
const imapPort = Number(process.env.IMAP_TEST_PORT ?? 3143);
const greenmail = await new ImapFlow({ host: imapHost, port: imapPort, secure: false, auth: { user: 'reise', pass: 'secret' }, logger: false }).connect().then(() => true, () => false);

const call = (handler: (r: Request) => Promise<Response> | Response, token: string | null, body?: unknown, method = 'POST') =>
  handler(new Request('http://localhost/api/mailbox/x', { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }));
const settings = { host: 'imap.lodge.test', port: 993, isSecure: true, user: 'reise@lodge.test', password: 'sehr-geheim-123' };


describe.skipIf(!available)('mailbox setup in the app (real database)', () => {
  let ctx: Awaited<ReturnType<typeof createFamilyWithRoles>>;
  const previous = { ...process.env };

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_APP_MODE = 'supabase';
    process.env.MAILBOX_ALLOW_PRIVATE_HOSTS = 'true';
    process.env.MAILBOX_ALLOW_PLAINTEXT = 'true';
    process.env.MAILBOX_AI = 'off';
    delete process.env.MAILBOX_SOURCE;
    ctx = await createFamilyWithRoles();
  });
  afterAll(async () => {
    for (const key of ['NEXT_PUBLIC_APP_MODE', 'MAILBOX_ALLOW_PRIVATE_HOSTS', 'MAILBOX_ALLOW_PLAINTEXT', 'MAILBOX_AI', 'MAILBOX_SOURCE']) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await deleteCreatedUsers();
  });

  it('shows adults whether anything is set up and lets only the owner change it', async () => {
    expect(await (await call(getSettings, ctx.adult.accessToken, undefined, 'GET')).json()).toEqual({ settings: null, canEdit: false });
    expect((await (await call(getSettings, ctx.owner.accessToken, undefined, 'GET')).json()).canEdit).toBe(true);
    for (const who of [ctx.adult, ctx.member, ctx.child]) {
      expect((await call(putSettings, who.accessToken, settings, 'PUT')).status, who.role).toBe(403);
      expect((await call(deleteSettings, who.accessToken, undefined, 'DELETE')).status, who.role).toBe(403);
      expect((await call(postTest, who.accessToken, settings)).status, who.role).toBe(403);
    }
    expect((await call(putSettings, null, settings, 'PUT')).status).toBe(401);
  });

  it('validates the input and refuses internal mail servers', async () => {
    expect((await call(putSettings, ctx.owner.accessToken, { host: 'x' }, 'PUT')).status).toBe(400);
    expect((await call(putSettings, ctx.owner.accessToken, { ...settings, password: undefined }, 'PUT')).status).toBe(400); // first save needs a password
    expect((await call(putSettings, ctx.owner.accessToken, { ...settings, port: 70000 }, 'PUT')).status).toBe(400);
    delete process.env.MAILBOX_ALLOW_PRIVATE_HOSTS;
    for (const host of ['kong', 'localhost', '10.0.0.5', '169.254.169.254']) {
      const res = await call(putSettings, ctx.owner.accessToken, { ...settings, host }, 'PUT');
      expect(res.status, host).toBe(400);
      expect((await res.json()).error).toBe('HOST_NOT_ALLOWED');
      expect((await (await call(postTest, ctx.owner.accessToken, { ...settings, host })).json()).ok, host).toBe(false);
    }
    process.env.MAILBOX_ALLOW_PRIVATE_HOSTS = 'true';
  });

  it('stores the password encrypted, never returns it, and keeps it when a change comes without one', async () => {
    expect((await call(putSettings, ctx.owner.accessToken, settings, 'PUT')).status).toBe(200);
    const row = (await admin.from('mailbox_settings').select('*').eq('family_id', ctx.family.id).single()).data as { password_enc: string; host: string };
    expect(row.password_enc).not.toContain('sehr-geheim');
    expect(decryptSecret(row.password_enc)).toBe('sehr-geheim-123');

    for (const who of [ctx.owner, ctx.adult]) {
      const shown = await (await call(getSettings, who.accessToken, undefined, 'GET')).json();
      expect(shown.settings).toMatchObject({ host: 'imap.lodge.test', port: 993, isSecure: true, user: 'reise@lodge.test', hasPassword: true });
      expect(JSON.stringify(shown)).not.toMatch(/sehr-geheim|password_enc/);
    }
    expect((await call(putSettings, ctx.owner.accessToken, { ...settings, host: 'imap2.lodge.test', password: undefined }, 'PUT')).status).toBe(200);
    const kept = (await admin.from('mailbox_settings').select('password_enc,host').eq('family_id', ctx.family.id).single()).data as { password_enc: string; host: string };
    expect(kept).toMatchObject({ host: 'imap2.lodge.test', password_enc: row.password_enc });
    const mailbox = (await (await call(getInbox, ctx.adult.accessToken, undefined, 'GET')).json()).mailbox;
    expect(mailbox).toMatchObject({ state: 'ready', origin: 'app', address: 'reise@lodge.test' });
  });

  it('stores the folder (inbox by default), shows it, and refuses unusable names', async () => {
    expect((await (await call(getSettings, ctx.adult.accessToken, undefined, 'GET')).json()).settings).toMatchObject({ folder: 'INBOX' });
    expect((await call(putSettings, ctx.owner.accessToken, { ...settings, folder: 'Reise' }, 'PUT')).status).toBe(200);
    expect((await (await call(getSettings, ctx.adult.accessToken, undefined, 'GET')).json()).settings).toMatchObject({ folder: 'Reise' });
    expect((await (await call(getInbox, ctx.adult.accessToken, undefined, 'GET')).json()).mailbox.detail).toContain('Ordner „Reise“');
    for (const folder of ['', 'a\nb', 'x'.repeat(201)]) expect((await call(putSettings, ctx.owner.accessToken, { ...settings, folder }, 'PUT')).status, JSON.stringify(folder)).toBe(400);
    expect((await call(putSettings, ctx.owner.accessToken, { ...settings, folder: undefined, password: undefined }, 'PUT')).status).toBe(200);
    expect((await (await call(getSettings, ctx.owner.accessToken, undefined, 'GET')).json()).settings).toMatchObject({ folder: 'INBOX' });
  });

  it('reports an unreadable password instead of failing when the server secret changed', async () => {
    await admin.from('mailbox_settings').update({ password_enc: 'v1:AAAA:AAAA:AAAA' }).eq('family_id', ctx.family.id);
    expect((await (await call(getSettings, ctx.owner.accessToken, undefined, 'GET')).json()).settings).toMatchObject({ hasPassword: false, passwordUnreadable: true });
    expect((await (await call(getInbox, ctx.adult.accessToken, undefined, 'GET')).json()).mailbox).toMatchObject({ state: 'not_configured', origin: 'app' });
    expect((await call(putSettings, ctx.owner.accessToken, settings, 'PUT')).status).toBe(200);
  });

  it('removes the access (owner only)', async () => {
    expect((await call(deleteSettings, ctx.owner.accessToken, undefined, 'DELETE')).status).toBe(200);
    expect((await admin.from('mailbox_settings').select('family_id').eq('family_id', ctx.family.id)).data).toEqual([]);
    expect((await (await call(getInbox, ctx.adult.accessToken, undefined, 'GET')).json()).mailbox).toMatchObject({ state: 'not_configured', origin: 'none' });
  });

  it.skipIf(!greenmail)('tests the connection against a real IMAP server and explains a connection that does not work', async () => {
    const local = { host: imapHost, port: imapPort, isSecure: false, user: 'reise', password: 'secret' };
    const ok = await (await call(postTest, ctx.owner.accessToken, local)).json();
    expect(ok).toMatchObject({ ok: true, message: expect.stringContaining('Verbindung steht') });
    const refused = await (await call(postTest, ctx.owner.accessToken, { ...local, port: 1, password: 'falsch-123' })).json();
    expect(refused.ok).toBe(false);
    expect(refused.message).toMatch(/Port|Server/);
    expect(JSON.stringify(refused)).not.toContain('falsch-123');
  });

  it.skipIf(!greenmail)('fetches mails with the access saved in the app (no server variables involved)', async () => {
    const smtp = nodemailer.createTransport({ host: imapHost, port: Number(process.env.SMTP_TEST_PORT ?? 3025), secure: false });
    await smtp.sendMail({ from: 'Rezeption <info@lodge.test>', to: 'reise@example.test', subject: `Setup-Test ${Date.now()}`, text: 'Booking reference: ZZ-98765\nWe have received your payment of EUR 50.00.' });
    smtp.close();
    expect((await call(putSettings, ctx.owner.accessToken, { host: imapHost, port: imapPort, isSecure: false, user: 'reise', password: 'secret' }, 'PUT')).status).toBe(200);
    const res = await call(postSync, ctx.adult.accessToken);
    expect(res.status).toBe(200);
    expect((await res.json()).stored).toBeGreaterThanOrEqual(1);
    const inbox = await (await call(getInbox, ctx.adult.accessToken, undefined, 'GET')).json();
    expect(inbox.mails.some((m: { suggestions: { kind: string }[] }) => m.suggestions.some((s) => s.kind === 'payment_received'))).toBe(true);
  });

  it.skipIf(!greenmail)('reads only the chosen subfolder with the access saved in the app, and tells which folders exist', async () => {
    const folder = `Anbieter-${Date.now()}`;
    const client = new ImapFlow({ host: imapHost, port: imapPort, secure: false, auth: { user: 'reise', pass: 'secret' }, logger: false });
    await client.connect();
    await client.mailboxCreate(folder);
    await client.append(folder, `From: Rezeption <info@lodge.test>\r\nTo: reise@example.test\r\nSubject: Aus dem Unterordner ${folder}\r\nMessage-ID: <${folder}@lodge.test>\r\nDate: Tue, 13 Oct 2026 09:00:00 +0000\r\n\r\nWe have received your payment of EUR 75.00.\r\n`);
    await client.logout();
    const local = { host: imapHost, port: imapPort, isSecure: false, user: 'reise', password: 'secret' };
    const fresh = await createFamilyWithRoles(); // no mails filed yet: what shows up can only come from the chosen folder

    const probed = await (await call(postTest, fresh.owner.accessToken, { ...local, folder })).json();
    expect(probed).toMatchObject({ ok: true, messageCount: 1, message: expect.stringContaining(`Ordner „${folder}“`) });
    expect(probed.folders).toEqual(expect.arrayContaining(['INBOX', folder]));
    const missing = await (await call(postTest, fresh.owner.accessToken, { ...local, folder: 'Gibt-es-nicht' })).json();
    expect(missing).toMatchObject({ ok: false, message: expect.stringContaining('Ordner gibt es im Postfach nicht') });

    expect((await call(putSettings, fresh.owner.accessToken, { ...local, folder }, 'PUT')).status).toBe(200);
    const res = await (await call(postSync, fresh.adult.accessToken)).json();
    expect(res.stored).toBe(1);
    const inbox = await (await call(getInbox, fresh.adult.accessToken, undefined, 'GET')).json();
    expect(inbox.mails.map((m: { subject: string }) => m.subject)).toContain(`Aus dem Unterordner ${folder}`);
    expect(inbox.mails.filter((m: { subject: string }) => !m.subject.startsWith('Aus dem Unterordner')).length).toBe(0);
  });
});
