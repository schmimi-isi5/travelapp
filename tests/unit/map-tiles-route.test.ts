import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/map/tiles/route';

const BYTES = Buffer.from('0123456789abcdefghij'); // 20 bytes
let dir: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'tiles-'));
  writeFileSync(path.join(dir, 'tiles.pmtiles'), BYTES);
  process.env.MAP_TILES_FILE = path.join(dir, 'tiles.pmtiles');
});

afterAll(() => {
  delete process.env.MAP_TILES_FILE;
  rmSync(dir, { recursive: true, force: true });
});

const get = (range?: string) => GET(new Request('http://localhost/api/map/tiles', range ? { headers: { Range: range } } : undefined));

describe('GET /api/map/tiles', () => {
  it('serves the whole archive without a Range header', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-length')).toBe('20');
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe(BYTES.toString());
  });

  it('serves a byte range as 206 with Content-Range', async () => {
    const res = await get('bytes=5-9');
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 5-9/20');
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('56789');
  });

  it('supports open-ended and suffix ranges and clamps the end', async () => {
    expect(Buffer.from(await (await get('bytes=15-')).arrayBuffer()).toString()).toBe('fghij');
    expect(Buffer.from(await (await get('bytes=-3')).arrayBuffer()).toString()).toBe('hij');
    const clamped = await get('bytes=18-99');
    expect(clamped.headers.get('content-range')).toBe('bytes 18-19/20');
  });

  it('rejects unsatisfiable and malformed ranges with 416', async () => {
    for (const range of ['bytes=20-30', 'bytes=9-3', 'bytes=-', 'items=0-1']) {
      const res = await get(range);
      expect(res.status, range).toBe(416);
      expect(res.headers.get('content-range')).toBe('bytes */20');
    }
  });

  it('answers 404 when no archive is installed', async () => {
    process.env.MAP_TILES_FILE = path.join(dir, 'missing.pmtiles');
    expect((await get()).status).toBe(404);
    process.env.MAP_TILES_FILE = path.join(dir, 'tiles.pmtiles');
  });
});
