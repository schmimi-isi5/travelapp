import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as getImage } from '@/app/media/destination/[...path]/route';
import { makeVariants } from '../../scripts/destination-images/makeVariants.mjs';
import { BUCKET, runImport } from '../../scripts/destination-images/pipeline.mjs';
import { admin, anon, backendAvailable, createUser, deleteCreatedUsers, uniq, type TestUser } from './harness';

const available = await backendAvailable();

/** A 3000x1800 photo with camera data and GPS, like a phone or camera original. */
async function photo(seed: number): Promise<Buffer> {
  return sharp({ create: { width: 3000, height: 1800, channels: 3, background: { r: (seed * 40) % 255, g: 120, b: 90 } } })
    .withExif({ IFD0: { Make: 'TestCam' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '24/1 45/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '15/1 17/1 0/1' } })
    .jpeg()
    .toBuffer();
}

describe.skipIf(!available)('destination image library (real Supabase: table, RLS, storage, app route)', () => {
  const tag = uniq();
  const stop = { id: 'stop-x', title: `Testort ${tag}`, country: 'Namibia', latitude: -24.48, longitude: 15.8 };
  const placeKey = `testort-${tag}`;
  let user: TestUser;
  let imports = 0;

  const candidates = [1, 2, 3, 4, 5, 6].map((n) => ({
    id: String(n), title: `File:Testort ${tag} dunes ${n}.jpg`, width: 3000, height: 1800, thumbUrl: `https://upload.example/${tag}/${n}.jpg`, pageUrl: `https://commons.example/wiki/File:Testort_${tag}_${n}.jpg`,
    categories: 'Namib desert', description: `Dünen ${n}`, coords: { lat: -24.49, lon: 15.81 },
    meta: { LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' }, Artist: { value: `Fotograf ${n}` } },
  }));
  const commons = {
    search: async () => candidates,
    download: async (url: string) => {
      imports += 1;
      return photo(Number(url.split('/').pop()?.replace('.jpg', '')));
    },
  };
  const run = () => runImport({ stops: [stop], admin, commons, makeVariants });

  beforeAll(async () => {
    user = await createUser('bilder');
  });
  afterAll(async () => {
    const { data } = await admin.from('destination_images').select('variants').eq('place_key', placeKey);
    const paths = (data ?? []).flatMap((r) => Object.values(r.variants as Record<string, string>));
    if (paths.length) await admin.storage.from(BUCKET).remove(paths);
    await admin.from('destination_images').delete().eq('place_key', placeKey);
    await deleteCreatedUsers();
  });

  it('imports hero, card and three gallery images with responsive WebP variants and no camera metadata', async () => {
    const [report] = await run();
    expect(report).toMatchObject({ place: placeKey, status: 'complete' });
    const { data: rows } = await admin.from('destination_images').select('*').eq('place_key', placeKey);
    expect((rows ?? []).map((r) => r.role).sort()).toEqual(['card', 'gallery', 'gallery', 'gallery', 'hero']);
    const hero = rows!.find((r) => r.role === 'hero')!;
    expect(hero).toMatchObject({ approved: true, license_verified: true, location_verified: true, license_type: 'CC BY-SA 4.0' });
    expect(Object.keys(hero.variants).sort()).toEqual(['desktop', 'mobile', 'tablet']);
    const { data: file, error } = await admin.storage.from(BUCKET).download(hero.variants.desktop);
    expect(error).toBeNull();
    const meta = await sharp(Buffer.from(await file!.arrayBuffer())).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 1920, height: 1080 });
    expect(meta.exif).toBeUndefined();
    const tablet = await sharp(Buffer.from(await (await admin.storage.from(BUCKET).download(hero.variants.tablet)).data!.arrayBuffer())).metadata();
    expect(tablet.width).toBe(1200);
  });

  it('is idempotent against the real database and storage: the second run changes and downloads nothing', async () => {
    const before = (await admin.from('destination_images').select('id', { count: 'exact', head: true }).eq('place_key', placeKey)).count;
    const downloads = imports;
    const [report] = await run();
    expect(report!.status).toBe('complete_skipped');
    expect(imports).toBe(downloads);
    expect((await admin.from('destination_images').select('id', { count: 'exact', head: true }).eq('place_key', placeKey)).count).toBe(before);
  });

  it('shows the library to signed-in users, hides it from visitors and lets nobody but the service write', async () => {
    const own = await user.client.from('destination_images').select('id, role, approved').eq('place_key', placeKey);
    expect(own.data).toHaveLength(5);
    expect(own.data!.every((r) => r.approved)).toBe(true);
    expect((await anon.from('destination_images').select('id').eq('place_key', placeKey)).data ?? []).toEqual([]);
    const write = await user.client.from('destination_images').update({ approved: false }).eq('place_key', placeKey);
    expect(write.error).not.toBeNull();
    const insert = await user.client.from('destination_images').insert({ place_key: placeKey, place_label: 'x', role: 'hero', variants: {}, width: 1, height: 1, alt_text: 'x', source_provider: 'p', source_id: 'i', source_url: 'u', license_type: 'l', attribution_text: 'a', content_hash: 'z' });
    expect(insert.error).not.toBeNull();
  });

  it('serves the variants from the app origin as immutable WebP and refuses anything outside the library', async () => {
    const { data } = await admin.from('destination_images').select('variants').eq('place_key', placeKey).eq('role', 'card').single();
    const path = (data!.variants as Record<string, string>).card!;
    const ok = await getImage(new Request(`http://localhost/media/destination/${path}`), { params: Promise.resolve({ path: path.split('/') }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/webp');
    expect(ok.headers.get('cache-control')).toContain('immutable');
    expect((await sharp(Buffer.from(await ok.arrayBuffer())).metadata()).width).toBe(800);
    for (const bad of [['..', 'media', 'x.webp'], [placeKey, 'not-a-hash.webp'], [placeKey, 'abcdef123456-hero-desktop.webp'], ['a', 'b', 'c']]) {
      const res = await getImage(new Request('http://localhost/media/destination/x'), { params: Promise.resolve({ path: bad }) });
      expect(res.status, bad.join('/')).toBe(404);
    }
  });
});
