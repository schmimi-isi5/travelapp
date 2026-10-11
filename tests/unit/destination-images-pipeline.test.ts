import { describe, expect, it, vi } from 'vitest';
import { runImport } from '../../scripts/destination-images/pipeline.mjs';

type Row = Record<string, unknown>;

/** In-memory stand-in for the service-role Supabase client: table destination_images and the storage bucket. */
function fakeAdmin() {
  const rows: Row[] = [];
  const objects = new Map<string, Buffer>();
  const admin = {
    from: () => ({
      select: () => ({ eq: (_column: string, key: string) => Promise.resolve({ data: rows.filter((r) => r.place_key === key), error: null }) }),
      upsert: (row: Row) => {
        const duplicate = rows.some((r) => r.place_key === row.place_key && r.role === row.role && r.content_hash === row.content_hash);
        if (!duplicate) rows.push(row);
        return Promise.resolve({ error: null });
      },
    }),
    storage: {
      from: () => ({
        upload: (path: string, buffer: Buffer) => {
          if (objects.has(path)) return Promise.resolve({ error: { message: 'The resource already exists' } });
          objects.set(path, buffer);
          return Promise.resolve({ error: null });
        },
      }),
    },
  };
  return { admin, rows, objects };
}

const SOSSUSVLEI = { id: 'stop-1', title: 'Namib Wüste / Sossusvlei', country: 'Namibia', latitude: -24.48, longitude: 15.8 };

interface FakeFile { id: string; title: string; width: number; height: number; thumbUrl: string; pageUrl: string; categories: string; description: string; coords: { lat: number; lon: number } | null; meta: Record<string, { value: string }> }

