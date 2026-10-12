import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/db/ids';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe('newId', () => {
  it('uses randomUUID when available', () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it('falls back to getRandomValues in insecure contexts (no randomUUID)', () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    const ids = new Set(Array.from({ length: 200 }, () => newId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });
});

describe('queue timestamps', () => {
  it('are strictly increasing even when asked within the same millisecond, so the push order is the order of the changes', async () => {
    const { queueStamp } = await import('../../src/lib/db/ids');
    const stamps = Array.from({ length: 200 }, () => queueStamp());
    expect(new Set(stamps).size).toBe(200);
    expect([...stamps].sort()).toEqual(stamps);
  });
});
