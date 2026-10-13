import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const HOSTNAME = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/** True for loopback, private, link-local, carrier-grade NAT and other addresses that are not on the public internet. */
export function isPrivateAddress(address: string): boolean {
  const v6 = address.toLowerCase();
  if (isIP(v6) === 6) {
    if (v6 === '::1' || v6 === '::') return true;
    if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
    return /^(fc|fd|fe[89ab])/.test(v6);
  }
  const p = address.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p as [number, number, number, number];
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || a >= 224;
}

export class HostNotAllowedError extends Error {}

/**
 * A mail server chosen in the app must be a public host name: no IP literals, no single-word names like "kong" or "db"
 * (those would reach the app's own network), and the name must not resolve to a private address.
 * Tests may allow local hosts with MAILBOX_ALLOW_PRIVATE_HOSTS=true or use the stub source.
 */
export async function assertPublicHost(host: string, env: Record<string, string | undefined> = process.env): Promise<void> {
  if (env.MAILBOX_ALLOW_PRIVATE_HOSTS === 'true' || env.MAILBOX_SOURCE === 'stub') return;
  if (!HOSTNAME.test(host) || isIP(host) !== 0) throw new HostNotAllowedError('Bitte den Servernamen angeben, z. B. imap.beispiel.de (keine IP-Adresse, kein internes Netz).');
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new HostNotAllowedError('Der Servername wurde nicht gefunden. Bitte die Schreibweise prüfen.');
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) throw new HostNotAllowedError('Dieser Server liegt nicht im öffentlichen Internet und wird nicht verwendet.');
}
