import { describe, expect, it } from 'vitest';
import { PREVIEW_HOURS, previewPath, reusablePreviewToken } from '@/features/follow/preview';

const NOW = Date.parse('2026-10-18T10:00:00Z');
const stored = (token: string, hoursLeft: number) => JSON.stringify({ token, expiresAt: NOW + hoursLeft * 3_600_000 });

describe('preview link reuse', () => {
  it('reuses a stored token while it has comfortably more than ten minutes left', () => {
    expect(reusablePreviewToken(stored('abc', 1.5), NOW)).toBe('abc');
    expect(reusablePreviewToken(stored('abc', 0.25), NOW)).toBe('abc');
  });

  it('makes a new link when the stored one is about to end, has ended, or is damaged or missing', () => {
    expect(reusablePreviewToken(stored('abc', 0.1), NOW)).toBeNull();
    expect(reusablePreviewToken(stored('abc', -1), NOW)).toBeNull();
    expect(reusablePreviewToken(null, NOW)).toBeNull();
    expect(reusablePreviewToken('not json', NOW)).toBeNull();
    expect(reusablePreviewToken('{"token":5,"expiresAt":"x"}', NOW)).toBeNull();
  });

  it('marks the address as a preview and keeps the preview short-lived', () => {
    expect(previewPath('tok')).toBe('/f/tok?vorschau=1');
    expect(PREVIEW_HOURS).toBeLessThanOrEqual(2);
  });
});
