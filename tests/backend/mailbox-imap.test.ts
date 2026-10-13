import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ImapMailSource, imapConfigFromEnv } from '@/lib/server/mailbox/source';

/** Needs a local IMAP/SMTP test server (GreenMail): docker run -p 3025:3025 -p 3143:3143 -e GREENMAIL_OPTS='-Dgreenmail.setup.test.smtp -Dgreenmail.setup.test.imap -Dgreenmail.hostname=0.0.0.0 -Dgreenmail.users=reise:secret@example.test' greenmail/standalone:2.1.3 */
const HOST = process.env.IMAP_TEST_HOST ?? '127.0.0.1';
const config = { host: HOST, port: Number(process.env.IMAP_TEST_PORT ?? 3143), user: 'reise', password: 'secret', isSecure: false };
const available = await new ImapFlow({ host: config.host, port: config.port, secure: false, auth: { user: config.user, pass: config.password }, logger: false })
  .connect().then(() => true, () => false);

describe.skipIf(!available)('IMAP mail source (real IMAP server)', () => {
  const smtp = nodemailer.createTransport({ host: HOST, port: Number(process.env.SMTP_TEST_PORT ?? 3025), secure: false, tls: { rejectUnauthorized: false } });
  const source = new ImapMailSource(config, false);

  // other test files write into the same test inbox: this file only looks at its own mails
  const tag = Date.now();
  const mine = (mails: { subject: string }[]) => mails.filter((m) => m.subject.endsWith(`[${tag}]`));

  beforeAll(async () => {
    await smtp.sendMail({ from: 'Rezeption <info@lodge.test>', to: 'reise@example.test', subject: `Anzahlung erhalten [${tag}]`, text: 'We have received your deposit of NAD 2,340.00.\nBooking reference: AB-12345', attachments: [{ filename: 'rechnung.pdf', content: Buffer.from('%PDF-1.4 test') }] });
    await smtp.sendMail({ from: 'host@lodge.test', to: 'reise@example.test', subject: `Zweite Mail [${tag}]`, html: '<p>Hallo <b>Welt</b></p>' });
  });
  afterAll(() => smtp.close());

  it('reads new mails with sender, subject, text and attachment names, and continues after the last UID', async () => {
    const first = await source.fetchNew({ uidValidity: null, lastUid: 0 }, 40);
    const own = mine(first.mails) as typeof first.mails;
    expect(own.map((m) => m.subject)).toEqual([`Anzahlung erhalten [${tag}]`, `Zweite Mail [${tag}]`]);
    expect(own[0]).toMatchObject({ from: expect.stringContaining('info@lodge.test'), attachmentNames: ['rechnung.pdf'] });
    expect(own[0]!.text).toContain('NAD 2,340.00');
    expect(own[1]!.text).toContain('Hallo Welt');
    expect(first.mails.every((m) => m.messageId.length > 3 && m.receivedAt)).toBe(true);

    const again = await source.fetchNew({ uidValidity: first.uidValidity, lastUid: first.lastUid }, 40);
    expect(again.mails).toEqual([]);
    expect(again.lastUid).toBe(first.lastUid);
  });

  it('respects the per-run limit and starts over when the UID validity changed', async () => {
    const limited = await source.fetchNew({ uidValidity: null, lastUid: 0 }, 1);
    expect(limited.mails).toHaveLength(1);
    const restarted = await source.fetchNew({ uidValidity: 999_999, lastUid: 1_000 }, 40);
    expect(mine(restarted.mails)).toHaveLength(2);
  });

  it('only reads: the mails stay unread and in place', async () => {
    await source.fetchNew({ uidValidity: null, lastUid: 0 }, 40);
    const client = new ImapFlow({ host: config.host, port: config.port, secure: false, auth: { user: config.user, pass: config.password }, logger: false });
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const flags: string[][] = [];
      for await (const message of client.fetch('1:*', { flags: true })) flags.push([...(message.flags ?? [])]);
      expect(flags.length).toBeGreaterThanOrEqual(2);
      expect(flags.every((f) => !f.includes('\\Seen') && !f.includes('\\Deleted'))).toBe(true);
    } finally {
      lock.release();
      await client.logout();
    }
  });

  it('reads only the chosen subfolder, not the inbox, and lists the folders', async () => {
    const folder = `Reise-${tag}`;
    const client = new ImapFlow({ host: config.host, port: config.port, secure: false, auth: { user: config.user, pass: config.password }, logger: false });
    await client.connect();
    await client.mailboxCreate(folder);
    const raw = (subject: string) => `From: Rezeption <info@lodge.test>\r\nTo: reise@example.test\r\nSubject: ${subject}\r\nMessage-ID: <${subject.replace(/\W+/g, '-')}@lodge.test>\r\nDate: Tue, 13 Oct 2026 09:00:00 +0000\r\n\r\nBooking reference: FO-24680\r\n`;
    await client.append(folder, raw(`Nur im Unterordner [${tag}]`));
    await client.logout();

    const sub = new ImapMailSource({ ...config, folder }, false);
    const read = await sub.fetchNew({ uidValidity: null, lastUid: 0 }, 40);
    expect(read.mails.map((m) => m.subject)).toEqual([`Nur im Unterordner [${tag}]`]);
    expect(read.mails[0]!.text).toContain('FO-24680');
    const probe = await sub.probe();
    expect(probe.messageCount).toBe(1);
    expect(probe.folders).toEqual(expect.arrayContaining(['INBOX', folder]));
    // the inbox is a different folder with different mails
    expect(mine((await source.fetchNew({ uidValidity: null, lastUid: 0 }, 40)).mails)).toHaveLength(2);
    expect(mine(read.mails).map((m) => m.subject)).toEqual([`Nur im Unterordner [${tag}]`]); // and the inbox mails are not in the subfolder
  });

  it('says so when the folder does not exist', async () => {
    await expect(new ImapMailSource({ ...config, folder: 'Gibt-es-nicht' }, false).probe()).rejects.toMatchObject({ code: 'FOLDER_NOT_FOUND' });
  });

  it('is configured from the environment only with host, user and password', () => {
    expect(imapConfigFromEnv({})).toBeNull();
    expect(imapConfigFromEnv({ MAILBOX_IMAP_HOST: 'h', MAILBOX_IMAP_USER: 'u' })).toBeNull();
    expect(imapConfigFromEnv({ MAILBOX_IMAP_HOST: 'h', MAILBOX_IMAP_USER: 'u', MAILBOX_IMAP_PASSWORD: 'p' })).toMatchObject({ port: 993, isSecure: true });
    expect(imapConfigFromEnv({ MAILBOX_IMAP_HOST: 'h', MAILBOX_IMAP_USER: 'u', MAILBOX_IMAP_PASSWORD: 'p', MAILBOX_IMAP_PORT: '143' })).toMatchObject({ port: 143, isSecure: false });
  });
});
