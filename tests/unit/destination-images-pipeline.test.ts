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
    const [report] = await runImport({ stops: [SOSSUSVLEI], admin, commons: fakeCommons([...valid, ...noise]), makeVariants });
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
    await runImport({ stops: [SOSSUSVLEI], admin, commons: fakeCommons(valid), makeVariants });
    const before = { rows: rows.length, objects: objects.size };
    const commons = fakeCommons(valid);
    const [report] = await runImport({ stops: [SOSSUSVLEI], admin, commons, makeVariants });
    expect(report!.status).toBe('complete_skipped');
    expect(commons.search).not.toHaveBeenCalled();
    expect(commons.download).not.toHaveBeenCalled();
    expect({ rows: rows.length, objects: objects.size }).toEqual(before);
  });

  it('refills only what is missing and never reuses a stored file', async () => {
    const { admin, rows } = fakeAdmin();
    await runImport({ stops: [SOSSUSVLEI], admin, commons: fakeCommons(valid), makeVariants });
    rows.splice(0, rows.length, ...rows.filter((r) => r.role !== 'gallery')); // someone removed the gallery
    const commons = fakeCommons([...valid, file(7), file(8), file(9)]);
    const [report] = await runImport({ stops: [SOSSUSVLEI], admin, commons, makeVariants });
    expect(report!.selected.map((s) => s.role)).toEqual(['gallery', 'gallery', 'gallery']);
    expect(report!.rejected.already_in_library).toBeGreaterThanOrEqual(2);
    const sources = rows.map((r) => r.source_id);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it('does not write in a dry run and survives a failing search', async () => {
    const { admin, rows, objects } = fakeAdmin();
    const commons = fakeCommons(valid);
    commons.search.mockRejectedValueOnce(new Error('HTTP 429'));
    const [report] = await runImport({ stops: [SOSSUSVLEI], admin, commons, makeVariants, dryRun: true });
    expect(report!.rejected.search_error).toBe(1);
    expect(report!.selected.length).toBe(5);
    expect(report!.selected.every((s) => s.stored === false)).toBe(true);
    expect(rows).toHaveLength(0);
    expect(objects.size).toBe(0);
  });

  it('leaves roles empty instead of forcing doubtful photos, and reports what is missing', async () => {
    const { admin, rows } = fakeAdmin();
    const [report] = await runImport({ stops: [SOSSUSVLEI], admin, commons: fakeCommons([file(1), file(2, { width: 800, height: 600 })]), makeVariants });
    expect(rows.length).toBeLessThan(5);
    expect(report!.status).toBe('partial');
    expect(report!.missing.length).toBeGreaterThan(0);
  });

  it('marks photos without coordinates as unverified regional motifs', async () => {
    const { admin, rows } = fakeAdmin();
    await runImport({ stops: [SOSSUSVLEI], admin, commons: fakeCommons(valid.map((c) => ({ ...c, coords: null }))), makeVariants });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.location_verified === false && r.location_basis === 'title_or_category_names_place')).toBe(true);
    expect(String(rows[0]!.review_note)).toMatch(/Regionsmotiv/);
  });
});
