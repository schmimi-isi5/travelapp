import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface RawMail {
  uid: number;
  messageId: string;
  from: string;
  subject: string;
  receivedAt: string | null;
  text: string;
  attachmentNames: string[];
}

export interface MailSourceResult {
  uidValidity: number;
  mails: RawMail[];
  /** Highest UID looked at in this run (also for skipped, oversized mails), so the next run continues after it. */
  lastUid: number;
}

/** Where mails come from. The real one reads IMAP; tests bring their own. Implementations never change the mailbox. */
export interface MailSource {
  fetchNew(since: { uidValidity: number | null; lastUid: number }, limit: number): Promise<MailSourceResult>;
}

const MAX_MAIL_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 60_000;

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  isSecure: boolean;
}

export function imapConfigFromEnv(env: Record<string, string | undefined> = process.env): ImapConfig | null {
  const host = env.MAILBOX_IMAP_HOST?.trim();
  const user = env.MAILBOX_IMAP_USER?.trim();
  const password = env.MAILBOX_IMAP_PASSWORD;
  if (!host || !user || !password) return null;
  const port = Number(env.MAILBOX_IMAP_PORT) || 993;
  return { host, port, user, password, isSecure: env.MAILBOX_IMAP_SECURE ? env.MAILBOX_IMAP_SECURE !== 'false' : port !== 143 };
}

/** Read-only IMAP access (the folder is opened read-only: nothing is flagged, moved or deleted). */
export class ImapMailSource implements MailSource {
  constructor(private readonly config: ImapConfig, private readonly folder = 'INBOX') {}

  async fetchNew(since: { uidValidity: number | null; lastUid: number }, limit: number): Promise<MailSourceResult> {
    const client = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.isSecure,
      auth: { user: this.config.user, pass: this.config.password },
      logger: false,
      socketTimeout: TIMEOUT_MS,
    });
    await client.connect();
    const lock = await client.getMailboxLock(this.folder, { readOnly: true });
    try {
      const mailbox = client.mailbox;
      const uidValidity = mailbox && typeof mailbox === 'object' ? Number(mailbox.uidValidity) : 0;
      // A changed UIDVALIDITY means the old UIDs are void: start again (mails already stored are skipped by Message-ID).
      const startAfter = since.uidValidity !== null && since.uidValidity !== uidValidity ? 0 : since.lastUid;
      const mails: RawMail[] = [];
      let lastUid = startAfter;
      for await (const message of client.fetch(`${startAfter + 1}:*`, { uid: true, source: true, size: true, internalDate: true }, { uid: true })) {
        if (message.uid <= startAfter) continue; // "N:*" always returns the newest message, even when it is older than N
        if (mails.length >= limit) break;
        lastUid = Math.max(lastUid, message.uid);
        if (!message.source || (message.size ?? 0) > MAX_MAIL_BYTES) continue;
        const parsed = await simpleParser(message.source);
        mails.push({
          uid: message.uid,
          messageId: parsed.messageId ?? `uid-${uidValidity}-${message.uid}`,
          from: parsed.from?.text ?? '',
          subject: parsed.subject ?? '(ohne Betreff)',
          receivedAt: (parsed.date ?? (message.internalDate instanceof Date ? message.internalDate : null))?.toISOString() ?? null,
          text: (parsed.text ?? '').trim(),
          attachmentNames: parsed.attachments.map((a) => a.filename ?? 'Anhang'),
        });
      }
      return { uidValidity, mails, lastUid };
    } finally {
      lock.release();
      await client.logout().catch(() => undefined);
    }
  }
}

/** Test double (MAILBOX_SOURCE=stub): mails come from MAILBOX_STUB_MAILS (JSON array). Never for production. */
export class StubMailSource implements MailSource {
  constructor(private readonly mails: RawMail[]) {}
  async fetchNew(since: { uidValidity: number | null; lastUid: number }, limit: number): Promise<MailSourceResult> {
    const fresh = this.mails.filter((m) => m.uid > since.lastUid).sort((a, b) => a.uid - b.uid).slice(0, limit);
    return { uidValidity: 1, mails: fresh, lastUid: fresh.reduce((max, m) => Math.max(max, m.uid), since.lastUid) };
  }
}

export function createMailSourceFromEnv(env: Record<string, string | undefined> = process.env): MailSource | null {
  if (env.MAILBOX_SOURCE === 'stub') {
    try {
      return new StubMailSource(JSON.parse(env.MAILBOX_STUB_MAILS ?? '[]') as RawMail[]);
    } catch {
      return new StubMailSource([]);
    }
  }
  const config = imapConfigFromEnv(env);
  return config ? new ImapMailSource(config) : null;
}

export function mailboxStatusFromEnv(env: Record<string, string | undefined> = process.env): { state: 'ready' | 'not_configured'; detail: string; address: string | null } {
  const source = createMailSourceFromEnv(env);
  const address = env.MAILBOX_IMAP_USER?.trim() || null;
  return source
    ? { state: 'ready', detail: 'Das Postfach ist angebunden (nur Lesen).', address }
    : { state: 'not_configured', detail: 'Postfach nicht eingerichtet: MAILBOX_IMAP_HOST, MAILBOX_IMAP_USER und MAILBOX_IMAP_PASSWORD fehlen.', address };
}
