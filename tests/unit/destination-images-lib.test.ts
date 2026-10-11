import { describe, expect, it } from 'vitest';
import { checkLocation, chooseRoles, classifyLicense, fitsRole, haversineKm, highlightQueries, isUsableCandidate, MIN_SCORE, namesPlace, placeFromStop, scoreCandidate, slugify, subjectScore, type Candidate, type Scored } from '../../scripts/destination-images/lib.mjs';
import { placesFromStops } from '../../scripts/destination-images/pipeline.mjs';
import { imagesForStop, placeKeyForStop, srcSetFor, type DestinationImage } from '@/lib/media/places';

const STOPS = [
  { id: 's0', title: 'Anreise: Flug Frankfurt – Windhoek', country: 'Deutschland', latitude: 50.04, longitude: 8.56 },
  { id: 's1', title: 'Windhoek', country: 'Namibia', latitude: -22.56, longitude: 17.07 },
  { id: 's2', title: 'Namib Wüste / Sossusvlei', country: 'Namibia', latitude: -24.48, longitude: 15.8 },
  { id: 's3', title: 'Swakopmund Ocean', country: 'Namibia', latitude: -22.68, longitude: 14.53 },
  { id: 's4', title: 'Erongo Gebirge', country: 'Namibia', latitude: -21.55, longitude: 15.65 },
  { id: 's5', title: 'Erongo (Sasa Safari Camp)', country: 'Namibia', latitude: -21.45, longitude: 15.95 },
  { id: 's6', title: 'Etosha Nationalpark (Süd)', country: 'Namibia', latitude: -19.25, longitude: 15.9 },
  { id: 's7', title: 'Etosha Nationalpark (Ost)', country: 'Namibia', latitude: -18.85, longitude: 17.0 },
  { id: 's8', title: 'Kasane', country: 'Botswana', latitude: -17.79, longitude: 25.15 },
];

const meta = (shortName: string, artist = 'Jane Doe', extra: Record<string, string> = {}) => ({
  LicenseShortName: { value: shortName },
  LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
  Artist: { value: artist },
  ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { value: v }])),
});

describe('places from stops', () => {
  it('derives one place key per sight, merging stops of the same place and dropping generic words', () => {
    const keys = STOPS.map((s) => placeFromStop(s)?.key);
    expect(keys.slice(1)).toEqual(['windhoek', 'sossusvlei', 'swakopmund', 'erongo', 'erongo', 'etosha', 'etosha', 'kasane']);
  });

  it('keeps the app and the import pipeline in step (same key for every stop title)', () => {
    for (const stop of STOPS) expect(placeKeyForStop(stop.title), stop.title).toBe(placeFromStop(stop)?.key);
  });

  it('uses a wide radius for parks and mountains and a small one for towns', () => {
    expect(placeFromStop(STOPS[6]!)?.radiusKm).toBe(100);
    expect(placeFromStop(STOPS[4]!)?.radiusKm).toBe(100);
    expect(placeFromStop(STOPS[1]!)?.radiusKm).toBe(30);
  });

  it('builds search terms from the stop name, never from invented sights', () => {
    const place = placeFromStop(STOPS[2]!)!;
    expect(place.queries[0]).toBe('Sossusvlei Namibia');
    expect(place.queries).toContain('Namib desert Namibia');
    expect(highlightQueries({ title: 'x', country: 'Namibia', highlights: ['Popa Falls (N.P.) + Bwabwata (N.P.)', 'Relaxen am Pool', 'Downtown Windhoek', 'Fahrt nach Swakopmund', 'Programm offen ?'] }, 'Namibia')).toEqual(['Popa Falls Namibia', 'Bwabwata Namibia']);
  });

  it('skips stops outside the travel region (the departure airport) and groups the rest', () => {
    const places = placesFromStops(STOPS);
    expect(places.map((p) => p.key)).toEqual(['windhoek', 'sossusvlei', 'swakopmund', 'erongo', 'etosha', 'kasane']);
    expect(places.find((p) => p.key === 'etosha')?.stopIds).toEqual(['s6', 's7']);
    expect(slugify('Würzburg Straße')).toBe('wurzburg-strasse');
  });
});

