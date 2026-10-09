import { afterEach, describe, expect, it, vi } from 'vitest';
import { passwordProblem } from '@/lib/auth/password';
import { createInviteToken, MIN_INVITE_TOKEN_LENGTH, sha256Hex } from '@/lib/auth/token';
import { log } from '@/lib/server/logger';
import { getMailConfig, renderInvitation } from '@/lib/server/mailer';
import { rateLimited } from '@/lib/server/rate-limit';

afterEach(() => vi.restoreAllMocks());

describe('invitation tokens', () => {
  it('are URL-safe, long enough and unique', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => createInviteToken()));
    expect(tokens.size).toBe(200);
    for (const t of tokens) {
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(t.length).toBeGreaterThanOrEqual(MIN_INVITE_TOKEN_LENGTH);
    }
  });
  it('hash like Postgres sha256 (known vector)', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('password rules', () => {
  it('require the minimum length and a matching repetition', () => {
    expect(passwordProblem('kurz', 'kurz')).toMatch(/mindestens 10/);
    expect(passwordProblem('langes-passwort-1', 'anderes-passwort-1')).toMatch(/stimmen nicht/);
    expect(passwordProblem('langes-passwort-1', 'langes-passwort-1')).toBeNull();
  });
});

describe('rate limiter', () => {
  it('blocks after the limit within the window and recovers afterwards', () => {
    const key = `k-${Math.random()}`;
    const t0 = 1_000_000;
    const results = Array.from({ length: 5 }, (_, i) => rateLimited(key, 3, 1000, t0 + i));
    expect(results).toEqual([false, false, false, true, true]);
    expect(rateLimited(key, 3, 1000, t0 + 5000)).toBe(false);
  });
  it('tracks keys independently', () => {
    expect(rateLimited('a-1', 1, 1000, 1)).toBe(false);
    expect(rateLimited('b-1', 1, 1000, 1)).toBe(false);
    expect(rateLimited('a-1', 1, 1000, 2)).toBe(true);
  });
});

describe('structured logging', () => {
  it('writes JSON lines and redacts secrets, tokens and e-mail addresses', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    log('info', 'something happened', { requestId: 'r1', password: 'geheim', nested: { token: 'abc', ok: 1 }, email: 'a@b.de', authorization: 'Bearer x' });
    const line = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({ level: 'info', message: 'something happened', requestId: 'r1', service: 'travelapp-web', password: '[redacted]', email: '[redacted]', authorization: '[redacted]' });
    expect(line.nested).toEqual({ token: '[redacted]', ok: 1 });
    expect(typeof line.timestamp).toBe('string');
    expect(JSON.stringify(line)).not.toMatch(/geheim|a@b\.de|Bearer/);
  });
  it('routes errors to stderr', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    log('error', 'broken');
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('mail configuration', () => {
  it('is off without host or sender, and infers TLS from the port', () => {
    expect(getMailConfig({})).toBeNull();
    expect(getMailConfig({ SMTP_HOST: 'smtp.example.org' })).toBeNull();
    expect(getMailConfig({ SMTP_HOST: 'smtp.example.org', SMTP_FROM: 'a@example.org', SMTP_PORT: '465' })).toMatchObject({ secure: true, port: 465 });
    expect(getMailConfig({ SMTP_HOST: 'h', SMTP_FROM: 'f' })).toMatchObject({ secure: false, port: 587 });
  });
  it('renders an invitation that contains the link and escapes it in HTML', () => {
    const mail = renderInvitation({ link: 'https://x.example/invite?token=a&b="c', familyName: 'Familie <Test>', inviterName: 'Anna' });
    expect(mail.text).toContain('https://x.example/invite?token=a&b="c');
    expect(mail.html).toContain('token=a&amp;b=&quot;c');
    expect(mail.html).not.toContain('<Test>');
    expect(mail.html).toContain('&lt;Test&gt;');
    expect(mail.subject).toMatch(/Einladung/);
  });
});
