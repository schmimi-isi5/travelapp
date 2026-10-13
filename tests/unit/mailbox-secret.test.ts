import { describe, expect, it } from 'vitest';
import { assertPublicHost, HostNotAllowedError, isPrivateAddress } from '@/lib/server/mailbox/hosts';
import { decryptSecret, encryptSecret } from '@/lib/server/mailbox/secret';
import { describeImapError } from '@/lib/server/mailbox/source';

const env = { SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-tests-0123456789' };

describe('mailbox password encryption', () => {
  it('round-trips and never stores the plain text', () => {
    const stored = encryptSecret('geheim-passwort', env);
    expect(stored).not.toContain('geheim');
    expect(stored.startsWith('v1:')).toBe(true);
    expect(decryptSecret(stored, env)).toBe('geheim-passwort');
  });
  it('uses a fresh nonce each time', () => {
    expect(encryptSecret('x', env)).not.toBe(encryptSecret('x', env));
  });
  it('cannot be read with another secret, after tampering or when malformed (returns null, no throw)', () => {
    const stored = encryptSecret('geheim', env);
    expect(decryptSecret(stored, { SUPABASE_SERVICE_ROLE_KEY: 'another-secret-0123456789012345' })).toBeNull();
    const [v, iv, tag, data] = stored.split(':');
    expect(decryptSecret([v, iv, tag, Buffer.from('other').toString('base64')].join(':'), env)).toBeNull();
    expect(decryptSecret('garbage', env)).toBeNull();
    expect(decryptSecret(`v1:${iv}:${tag}:`, env)).toBeNull();
    expect(data).toBeTruthy();
  });
  it('prefers MAILBOX_SECRET_KEY when set and long enough, and refuses without any secret', () => {
    const own = { ...env, MAILBOX_SECRET_KEY: 'a-dedicated-mailbox-key-123' };
    const stored = encryptSecret('x', own);
    expect(decryptSecret(stored, own)).toBe('x');
    expect(decryptSecret(stored, env)).toBeNull();
    expect(() => encryptSecret('x', {})).toThrow();
  });
});

describe('mail server host check', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.5', '172.31.255.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1'])('treats %s as private', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });
  it.each(['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111'])('treats %s as public', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
  it.each(['kong', 'db', 'localhost', '127.0.0.1', '10.0.0.1', 'http://imap.example.com', 'imap example.com', 'imap.example.com:993', ''])('rejects the name %j before any lookup', async (host) => {
    await expect(assertPublicHost(host, {})).rejects.toBeInstanceOf(HostNotAllowedError);
  });
  it('allows anything for the test stub and for explicitly allowed local test servers', async () => {
    await expect(assertPublicHost('localhost', { MAILBOX_SOURCE: 'stub' })).resolves.toBeUndefined();
    await expect(assertPublicHost('127.0.0.1', { MAILBOX_ALLOW_PRIVATE_HOSTS: 'true' })).resolves.toBeUndefined();
  });
});

describe('describeImapError', () => {
  it('turns connection problems into advice without echoing server text', () => {
    expect(describeImapError({ authenticationFailed: true, message: 'Command failed for user reise@x' })).toMatch(/Benutzername oder Passwort/);
    expect(describeImapError({ code: 'ENOTFOUND' })).toMatch(/nicht gefunden/);
    expect(describeImapError({ code: 'ECONNREFUSED' })).toMatch(/Port/);
    expect(describeImapError({ code: 'ETIMEDOUT' })).toMatch(/antwortet nicht/);
    expect(describeImapError({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' })).toMatch(/Zertifikat/);
    expect(describeImapError(new Error('secret@user leaked'))).not.toContain('secret@user');
  });
});