const file = (n: number, over: Partial<FakeFile> = {}, metaOver: Record<string, string> = {}): FakeFile => ({
  id: String(n),
  title: `File:Sossusvlei dunes ${n}.jpg`,
  width: 4000,
  height: 2400,
  thumbUrl: `https://upload.example/${n}.jpg`,
  pageUrl: `https://commons.example/wiki/File:Sossusvlei_dunes_${n}.jpg`,
  categories: 'Sossusvlei|Namib desert',
  description: `Dünen ${n}`,
  coords: { lat: -24.75, lon: 15.29 },
  meta: { LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' }, Artist: { value: `Fotograf ${n}` }, ...Object.fromEntries(Object.entries(metaOver).map(([k, v]) => [k, { value: v }])) },
  ...over,
});

function fakeCommons(candidates: FakeFile[]) {
  return {
    search: vi.fn(async () => candidates),
    download: vi.fn(async (url: string) => Buffer.from(`bytes of ${url}`)),
  };
}
const makeVariants = vi.fn(async (_bytes: Buffer, plan: { key: string; width: number }[]) => plan.map((p) => ({ key: p.key, buffer: Buffer.from(`webp-${p.key}`), width: p.width, height: Math.round(p.width * 0.56) })));

const valid = [1, 2, 3, 4, 5, 6].map((n) => file(n));
const noise = [
  file(10, {}, { LicenseShortName: 'CC BY-NC 4.0' }), // licence not allowed
  file(11, { coords: { lat: -22.56, lon: 17.07 } }), // another place (Windhoek)
  file(12, { categories: 'Portraits of women' }), // people
  file(13, { title: 'File:Map of Sossusvlei.jpg' }), // map
  file(14, {}, { Artist: '' }), // author missing for an attribution licence
  file(15, { coords: null, title: 'File:Red dunes.jpg', categories: 'Sahara' }), // no coordinates and does not name the place
];

describe('destination image import pipeline', () => {
  it('stores only licensed, located, suitable photos: hero, card and three gallery images with credits and variants', async () => {
    const { admin, rows, objects } = fakeAdmin();
    const [report] = await runImport({ stops: [SOSSUSVLEI], admin, commons: fakeCommons([...valid, ...noise]), makeVariants, galleryTarget: 3 });
    expect(report).toMatchObject({ place: 'sossusvlei', status: 'complete', missing: [] });
    expect(rows.map((r) => r.role).sort()).toEqual(['card', 'gallery', 'gallery', 'gallery', 'hero']);
    for (const row of rows) {
      expect(row).toMatchObject({ approved: true, license_verified: true, location_verified: true, source_provider: 'wikimedia_commons', license_type: 'CC BY-SA 4.0', place_key: 'sossusvlei' });
      expect(String(row.attribution_text)).toMatch(/Fotograf \d \/ Wikimedia Commons \/ CC BY-SA 4\.0/);
      expect(String(row.alt_text).length).toBeGreaterThan(0);
    }
    const hero = rows.find((r) => r.role === 'hero')!;
    expect(Object.keys(hero.variants as object).sort()).toEqual(['desktop', 'mobile', 'tablet']);
    expect(objects.size).toBe(3 + 2 + 3 * 2);
    for (const path of objects.keys()) expect(path).toMatch(/^sossusvlei\/[a-f0-9]{12}-(hero|card|gallery)-[a-z]+\.webp$/);
    expect(report!.rejected).toMatchObject({ license_not_allowed: 1, location_mismatch: 1, category_excluded: 1, title_excluded: 1, attribution_author_missing: 1, no_place_evidence: 1 });
    // nothing rejected ended up in the library
    expect(rows.some((r) => /dunes 1[0-5]|Red dunes/.test(String(r.source_id)))).toBe(false);
  });

  it('is idempotent: a second run neither searches, downloads nor writes anything', async () => {
    const { admin, rows, objects } = fakeAdmin();
    await runImport({ stops: [SOSSUSVLEI], admin, commons: fakeCommons(valid), makeVariants, galleryTarget: 3 });
    const before = { rows: rows.length, objects: objects.size };
    const commons = fakeCommons(valid);
    const [report] = await runImport({ stops: [SOSSUSVLEI], admin, commons, makeVariants, galleryTarget: 3 });
    expect(report!.status).toBe('complete_skipped');
    expect(commons.search).not.toHaveBeenCalled();
    expect(commons.download).not.toHaveBeenCalled();
    expect({ rows: rows.length, objects: objects.size }).toEqual(before);
  });

  it('refills only what is missing and never reuses a stored file', async () => {
    const { admin, rows } = fakeAdmin();
    await runImport({ stops: [SOSSUSVLEI], admin, commons: fakeCommons(valid), makeVariants, galleryTarget: 3 });
    rows.splice(0, rows.length, ...rows.filter((r) => r.role !== 'gallery')); // someone removed the gallery
    const commons = fakeCommons([...valid, file(7), file(8), file(9)]);
    const [report] = await runImport({ stops: [SOSSUSVLEI], admin, commons, makeVariants, galleryTarget: 3 });
    expect(report!.selected.map((s) => s.role)).toEqual(['gallery', 'gallery', 'gallery']);
    expect(report!.rejected.already_in_library).toBeGreaterThanOrEqual(2);
    const sources = rows.map((r) => r.source_id);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it('does not write in a dry run and survives a failing search', async () => {
    const { admin, rows, objects } = fakeAdmin();
    const commons = fakeCommons(valid);
    commons.search.mockRejectedValueOnce(new Error('HTTP 429'));
    const [report] = await runImport({ stops: [SOSSUSVLEI], admin, commons, makeVariants, dryRun: true, galleryTarget: 3 });
    expect(report!.rejected.search_error).toBe(1);
    expect(report!.selected.length).toBe(5);
    expect(report!.selected.every((s) => s.stored === false)).toBe(true);
    expect(rows).toHaveLength(0);
    expect(objects.size).toBe(0);
  });

  it('leaves roles empty instead of forcing doubtful photos, and reports what is missing', async () => {
    const { admin, rows } = fakeAdmin();
    const [report] = await runImport({ stops: [SOSSUSVLEI], admin, commons: fakeCommons([file(1), file(2, { width: 800, height: 600 })]), makeVariants, galleryTarget: 3 });
    expect(rows.length).toBeLessThan(5);
    expect(report!.status).toBe('partial');
    expect(report!.missing.length).toBeGreaterThan(0);
  });

  it('marks photos without coordinates as unverified regional motifs', async () => {
    const { admin, rows } = fakeAdmin();
    await runImport({ stops: [SOSSUSVLEI], admin, commons: fakeCommons(valid.map((c) => ({ ...c, coords: null }))), makeVariants, galleryTarget: 3 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.location_verified === false && r.location_basis === 'title_or_category_names_place')).toBe(true);
    expect(String(rows[0]!.review_note)).toMatch(/Regionsmotiv/);
  });

  it('adds stock photos from Pixabay as regional motifs with their own licence, up to ten gallery images', async () => {
    const { admin, rows } = fakeAdmin();
    const stock = (n: number, tags = 'sossusvlei, namibia, dune') => ({
      id: `pixabay-${n}`, title: `Pixabay ${n} ${tags}.jpg`, width: 1280, height: 853, thumbUrl: `https://cdn.pixabay.example/${n}.jpg`, pageUrl: `https://pixabay.example/photos/${n}`,
      categories: tags.replace(/, /g, '|'), description: '', coords: null, meta: {}, provider: 'pixabay', providerLabel: 'Pixabay', popularity: 2,
      licence: { ok: true, type: 'Pixabay Content License', licenseUrl: 'https://pixabay.com/service/license-summary/', photographer: `Autor ${n}`, attributionRequired: false },
    });
    const pixabay = fakeCommons([...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => stock(n) as unknown as FakeFile), stock(20, 'safari, africa, lion') as unknown as FakeFile]);
    const [report] = await runImport({ stops: [SOSSUSVLEI], admin, commons: fakeCommons([]), pixabay, makeVariants });
    const gallery = rows.filter((r) => r.role === 'gallery');
    expect(gallery).toHaveLength(10);
    expect(rows.filter((r) => r.role === 'hero')).toHaveLength(0); // 1280 px is too small for a hero
    expect(gallery.every((r) => r.source_provider === 'pixabay' && r.location_verified === false && r.attribution_required === false)).toBe(true);
    expect(String(gallery[0]!.attribution_text)).toMatch(/Autor \d+ \/ Pixabay \/ Pixabay Content License/);
    expect(report!.rejected.no_place_evidence).toBe(1); // no place or country in the tags: 'safari, africa, lion'
    expect(pixabay.download).toHaveBeenCalledWith(expect.stringContaining('cdn.pixabay.example'));
  });

  it('accepts country-tagged stock photos only when the motif fits the place (no sea in the bush, no dunes at the river)', async () => {
    const { admin, rows } = fakeAdmin();
    const stock = (n: number, tags: string) => ({
      id: `pixabay-${n}`, title: `Pixabay ${n} ${tags}.jpg`, width: 1280, height: 853, thumbUrl: `https://cdn.pixabay.example/${n}.jpg`, pageUrl: `https://pixabay.example/photos/${n}`,
      categories: tags.replace(/, /g, '|'), description: '', coords: null, meta: {}, provider: 'pixabay', providerLabel: 'Pixabay', popularity: 0,
      licence: { ok: true, type: 'Pixabay Content License', licenseUrl: 'https://pixabay.com/service/license-summary/', photographer: 'Autor', attributionRequired: false },
    }) as unknown as FakeFile;
    const etosha = { id: 's', title: 'Etosha Nationalpark', country: 'Namibia', latitude: -18.8, longitude: 16.9 };
    const pixabay = fakeCommons([stock(1, 'namibia, elephant, savannah'), stock(2, 'namibia, beach, ocean'), stock(3, 'namibia, dune, desert'), stock(4, 'namibia, hotel, building')]);
    const dbg = await runImport({ stops: [etosha], admin, commons: fakeCommons([]), pixabay, makeVariants, log: (l, m) => console.log(l, m) }); console.log(JSON.stringify(dbg));
    expect(rows.map((r) => r.source_id)).toEqual([expect.stringContaining('elephant')]);
    expect(rows[0]).toMatchObject({ location_verified: false, location_basis: 'country_tag_plausible_motif' });
    expect(String(rows[0]!.review_note)).toMatch(/Regionsmotiv/);
  });
});
