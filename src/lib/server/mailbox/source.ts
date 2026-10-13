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
  /** Connects and looks at the folder without reading mails: proves host, port, encryption, login and folder. Also lists the folders. */
  probe(): Promise<{ messageCount: number; folders: string[] }>;
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
  /** Folder to read; the inbox when absent. */
  folder?: string;
}

export function imapConfigFromEnv(env: Record<string, string | undefined> = process.env): ImapConfig | null {
  const host = env.MAILBOX_IMAP_HOST?.trim();
  const user = env.MAILBOX_IMAP_USER?.trim();
  const password = env.MAILBOX_IMAP_PASSWORD;
  if (!host || !user || !password) return null;
  const port = Number(env.MAILBOX_IMAP_PORT) || 993;
  return { host, port, user, password, isSecure: env.MAILBOX_IMAP_SECURE ? env.MAILBOX_IMAP_SECURE !== 'false' : port !== 143, folder: env.MAILBOX_IMAP_FOLDER?.trim() || 'INBOX' };
}

/** Read-only IMAP access (the folder is opened read-only: nothing is flagged, moved or deleted). */
export class ImapMailSource implements MailSource {
  /** `requireTls`: without direct TLS the connection must be upgraded with STARTTLS; only a local test server may run without. */
  constructor(private readonly config: ImapConfig, private readonly requireTls = true) {}

  private get folder(): string {
    return this.config.folder || 'INBOX';
  }

  private client(): ImapFlow {
    return new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.isSecure,
      doSTARTTLS: this.config.isSecure ? undefined : this.requireTls,
      auth: { user: this.config.user, pass: this.config.password },
      logger: false,
      socketTimeout: TIMEOUT_MS,
      greetingTimeout: 20_000,
    });
  }

  async probe(): Promise<{ messageCount: number; folders: string[] }> {
    const client = this.client();
    await client.connect();
    try {
      const folders = (await client.list()).filter((f) => !f.flags.has('\\Noselect')).map((f) => f.path).sort((a, b) => a.localeCompare(b));
      if (!folders.includes(this.folder)) throw Object.assign(new Error('Folder not found'), { code: 'FOLDER_NOT_FOUND' });
      const status = await client.status(this.folder, { messages: true });
      return { messageCount: status === false ? 0 : (status.messages ?? 0), folders };
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  async fetchNew(since: { uidValidity: number | null; lastUid: number }, limit: number): Promise<MailSourceResult> {
    const client = this.client();
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
  async probe(): Promise<{ messageCount: number; folders: string[] }> {
    return { messageCount: this.mails.length, folders: ['INBOX', 'Reise'] };
  }
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

/** What a person can do about a failed connection, without the server's raw message (it may echo the user name). */
export function describeImapError(error: unknown): string {
  const e = error as { authenticationFailed?: boolean; code?: string; message?: string } | null;
  const code = e?.code ?? '';
  const message = e?.message ?? '';
  if (e?.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed/i.test(message)) return 'Anmeldung abgelehnt: Benutzername oder Passwort stimmen nicht (bei manchen Anbietern braucht es ein App-Passwort).';
  if (code === 'FOLDER_NOT_FOUND') return 'Diesen Ordner gibt es im Postfach nicht. Bitte einen der angezeigten Ordner wählen und die Schreibweise genau übernehmen.';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Der Server wurde nicht gefunden. Bitte den Servernamen prüfen.';
  if (code === 'ECONNREFUSED') return 'Der Server nimmt auf diesem Port keine Verbindung an. Bitte Port und Verschlüsselung prüfen.';
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || /timeout|timed out/i.test(message)) return 'Der Server antwortet nicht. Bitte Servername, Port und Verschlüsselung prüfen.';
  if (/CERT|certificate|self.signed|hostname/i.test(`${code} ${message}`)) return 'Das Zertifikat des Servers ist nicht gültig oder passt nicht zum Servernamen.';
  if (/STARTTLS/i.test(message)) return 'Der Server bietet keine Verschlüsselung (STARTTLS) an. Bitte SSL/TLS mit Port 993 wählen.';
  return 'Die Verbindung zum Postfach hat nicht geklappt. Bitte Servername, Port, Verschlüsselung und Zugangsdaten prüfen.';
}
