import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { bootstrapOwner, login, newUserContext, PASSWORD, stack, uniq } from './stack';

test.describe.configure({ mode: 'serial' });

const tag = uniq();
const email = `plan.${tag}@example.test`;
const stopName = `Teststation ${tag}`;
const taskTitle = `Mietwagen bezahlen ${tag}`;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(stack.url, stack.serviceKey, opts);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let userId = '';

const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

test.beforeAll(async () => {
  bootstrapOwner(email, `Plan-Familie ${tag}`);
  const owner = createClient(stack.url, stack.anonKey, opts);
  const signedIn = await owner.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw new Error(signedIn.error.message);
  userId = signedIn.data.user!.id;
  const { data: member } = await owner.from('family_members').select('family_id').limit(1).single();
  const { data: trip, error } = await owner.from('trips').insert({ family_id: member!.family_id, title: 'Plan-Test', start_date: '2027-03-01', end_date: '2027-03-10', countries: ['Namibia', 'Botswana'] }).select('id').single();
  if (error) throw new Error(error.message);
  const stops = [
    { title: stopName, country: 'Namibia', latitude: -22.56, longitude: 17.07, arrive_at: '2027-03-01', depart_at: '2027-03-04', sequence: 1, summary: 'Teststation', highlights: ['Sonnenuntergang'] },
    { title: 'Anreise: Flug Frankfurt – Windhoek', country: 'Deutschland', latitude: 50.03, longitude: 8.57, arrive_at: '2027-03-01', depart_at: '2027-03-01', sequence: 2, summary: '' },
  ];
  for (const stop of stops) {
    const inserted = await owner.from('trip_stops').insert({ trip_id: trip!.id, ...stop });
    if (inserted.error) throw new Error(inserted.error.message);
  }
  const task = await owner.from('action_items').insert({ family_id: member!.family_id, trip_id: trip!.id, title: taskTitle, due_at: yesterday(), priority: 'normal' });
  if (task.error) throw new Error(task.error.message);
});

test('Dashboard: ein Hauptmenü, illustrierte Karte ohne Anreise, Aufgaben mit Dringlichkeit, Hero mit Reisedaten', async ({ browser }) => {
  const { context, page } = await newUserContext(browser);
  await page.setViewportSize({ width: 1536, height: 960 });
  await login(page, email);
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });

  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toHaveCount(1); // no second navigation in the header
  const order = await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link').allInnerTexts();
  expect(order).toEqual(['Dashboard', 'Reiseplan', 'Karte', 'Unterkünfte', 'Buchungen', 'Tagebuch', 'Galerie', 'Safari-Tracker', 'Ausgaben', 'Sicherheit', 'Familie', 'Reiseführer', 'Offline & Sync', 'Einstellungen']);

  const hero = page.getByTestId('destination-hero');
  await expect(hero).toContainText('NAMIBIA & BOTSWANA');
  await expect(hero).toContainText(/01\.\s*Mär\S*\s*–\s*10\.\s*Mär\S*\s*2027/i);
  await expect(hero.getByRole('heading', { level: 1 })).toContainText('Willkommen zu');
  await expect(hero).toContainText('bis zum Abflug');

  const map = page.getByTestId('illustrated-map');
  await expect(map).toBeVisible({ timeout: 30_000 });
  await expect(map.getByRole('link', { name: new RegExp(`Station 1: ${stopName}`) })).toBeVisible();
  await expect(map.getByRole('link', { name: /Flug Frankfurt/ })).toHaveCount(0); // the departure airport is not on the regional map
  await expect(page.getByTestId('route-preview')).not.toContainText('Schematische Karte');

  const tasks = page.getByTestId('task-summary');
  await expect(tasks).toContainText(taskTitle);
  await expect(tasks.getByText('dringend')).toHaveCount(1); // overdue task: accessible urgency
  await expect(tasks.getByText('Nicht zugewiesen')).toHaveCount(1); // unassigned and urgent: shown
  await expect(page.getByTestId('booking-check')).toContainText('geklärt');

  await expect(page).toHaveTitle(/Namibia/);
  const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(violations).toEqual([]);
  await context.close();
});

test('Benachrichtigungen: Glocke zeigt die überfällige Aufgabe und "Alle gelesen" leert den Zähler', async ({ browser }) => {
  const { context, page } = await newUserContext(browser);
  await login(page, email);
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  const bell = page.getByTestId('notification-bell');
  await expect(bell).toHaveAccessibleName(/1 ungelesen/, { timeout: 30_000 });
  await bell.click();
  const list = page.getByTestId('notification-list');
  await expect(list).toContainText(taskTitle);
  await expect(list).toContainText('überfällig');
  await page.getByRole('button', { name: 'Alle gelesen' }).click();
  await expect(bell).toHaveAccessibleName('Benachrichtigungen');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('notification-bell')).toHaveAccessibleName('Benachrichtigungen'); // remembered on the device
  await context.close();
});

test('Suche in der Kopfzeile führt zur Archivsuche mit Treffer bei Stationen und Aufgaben-Orten', async ({ browser }) => {
  const { context, page } = await newUserContext(browser);
  await page.setViewportSize({ width: 1536, height: 960 });
  await login(page, email);
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  await page.getByRole('search').getByLabel('Suche').fill(`Teststation ${tag}`);
  await page.getByRole('search').getByLabel('Suche').press('Enter');
  await expect(page).toHaveURL(new RegExp(`/archive\\?q=Teststation`));
  await expect(page.getByLabel('Volltextsuche')).toHaveValue(`Teststation ${tag}`);
  await expect(page.getByTestId('hit-count')).toHaveText('1 Treffer');
  await context.close();
});

test('Profilfoto: wählen, im Profilmenü sehen, auf dem Server gespeichert, entfernen', async ({ browser }) => {
  const { context, page } = await newUserContext(browser);
  await page.setViewportSize({ width: 1536, height: 960 });
  await login(page, email);
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  await page.goto('/settings');
  await page.getByLabel('Profilfoto auswählen').setInputFiles({ name: 'ich.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('status').filter({ hasText: 'Profilfoto gespeichert' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('account-menu').locator('img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  await expect.poll(async () => (await service.from('profiles').select('avatar_data').eq('user_id', userId).single()).data?.avatar_data ?? null, { timeout: 30_000 }).toMatch(/^data:image\/jpeg;base64,/);
  await page.getByRole('button', { name: 'Entfernen' }).click();
  await expect(page.getByTestId('account-menu').locator('img')).toHaveCount(0);
  await expect.poll(async () => (await service.from('profiles').select('avatar_data').eq('user_id', userId).single()).data?.avatar_data ?? null, { timeout: 30_000 }).toBeNull();
  await context.close();
});

test('Karte und Reiseplan sind getrennte Seiten, Mitreisen und Erinnerungen bleiben über Familie und Galerie erreichbar', async ({ browser }) => {
  const { context, page } = await newUserContext(browser);
  await page.setViewportSize({ width: 1536, height: 960 });
  await login(page, email);
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  await page.goto('/map');
  await expect(page.getByRole('heading', { level: 1, name: 'Karte' })).toBeVisible();
  await page.goto('/route');
  await expect(page.getByRole('heading', { level: 1, name: 'Reiseplan' })).toBeVisible();
  await page.goto('/family');
  await page.getByRole('link', { name: 'Privaten Link verwalten' }).click();
  await expect(page).toHaveURL(/\/followers/);
  await page.goto('/gallery');
  await page.getByRole('link', { name: 'Erinnerungen durchsuchen und exportieren' }).click();
  await expect(page).toHaveURL(/\/archive/);
  await context.close();
});