describe('licence gate', () => {
  it('accepts free licences with a known author and builds the credit data', () => {
    expect(classifyLicense(meta('CC BY-SA 4.0', '<a href="x">Diego Delso</a>'))).toMatchObject({ ok: true, type: 'CC BY-SA 4.0', photographer: 'Diego Delso', attributionRequired: true });
    expect(classifyLicense(meta('CC BY 3.0 de'))).toMatchObject({ ok: true });
    expect(classifyLicense(meta('CC0', ''))).toMatchObject({ ok: true, attributionRequired: false });
    expect(classifyLicense(meta('Public domain', ''))).toMatchObject({ ok: true, attributionRequired: false });
  });

  it('rejects non-commercial, no-derivatives, unknown and copyrighted licences', () => {
    for (const name of ['CC BY-NC 4.0', 'CC BY-NC-SA 3.0', 'CC BY-ND 2.0', 'GFDL', 'Fair use', 'Copyrighted free use', 'All rights reserved', '']) expect(classifyLicense(meta(name)).ok, name).toBe(false);
    expect(classifyLicense(meta('Some custom licence'))).toMatchObject({ ok: false, reason: expect.stringContaining('license_not_recognised') });
  });

  it('does not rely on the licence name alone: author and restrictions are checked', () => {
    expect(classifyLicense(meta('CC BY-SA 4.0', ''))).toEqual({ ok: false, reason: 'attribution_author_missing' });
    expect(classifyLicense(meta('CC BY-SA 4.0', 'Unknown'))).toEqual({ ok: false, reason: 'attribution_author_missing' });
    expect(classifyLicense(meta('CC BY-SA 4.0', 'Jane', { Restrictions: 'trademarked' }))).toEqual({ ok: false, reason: 'file_has_restrictions' });
  });
});

describe('location evidence', () => {
  const place = placeFromStop(STOPS[2]!)!; // Sossusvlei, radius 30 km
  it('verifies only file coordinates inside the radius; far coordinates are a mismatch; no coordinates prove nothing', () => {
    expect(checkLocation(place, { lat: -24.75, lon: 15.29 })).toMatchObject({ verified: true });
    expect(checkLocation(place, { lat: -22.56, lon: 17.07 })).toMatchObject({ verified: false, basis: 'file_coordinates_too_far' });
    expect(checkLocation(place, null)).toEqual({ verified: false, basis: 'none', distanceKm: null });
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.2, 0);
  });

  it('lets an unlocated file serve as regional motif only if its title or categories name the place', () => {
    expect(namesPlace(place, { title: 'File:Sossusvlei sand dunes.jpg' })).toBe(true);
    expect(namesPlace(place, { title: 'File:Red dunes.jpg', categories: 'Dunes of Sossusvlei' })).toBe(true);
    expect(namesPlace(place, { title: 'File:Red dunes.jpg', categories: 'Sahara' })).toBe(false);
  });
});

