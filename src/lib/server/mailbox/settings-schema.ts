import { z } from 'zod';

/** What the owner enters. Without a password the stored one is kept (or used for the test). */
export const mailboxSettingsInput = z.object({
  host: z.string().trim().toLowerCase().min(3).max(253),
  port: z.number().int().min(1).max(65535),
  /** true: encrypted from the start (SSL/TLS, usually port 993); false: STARTTLS (usually port 143). Never unencrypted. */
  isSecure: z.boolean(),
  user: z.string().trim().min(1).max(320),
  /** IMAP folder to read, e.g. "Reise" or "INBOX.Reise" (the server's own spelling). Default: the inbox. */
  folder: z.string().trim().min(1).max(200).regex(/^[^\x00-\x1f]+$/, 'Ungültiger Ordnername').default('INBOX'),
  password: z.string().min(1).max(500).optional(),
});
export type MailboxSettingsInput = z.infer<typeof mailboxSettingsInput>;
