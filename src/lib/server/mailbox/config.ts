import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret } from './secret';
import { createMailSourceFromEnv, ImapMailSource, imapConfigFromEnv, type ImapConfig, type MailSource } from './source';

export type MailboxOrigin = 'app' | 'env' | 'stub' | 'none';

export interface StoredSettings {
  host: string;
  port: number;
  isSecure: boolean;
  user: string;
  updatedAt: string;
  /** null = stored password cannot be decrypted (server secret changed): has to be entered again. */
  password: string | null;
}

export async function loadStoredSettings(admin: SupabaseClient, familyId: string): Promise<StoredSettings | null> {
  const { data } = await admin.from('mailbox_settings').select('host,port,is_secure,username,password_enc,updated_at').eq('family_id', familyId).maybeSingle();
  if (!data) return null;
  return { host: data.host as string, port: Number(data.port), isSecure: Boolean(data.is_secure), user: data.username as string, updatedAt: data.updated_at as string, password: decryptSecret(data.password_enc as string) };
}

export interface ResolvedMailbox {
  origin: MailboxOrigin;
  source: MailSource | null;
  address: string | null;
  detail: string;
}

/** Which access is used: test stub, else the one set up in the app, else the server variables (Coolify). */
export async function resolveMailbox(admin: SupabaseClient, familyId: string, env: Record<string, string | undefined> = process.env): Promise<ResolvedMailbox> {
  if (env.MAILBOX_SOURCE === 'stub') return { origin: 'stub', source: createMailSourceFromEnv(env), address: env.MAILBOX_IMAP_USER?.trim() || null, detail: 'Testpostfach (Stub).' };
  const stored = await loadStoredSettings(admin, familyId);
  if (stored) {
    if (!stored.password) return { origin: 'app', source: null, address: stored.user, detail: 'Das gespeicherte Passwort kann nicht mehr gelesen werden. Bitte das Passwort neu eingeben.' };
    const config: ImapConfig = { host: stored.host, port: stored.port, user: stored.user, password: stored.password, isSecure: stored.isSecure };
    return { origin: 'app', source: new ImapMailSource(config, 'INBOX', env.MAILBOX_ALLOW_PLAINTEXT !== 'true'), address: stored.user, detail: 'Das Postfach ist in der App eingerichtet (nur Lesen).' };
  }
  if (imapConfigFromEnv(env)) return { origin: 'env', source: createMailSourceFromEnv(env), address: env.MAILBOX_IMAP_USER?.trim() || null, detail: 'Das Postfach ist über die Server-Einstellungen angebunden (nur Lesen).' };
  return { origin: 'none', source: null, address: null, detail: 'Postfach noch nicht eingerichtet.' };
}
