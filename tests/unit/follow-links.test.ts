import { describe, expect, it } from 'vitest';
import { expiryFor, linkStatus, mailtoUrl, shareMessage, whatsappUrl } from '@/features/follow/links';

const NOW = Date.parse('2026-10-19T12:00:00Z');

describe('follower link helpers', () => {
  it('tells active, ended and expired links apart (ended wins)', () => {
    expect(linkStatus({ revoked_at: null, expires_at: null }, NOW)).toBe('active');
    expect(linkStatus({ revoked_at: null, expires_at: '2026-11-01T00:00:00Z' }, NOW)).toBe('active');
    expect(linkStatus({ revoked_at: null, expires_at: '2026-10-01T00:00:00Z' }, NOW)).toBe('expired');
    expect(linkStatus({ revoked_at: '2026-10-02T00:00:00Z', expires_at: '2026-10-01T00:00:00Z' }, NOW)).toBe('ended');
  });

  it('computes the expiry per choice and refuses unusable ones', () => {
    expect(expiryFor('none', null, NOW)).toBeNull();
    expect(expiryFor('week', null, NOW)).toBe('2026-10-26T12:00:00.000Z');
    expect(expiryFor('month', null, NOW)).toBe('2026-11-18T12:00:00.000Z');
    expect(expiryFor('after_trip', '2026-11-10', NOW)).toBe('2026-12-10T00:00:00.000Z');
    expect(expiryFor('after_trip', null, NOW)).toBeUndefined();
    expect(expiryFor('after_trip', '2026-08-01', NOW)).toBeUndefined();
  });

  it('builds a message with the link and encodes it for mail and WhatsApp', () => {
    const url = 'https://reise.schmeckseler.de/f/abc_DEF-1';
    expect(shareMessage(url, 'Oma')).toContain(`Hallo Oma, hier könnt ihr unsere Reise verfolgen: ${url}`);
    expect(mailtoUrl(url, 'Oma')).toMatch(/^mailto:\?subject=.+&body=.+/);
    expect(decodeURIComponent(whatsappUrl(url, 'Oma'))).toContain(url);
    expect(whatsappUrl(url, 'Oma')).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
});
