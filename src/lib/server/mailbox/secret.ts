import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Encrypts the mailbox password for storage (AES-256-GCM). The key comes from MAILBOX_SECRET_KEY, or is derived from the
 * service-role key. If that secret changes, stored passwords can no longer be read and have to be entered again.
 */
function key(env: Record<string, string | undefined> = process.env): Buffer {
  const secret = env.MAILBOX_SECRET_KEY && env.MAILBOX_SECRET_KEY.length >= 16 ? env.MAILBOX_SECRET_KEY : env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Kein Server-Geheimnis zum Verschlüsseln vorhanden');
  return Buffer.from(hkdfSync('sha256', secret, 'travelapp-mailbox', 'imap-password-v1', 32));
}

export function encryptSecret(plain: string, env?: Record<string, string | undefined>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(env), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

/** Returns null when the value is damaged or was encrypted with another key (never throws on bad input). */
export function decryptSecret(stored: string, env?: Record<string, string | undefined>): string | null {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== 'v1' || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(env), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