describe('candidate filtering and ranking', () => {
  it('drops maps, logos, people categories and unsupported formats', () => {
    expect(isUsableCandidate({ title: 'File:Map of Namibia.jpg' }).ok).toBe(false);
    expect(isUsableCandidate({ title: 'File:Dune.jpg', categories: 'Portraits of women|Namibia' }).ok).toBe(false);
    expect(isUsableCandidate({ title: 'File:Dune.svg' }).ok).toBe(false);
    expect(isUsableCandidate({ title: 'File:Dune.jpg', categories: 'Namib desert' }).ok).toBe(true);
  });

  it('checks size and aspect ratio per role', () => {
    expect(fitsRole('hero', 3000, 1800)).toBe(true);
    expect(fitsRole('hero', 1500, 1000)).toBe(false);
    expect(fitsRole('hero', 2400, 2400)).toBe(false);
    expect(fitsRole('gallery', 1200, 1200)).toBe(true);
  });

  it('prefers landscapes and big wildlife over buildings, close-ups and minerals', () => {
    expect(subjectScore('hero', 'File:Red dunes at sunrise.jpg')).toBeGreaterThan(subjectScore('hero', 'File:Rundu airport.jpg'));
    expect(subjectScore('hero', 'File:Quartz crystal from Erongo.jpg')).toBeLessThan(-20);
    expect(subjectScore('hero', 'File:Lilac-breasted roller (Coracias caudatus).jpg')).toBeLessThan(subjectScore('hero', 'File:Elephants in Chobe.jpg'));
  });

  const base: Candidate = { id: '1', title: 'File:Dunes at sunrise.jpg', width: 4000, height: 2400 };
  it('ranks verified location above unverified and penalises reuse across places', () => {
    const verified = scoreCandidate('hero', base, { verified: true, basis: 'x', distanceKm: 3 });
    const unverified = scoreCandidate('hero', base, { verified: false, basis: 'title', distanceKm: null });
    expect(verified).toBeGreaterThan(unverified);
    expect(scoreCandidate('hero', base, { verified: true, basis: 'x', distanceKm: 3 }, { reused: true })).toBe(verified - 25);
  });

  const scored = (id: string, title: string, width: number, height: number, hero: number, card = hero, gallery = hero): Scored => ({ id, title, width, height, scores: { hero, card, gallery } });
  it('fills roles best-first, never uses a file twice and leaves a role empty when nothing reaches the minimum score', () => {
    const picks = chooseRoles([scored('a', 'a', 4000, 2400, 90), scored('b', 'b', 3000, 2000, 80), scored('c', 'c', 2000, 1500, 70), scored('d', 'd', 1300, 1000, 60)], { hero: 1, card: 1, gallery: 3 });
    expect(picks.map((p) => `${p.role}:${p.item.id}`)).toEqual(['hero:a', 'card:b', 'gallery:c', 'gallery:d']);
    expect(chooseRoles([scored('z', 'z', 4000, 2400, MIN_SCORE.hero - 1, MIN_SCORE.card - 1, MIN_SCORE.gallery - 1)])).toEqual([]);
    expect(chooseRoles([scored('a', 'a', 4000, 2400, 90)], { hero: 0, card: 0, gallery: 0 })).toEqual([]);
  });
});

describe('library lookup in the app', () => {
  const image = (over: Partial<DestinationImage>): DestinationImage => ({
    id: 'i', place_key: 'sossusvlei', place_label: 'Sossusvlei', country: 'Namibia', latitude: -24.48, longitude: 15.8, radius_km: 30, role: 'hero', variants: { desktop: 'sossusvlei/abc123def456-hero-desktop.webp', mobile: 'sossusvlei/abc123def456-hero-mobile.webp' }, width: 1920, height: 1080, alt_text: 'Dünen', source_provider: 'wikimedia_commons', source_url: 'https://commons.wikimedia.org/wiki/File:x.jpg', photographer: 'A', license_type: 'CC BY-SA 4.0', license_url: null, attribution_text: 'A / Wikimedia Commons / CC BY-SA 4.0', location_verified: true, ...over,
  });
  const library = [image({ id: 'h' }), image({ id: 'c', role: 'card' }), image({ id: 'g1', role: 'gallery' }), image({ id: 'x', place_key: 'etosha', place_label: 'Etosha', latitude: -19.2, longitude: 15.9, radius_km: 100 })];

  it('matches by place key, then by the nearest place whose radius covers the stop, and otherwise shows nothing', () => {
    expect(imagesForStop({ title: 'Namib Wüste / Sossusvlei', latitude: null, longitude: null }, library).hero?.id).toBe('h');
    const near = imagesForStop({ title: 'Sesriem Camp', latitude: -24.5, longitude: 15.8 }, library);
    expect([near.hero?.id, near.card?.id, near.gallery.map((g) => g.id)]).toEqual(['h', 'c', ['g1']]);
    expect(imagesForStop({ title: 'Somewhere', latitude: -10, longitude: 30 }, library)).toEqual({ hero: null, card: null, gallery: [] });
    expect(imagesForStop({ title: 'Windhoek', latitude: null, longitude: null }, [])).toEqual({ hero: null, card: null, gallery: [] });
  });

  it('prefers a photo with a proven location over a regional motif', () => {
    const picked = imagesForStop({ title: 'Sossusvlei', latitude: null, longitude: null }, [image({ id: 'motif', location_verified: false }), image({ id: 'proven' })]);
    expect(picked.hero?.id).toBe('proven');
  });

  it('builds a srcset over the variants that exist, widest last, from the app origin only', () => {
    expect(srcSetFor(image({}), ['mobile', 'tablet', 'desktop'])).toBe('/media/destination/sossusvlei/abc123def456-hero-mobile.webp 800w, /media/destination/sossusvlei/abc123def456-hero-desktop.webp 1920w');
  });
});
