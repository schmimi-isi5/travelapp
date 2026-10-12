import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { bootstrapOwner, login, newUserContext, PASSWORD, stack, uniq } from './stack';

test.describe.configure({ mode: 'serial' });

const tag = uniq();
const email = `tipps.${tag}@example.test`;
const campStop = `Campstation ${tag}`;
const lodgeStop = `Lodgestation ${tag}`;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

// Cold nights, hot days, strong UV and a high rain risk, the same for both stations: only the accommodation differs.
const iso = (offset: number) => new Date(Date.now() + 2 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const weatherBody = () => ({
  days: [0, 1, 2].map((i) => ({ date: iso(2 + i), source: i === 2 ? 'climate' : 'forecast', tmax: 36, tmin: 4, rainMm: 6, rainChance: 60, windMax: 40, uvMax: i === 2 ? null : 9, sunrise: i === 2 ? null : `${iso(2 + i)}T06:20`, sunset: i === 2 ? null : `${iso(2 + i)}T19:05` })),
  fetchedAt: new Date().toISOString(), attribution: 'Wetterdaten: Open-Meteo.com (CC BY 4.0)', climateYears: [2021, 2022, 2023, 2024, 2025],
});

test.beforeAll(async () => {
  bootstrapOwner(email, `Tipps-Familie ${tag}`);
  const owner = createClient(stack.url, stack.anonKey, opts);
  const signedIn = await owner.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw new Error(signedIn.error.message);
  const { data: member } = await owner.from('family_members').select('family_id').limit(1).single();
  const { data: trip, error } = await owner.from('trips').insert({ family_id: member!.family_id, title: 'Tipps-Test', start_date: iso(2), end_date: iso(8), countries: ['Namibia'] }).select('id').single();
  if (error) throw new Error(error.message);
  const stops = await owner.from('trip_stops').insert([
    { trip_id: trip!.id, title: campStop, country: 'Namibia', latitude: -24.5, longitude: 15.8, arrive_at: iso(2), depart_at: iso(4), sequence: 1 },
    { trip_id: trip!.id, title: lodgeStop, country: 'Namibia', latitude: -22.6, longitude: 17.1, arrive_at: iso(4), depart_at: iso(6), sequence: 2 },
  ]).select('id, sequence');
  if (stops.error) throw new Error(stops.error.message);
  const byId = Object.fromEntries(stops.data!.map((s) => [s.sequence, s.id]));
  const stays = await owner.from('stays').insert([
    { trip_id: trip!.id, stop_id: byId[1], name: 'Testplatz Camping', check_in: iso(2), check_out: iso(4), notes: 'Art: Camping. Planpreis (aus der Excel, nicht bestätigt).' },
    { trip_id: trip!.id, stop_id: byId[2], name: 'Testlodge', check_in: iso(4), check_out: iso(6), notes: 'Art: Lodge.' },
  ]);
  if (stays.error) throw new Error(stays.error.message);
});

const stationTip = (page: import('@playwright/test').Page, id: string) => page.locator(`[data-testid=station-tip][data-tip-id="${id}"]`);

test('die Station zeigt Wetter und Empfehlungen, zugeschnitten auf die Unterkunftsart (Camping gegenüber Lodge)', async ({ browser }) => {
  const { context, page } = await newUserContext(browser);
  await page.route('**/api/weather*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(weatherBody()) }));
  await login(page, email);
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });

  // dashboard: short version for the current / next station in the travel region
  await expect(page.getByTestId('dashboard-tips')).toContainText(campStop, { timeout: 30_000 });
  await expect(page.getByTestId('dashboard-tips')).toContainText('Vorhersage');

  await page.goto('/route');
  await page.getByRole('region', { name: 'Stationenliste' }).locator('a[href^="/route/"]').filter({ hasText: campStop }).first().click();
  const card = page.getByTestId('station-recommendations');
  await expect(card).toContainText('deine Unterkunft (Camping)', { timeout: 30_000 });
  await expect(card.getByTestId('weather-days').locator('li')).toHaveCount(3);
  await expect(card.getByTestId('weather-days')).toContainText('4 bis 36 °C');
  await expect(card.getByTestId('weather-days')).toContainText('Vorhersage');
  await expect(card.getByTestId('weather-days')).toContainText('Durchschnitt');
  await expect(card).toContainText('Open-Meteo.com');
  await expect(stationTip(page, 'cold-night')).toContainText('Schlafsack');
  await expect(stationTip(page, 'cold-night').getByTestId('tip-reason')).toContainText('nachts bis 4 °C');
  await expect(stationTip(page, 'heat')).toContainText('Stellplatz mit Schatten');
  await expect(stationTip(page, 'rain')).toContainText('Plane');
  await expect(stationTip(page, 'camping-basics')).toBeVisible();
  await expect(stationTip(page, 'lodge-basics')).toHaveCount(0);
  await expect(card.getByRole('button', { name: /Mit KI auf unsere Reise zuschneiden/ })).toBeVisible();

  // the day briefing uses the same weather: temperature, daylight and no outdated "no service" sentence
  const briefing = page.getByTestId('day-briefing');
  await expect(briefing).toContainText(/\d+ bis \d+ °C/);
  await expect(briefing).toContainText('Sonnenaufgang');
  await expect(briefing).not.toContainText('nicht verfügbar');
  await expect(briefing.getByRole('button', { name: 'Tagesvorschau mit KI' })).toBeVisible();

  // same weather, other accommodation: different advice
  await page.goBack();
  await page.getByRole('region', { name: 'Stationenliste' }).locator('a[href^="/route/"]').filter({ hasText: lodgeStop }).first().click();
  const lodgeCard = page.getByTestId('station-recommendations');
  await expect(lodgeCard).toContainText('deine Unterkunft (Lodge)', { timeout: 30_000 });
  await expect(stationTip(page, 'cold-night')).toContainText('Fleece');
  await expect(stationTip(page, 'cold-night')).not.toContainText('Schlafsack');
  await expect(stationTip(page, 'lodge-basics')).toBeVisible();
  await expect(stationTip(page, 'camping-basics')).toHaveCount(0);

  await expect(page).toHaveTitle(/Namibia/); // the document needs a title (axe: document-title)
  const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(violations).toEqual([]);
  await context.close();
});

test('ohne Netz bleiben Wetter und Empfehlungen vom letzten Abruf erhalten', async ({ browser }) => {
  const { context, page } = await newUserContext(browser);
  await page.route('**/api/weather*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(weatherBody()) }));
  await login(page, email);
  await expect(page.getByTestId('dashboard-tips')).toContainText(campStop, { timeout: 30_000 }); // data loaded
  await page.goto('/route');
  await page.locator('a[href^="/route/"]').filter({ hasText: campStop }).first().click();
  await expect(stationTip(page, 'cold-night')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect(stationTip(page, 'cold-night')).toBeVisible({ timeout: 30_000 });

  await page.unroute('**/api/weather*');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('weather-days').locator('li')).toHaveCount(3, { timeout: 30_000 });
  await expect(stationTip(page, 'cold-night')).toContainText('Schlafsack');
  await expect(page.getByTestId('station-recommendations')).not.toContainText('noch keine Wetterdaten');
  await context.setOffline(false);
  await context.close();
});
