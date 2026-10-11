import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { bootstrapOwner, login, newUserContext, PASSWORD, stack, uniq } from './stack';

test.describe.configure({ mode: 'serial' });

// A place that exists only in this test, so the real library of the local stack is not involved.
const tag = uniq();
const place = `Testvlei ${tag}`;
const key = `testvlei-${tag}`;
const email = `bilder.${tag}@example.test`;
const BUCKET = 'destination-media';
const hash = (n: number) => `${tag}${String(n).padStart(6, '0')}`.slice(0, 12).padEnd(12, '0');
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(stack.url, stack.serviceKey, opts);

const uploaded: string[] = [];
async function seed(role: 'hero' | 'card' | 'gallery', n: number, variants: Record<string, [number, number]>, verified: boolean) {
  const paths: Record<string, string> = {};
  for (const [name, [w, h]] of Object.entries(variants)) {
    const buffer = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 60 + n * 30, g: 120, b: 150 } } }).webp().toBuffer();
    const path = `${key}/${hash(n)}-${role}-${name}.webp`;
    const { error } = await service.storage.from(BUCKET).upload(path, buffer, { contentType: 'image/webp', upsert: true });
    if (error) throw new Error(error.message);
    uploaded.push(path);
    paths[name] = path;
  }
  const { error } = await service.from('destination_images').insert({
    place_key: key, place_label: place, country: 'Namibia', latitude: -24.5, longitude: 15.8, radius_km: 30, role, variants: paths, width: 1920, height: 1080,
    alt_text: `${place}: Beispielfoto ${role} ${n}`, source_provider: 'wikimedia_commons', source_id: `File:${place} ${role} ${n}.jpg`, source_url: `https://commons.wikimedia.org/wiki/File:Testvlei_${n}.jpg`,
    photographer: `Fotograf ${n}`, license_type: 'CC BY-SA 4.0', attribution_text: `Fotograf ${n} / Wikimedia Commons / CC BY-SA 4.0`, license_verified: true, location_verified: verified,
    location_basis: verified ? 'file_coordinates_within_30km' : 'title_or_category_names_place', content_hash: `${hash(n)}${role}`, approved: true,
  });
  if (error) throw new Error(error.message);
}

test.beforeAll(async () => {
  bootstrapOwner(email, `Bilder-Familie ${tag}`);
  const owner = createClient(stack.url, stack.anonKey, opts);
  const signedIn = await owner.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw new Error(signedIn.error.message);
  const { data: member } = await owner.from('family_members').select('family_id').limit(1).single();
  const { data: trip, error } = await owner.from('trips').insert({ family_id: member!.family_id, title: 'Bilder-Test', start_date: '2027-03-01', end_date: '2027-03-10', countries: ['Namibia'] }).select('id').single();
  if (error) throw new Error(error.message);
  const stop = await owner.from('trip_stops').insert({ trip_id: trip!.id, title: place, country: 'Namibia', latitude: -24.5, longitude: 15.8, arrive_at: '2027-03-01', depart_at: '2027-03-04', sequence: 1, summary: 'Teststation' });
  if (stop.error) throw new Error(stop.error.message);
  await seed('hero', 1, { desktop: [1920, 1080], tablet: [1200, 800], mobile: [800, 700] }, true);
  await seed('card', 2, { card: [800, 600], thumb: [320, 240] }, false); // location not proven: must be labelled as regional motif
  await seed('gallery', 3, { full: [1200, 800], thumb: [320, 240] }, true);
  await seed('gallery', 4, { full: [1200, 800], thumb: [320, 240] }, true);
});

test.afterAll(async () => {
  if (uploaded.length) await service.storage.from(BUCKET).remove(uploaded);
  await service.from('destination_images').delete().eq('place_key', key);
});

const loaded = (page: import('@playwright/test').Page, selector: string) => page.locator(selector).first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);

test('Dashboard, Route und Station zeigen die Bibliotheksfotos mit Bildnachweis und kennzeichnen Regionsmotive', async ({ browser }) => {
  const { context, page } = await newUserContext(browser);
  await login(page, email);
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });

  const hero = page.getByTestId('destination-hero');
  await expect(hero).toHaveAttribute('data-image', 'photo', { timeout: 30_000 });
  await expect.poll(() => loaded(page, '[data-testid=destination-hero] img')).toBe(true);
  await expect(hero.locator('img')).toHaveAttribute('src', new RegExp(`^/media/destination/${key}/`)); // same origin, never a storage or third-party URL
  await expect(hero.getByTestId('image-attribution')).toContainText('Fotograf 1 / Wikimedia Commons / CC BY-SA 4.0');
  await expect(hero.getByRole('link', { name: /Quelle zum Foto/ })).toHaveAttribute('href', /commons\.wikimedia\.org/);
  await expect(hero.getByTestId('image-attribution')).not.toContainText('Regionsmotiv'); // location proven
  const axe = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(await axe()).toEqual([]); // photo hero with overlay, alt texts and credit links

  await page.goto('/route');
  const cover = page.getByTestId('stop-cover').first();
  await expect(cover).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => loaded(page, '[data-testid=stop-cover] img')).toBe(true);
  await expect(cover).toContainText('Regionsmotiv'); // the card photo has no location proof

  await page.locator('a[href^="/route/"]').filter({ hasText: place }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: place })).toBeVisible();
  await expect(page.getByTestId('destination-hero')).toHaveAttribute('data-image', 'photo');
  const gallery = page.getByTestId('stop-gallery');
  await expect(gallery.locator('img')).toHaveCount(2);
  await expect(gallery.getByTestId('image-attribution')).toHaveCount(2);
  await expect.poll(() => loaded(page, '[data-testid=stop-gallery] img')).toBe(true);
  expect(await axe()).toEqual([]); // station page with hero, gallery and credits
  await context.close();
});

test('ohne freigegebene Fotos bleibt die Illustration, und die Fotos sind offline weiter da', async ({ browser }) => {
  const { context, page } = await newUserContext(browser);
  await login(page, email);
  await expect(page.getByTestId('destination-hero')).toHaveAttribute('data-image', 'photo', { timeout: 30_000 });
  // let the service worker take over and the background prefetch fill the image cache
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.goto('/route');
  await expect.poll(() => loaded(page, '[data-testid=stop-cover] img')).toBe(true);
  await page.waitForTimeout(4000);
  await page.reload(); // now controlled by the service worker
  await expect.poll(() => loaded(page, '[data-testid=stop-cover] img')).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('stop-cover').first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => loaded(page, '[data-testid=stop-cover] img'), { timeout: 20_000 }).toBe(true);
  await context.setOffline(false);

  // withdrawing the approval removes the photo again (illustration fallback), without any code change
  await service.from('destination_images').update({ approved: false, license_verified: true }).eq('place_key', key);
  await page.evaluate(() => localStorage.removeItem('nb-destination-library-v1'));
  await page.reload();
  await expect(page.getByTestId('stop-cover')).toHaveCount(0, { timeout: 30_000 });
  await context.close();
});
