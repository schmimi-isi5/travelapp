import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { bootstrapOwner, inviteViaUi, login, newUserContext, PASSWORD, PNG, registerViaInvite, stack, uniq, waitSynced } from './stack';

test.describe.configure({ mode: 'serial' });

const run = uniq();
const ownerEmail = `owner.${run}@example.test`;
const memberEmail = `kind-a.${run}@example.test`;
const childEmail = `kind-b.${run}@example.test`;
const adultEmail = `adult.${run}@example.test`;

let owner: Page;
let ownerCtx: BrowserContext;
let member: Page;
let child: Page;
let adult: Page;

test.beforeAll(async ({ browser }) => {
  bootstrapOwner(ownerEmail, `E2E-Familie ${run}`);
  ({ context: ownerCtx, page: owner } = await newUserContext(browser));
  member = (await newUserContext(browser)).page;
  child = (await newUserContext(browser)).page;
  adult = (await newUserContext(browser)).page;
});

test.afterAll(async () => {
  for (const page of [owner, member, child, adult]) await page?.context().close();
});

test('geschützte Routen leiten ohne Sitzung zur Anmeldung, es gibt keinen Demo-Hinweis', async ({ browser }) => {
  const { context, page } = await newUserContext(browser);
  for (const path of ['/', '/stays', '/journal', '/expenses', '/family']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
  await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
  await expect(page.getByTestId('demo-banner')).toHaveCount(0);
  const health = await (await page.request.get('/api/health?deep=1')).json();
  expect(health).toMatchObject({ status: 'ok', mode: 'supabase', backend: 'ok' });
  const headers = (await page.request.get('/')).headers();
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  await context.close();
});

test('Registrierung ist nur über eine Einladung möglich', async ({ page }) => {
  await page.goto('/invite?token=dies-ist-kein-gueltiger-einladungstoken-1234567890');
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Passwort wiederholen').fill(PASSWORD);
  await page.getByRole('button', { name: 'Registrieren und beitreten' }).click();
  await expect(page.getByText('ungültig, abgelaufen oder bereits verwendet')).toBeVisible();
  const signup = await page.request.post(`${stack.url}/auth/v1/signup`, { headers: { apikey: stack.anonKey }, data: { email: `x.${run}@example.test`, password: PASSWORD } });
  expect(signup.ok()).toBe(false);
});

test('falsches Passwort zeigt eine verständliche Meldung, danach gelingt die Anmeldung und die Einrichtung startet leer', async () => {
  await login(owner, ownerEmail, 'falsches-passwort-123');
  await expect(owner.getByText('E-Mail oder Passwort stimmt nicht.')).toBeVisible();
  await login(owner, ownerEmail);
  await expect(owner).toHaveURL(/\/setup/);
  await owner.getByLabel('Titel der Reise').fill('Namibia & Botswana');
  await owner.getByLabel('Abreisedatum').fill('2026-10-13');
  await owner.getByRole('button', { name: 'Reise anlegen' }).click();
  await expect(owner).toHaveURL(/\/$/);
  await expect(owner.getByTestId('demo-banner')).toHaveCount(0);
  await expect(owner.getByRole('heading', { level: 1 })).toContainText('Reisetermine fehlen');
  await owner.goto('/stays');
  await expect(owner.getByText('Noch keine Unterkünfte')).toBeVisible();
  await owner.goto('/journal');
  await expect(owner.getByText('Noch keine Einträge')).toBeVisible();
  await owner.reload();
  await expect(owner).toHaveURL(/\/journal$/); // session survives a reload
});

test('der Owner legt Station, Unterkunft mit Teilzahlung und Buchung an', async () => {
  await owner.goto('/route');
  await owner.getByRole('button', { name: 'Station hinzufügen' }).first().click();
  const stop = owner.getByRole('dialog', { name: 'Station hinzufügen' });
  await stop.getByLabel('Titel').fill('Windhoek');
  await stop.getByLabel('Breitengrad').fill('-22.56');
  await stop.getByLabel('Längengrad').fill('17.07');
  await stop.getByLabel('Ankunft').fill('2026-10-13');
  await stop.getByLabel('Abreise').fill('2026-10-15');
  await stop.getByRole('button', { name: 'Station speichern' }).click();
  await expect(owner.getByRole('link', { name: /Station 1: Windhoek/ })).toBeVisible();

  await owner.goto('/stays');
  await owner.getByRole('button', { name: 'Unterkunft anlegen' }).first().click();
  const stay = owner.getByRole('dialog', { name: 'Unterkunft anlegen' });
  await stay.getByLabel('Name der Unterkunft').fill('Gästehaus Windhoek');
  await stay.getByLabel('Station').selectOption({ label: 'Windhoek' });
  await stay.getByLabel('Preisstatus').selectOption('confirmed');
  await stay.getByLabel('Bruttobetrag').fill('5.000,00');
  await stay.getByLabel('Währung').selectOption('NAD');
  await stay.getByRole('button', { name: 'Unterkunft anlegen' }).last().click();
  await owner.getByTestId('stay-card').filter({ hasText: 'Gästehaus Windhoek' }).click();
  const money = owner.getByRole('region', { name: 'Zahlungen Gästehaus Windhoek' });
  await money.getByRole('button', { name: 'Zahlung hinzufügen' }).click();
  const pay = owner.getByRole('dialog', { name: 'Zahlung hinzufügen' });
  await pay.getByLabel('Betrag').fill('1.500,00');
  await pay.getByLabel('Verifizierung').selectOption('verified');
  await pay.getByRole('button', { name: 'Zahlung speichern' }).click();
  await expect(money.getByTestId('remaining')).toContainText('3.500,00');
  await waitSynced(owner);

  await owner.goto('/bookings');
  await owner.getByRole('button', { name: 'Buchung anlegen' }).first().click();
  const booking = owner.getByRole('dialog', { name: 'Buchung anlegen' });
  await booking.getByLabel('Titel').fill('Mietwagen 4x4');
  await booking.getByRole('button', { name: 'Buchung anlegen' }).last().click();
  await expect(owner.getByTestId('booking-card').filter({ hasText: 'Mietwagen 4x4' })).toBeVisible();
  await waitSynced(owner);
});

test('Einladung per Link: Mitglied registriert sich, sieht die Reise aber keine Preise', async () => {
  const token = await inviteViaUi(owner, memberEmail, 'member');
  await waitSynced(owner);
  await registerViaInvite(member, token, 'Kind A');
  await member.goto('/route');
  await expect(member.getByRole('link', { name: /Station 1: Windhoek/ })).toBeVisible();
  await member.goto('/stays');
  await expect(member.getByText('Preise, Zahlungen und Belege sind in dieser Rolle ausgeblendet.')).toBeVisible();
  await member.getByTestId('stay-card').filter({ hasText: 'Gästehaus Windhoek' }).click();
  await expect(member.getByRole('region', { name: /Zahlungen/ })).toHaveCount(0);
  await expect(member.getByText('5.000,00')).toHaveCount(0);
  await member.goto('/expenses');
  await expect(member.getByText('Kein Zugriff')).toBeVisible();
  // the token is single-use
  await member.context().clearCookies();
  const reuse = await member.request.post('/api/invitations/register', { data: { token, password: PASSWORD } });
  expect(reuse.status()).toBe(400);
});

test('Tagebuch mit zwei Fotos und Sprachmemo: andere Person sieht es mit signierten Medien-URLs', async () => {
  await member.goto('/journal/new');
  await member.getByLabel('Titel').fill('Erster Tag in Windhoek');
  await member.getByLabel('Was habt ihr erlebt?').fill('Wir sind gelandet.');
  await member.getByLabel('Fotos, Videos oder Audio auswählen').setInputFiles([
    { name: 'a.png', mimeType: 'image/png', buffer: PNG },
    { name: 'b.png', mimeType: 'image/png', buffer: PNG },
    { name: 'memo.webm', mimeType: 'audio/webm', buffer: Buffer.alloc(4096, 1) },
  ]);
  await member.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(member).toHaveURL(/\/journal$/);
  await waitSynced(member);

  await owner.goto('/journal');
  const card = owner.getByTestId('journal-card').filter({ hasText: 'Erster Tag in Windhoek' });
  await expect(card).toBeVisible({ timeout: 30_000 });
  const images = card.locator('img');
  await expect(images).toHaveCount(2);
  await expect.poll(() => images.first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await images.first().getAttribute('src')).toMatch(/\/storage\/v1\/object\/sign\/media\/.+token=/);
  await expect(card.locator('audio')).toHaveCount(1);
  expect(await card.locator('audio').getAttribute('src')).toMatch(/\/storage\/v1\/object\/sign\/media\//);
});

test('Follower-Link: Bericht und Foto freigeben, eine Person ohne Konto sieht nur das Freigegebene, bis der Link beendet wird', async ({ browser }) => {
  await owner.goto('/journal');
  const card = owner.getByTestId('journal-card').filter({ hasText: 'Erster Tag in Windhoek' });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByLabel('Bericht und Fotos für Follower freigeben').check();
  await expect(card.getByText('Für Follower freigegeben')).toBeVisible();
  await waitSynced(owner);

  await owner.goto('/followers');
  await owner.getByLabel('Für wen ist der Link?').fill('Oma');
  await owner.getByRole('button', { name: 'Link erstellen' }).click();
  const link = (await owner.getByTestId('created-link').textContent())!.trim();
  expect(link).toMatch(/\/f\/[A-Za-z0-9_-]{40,}$/);

  // a person without an account opens the link in a fresh browser profile
  const { context, page } = await newUserContext(browser);
  await page.goto(new URL(link).pathname);
  await expect(page.getByRole('heading', { level: 1, name: 'Namibia & Botswana' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 3, name: 'Erster Tag in Windhoek' })).toBeVisible();
  await expect(page.getByText('Wir sind gelandet.')).toBeVisible();
  const photos = page.getByRole('region', { name: 'Fotos' }).locator('img');
  await expect(photos).toHaveCount(2);
  await expect.poll(() => photos.first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await photos.first().getAttribute('src')).toMatch(/^\/api\/follow\/.+\/media\//); // never a storage URL
  await expect(page.locator('body')).not.toContainText(/€|EUR|Preis|Buchung|Unterkunft/);
  await expect(page).not.toHaveURL(/\/login/);
  const res = await page.request.get(new URL(link).pathname.replace('/f/', '/api/follow/'));
  expect(res.status()).toBe(200);
  expect(res.headers()['x-robots-tag']).toContain('noindex');
  expect(JSON.stringify(await res.json())).not.toMatch(/storage_path|token_hash|SUPABASE/);
  // the app itself stays behind the login for that visitor
  await page.goto('/stays');
  await expect(page).toHaveURL(/\/login/);

  // a family member without adult rights can neither manage links nor see the switch
  await member.goto('/followers');
  await expect(member.getByText('Links verwalten dürfen nur Inhaber und Erwachsene.')).toBeVisible();

  // ending the link takes effect at once
  await owner.goto('/followers');
  await owner.getByTestId('follower-link').filter({ hasText: 'Oma' }).getByRole('button', { name: 'Beenden' }).click();
  await owner.getByRole('dialog').getByRole('button', { name: 'Link beenden' }).click();
  await expect(owner.getByTestId('follower-link').filter({ hasText: 'Oma' }).getByText('Beendet')).toBeVisible();
  await page.goto(new URL(link).pathname);
  await expect(page.getByRole('heading', { name: 'Dieser Link ist nicht (mehr) gültig' })).toBeVisible();
  await context.close();
});

test('Kind-Konto: kein Zugriff auf Finanzdaten, auch nicht über die Datenbank-API', async () => {
  const token = await inviteViaUi(owner, childEmail, 'child');
  await waitSynced(owner);
  await registerViaInvite(child, token, 'Kind B');
  await child.goto('/expenses');
  await expect(child.getByText('Kein Zugriff')).toBeVisible();
  await child.goto('/safety');
  await expect(child.getByText('Dokumenten-Tresor gesperrt')).toBeVisible();
  const leaked = await child.evaluate(
    async ({ url, anon }) => {
      const session = JSON.parse(localStorage.getItem('nb-auth') ?? '{}') as { access_token?: string };
      const headers = { apikey: anon, Authorization: `Bearer ${session.access_token}` };
      const out: Record<string, unknown> = {};
      for (const table of ['payments', 'stays', 'expenses', 'documents', 'invitations']) out[table] = await (await fetch(`${url}/rest/v1/${table}?select=*`, { headers })).json();
      const overview = (await (await fetch(`${url}/rest/v1/stays_overview?select=*`, { headers })).json()) as Record<string, unknown>[];
      out.overview = overview;
      return out;
    },
    { url: stack.url, anon: stack.anonKey },
  );
  for (const table of ['payments', 'stays', 'expenses', 'documents', 'invitations']) expect(leaked[table], table).toEqual([]);
  expect(JSON.stringify(leaked.overview)).not.toMatch(/price|5000|booking_ref/);
});

test('Offline: Eintrag ohne Netz, Warteschlange sichtbar, nach Netz synchronisiert', async () => {
  await member.goto('/journal/new');
  await expect(member.getByLabel('Titel')).toBeVisible(); // page and chunks are loaded before the network goes away
  await member.context().setOffline(true);
  await expect(member.getByTestId('sync-banner')).toContainText('Offline');
  await member.getByLabel('Titel').fill('Ohne Netz geschrieben');
  await member.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(member.getByText('Ohne Netz geschrieben')).toBeVisible();
  await expect(member.getByTestId('sync-banner')).toContainText('1 in Warteschlange');
  await member.context().setOffline(false);
  await waitSynced(member);
  await owner.goto('/journal');
  await expect(owner.getByText('Ohne Netz geschrieben')).toBeVisible({ timeout: 30_000 });
});

test('Neustart ohne Netz: die App öffnet sich mit gespeicherter Sitzung und lokalen Daten', async () => {
  await member.goto('/journal');
  await expect(member.getByText('Ohne Netz geschrieben')).toBeVisible();
  await member.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await member.reload(); // the service worker now controls the page and has cached the shell
  await expect(member.getByText('Ohne Netz geschrieben')).toBeVisible();
  await member.context().setOffline(true);
  await member.reload();
  await expect(member.getByText('Ohne Netz geschrieben')).toBeVisible({ timeout: 20_000 });
  await expect(member.getByTestId('sync-banner')).toContainText('Offline');
  await member.goto('/safety'); // a page that was never opened on this device: served from the precached shell
  await expect(member.getByRole('heading', { name: 'Notfallkontakte' })).toBeVisible({ timeout: 10_000 });
  await member.context().setOffline(false);
  await waitSynced(member);
});

test('zwei echte Nutzer ändern dieselbe Buchung offline: Konflikt sichtbar, Serverstand bleibt erhalten', async () => {
  const token = await inviteViaUi(owner, adultEmail, 'adult');
  await waitSynced(owner);
  await registerViaInvite(adult, token, 'Erwachsene');
  await adult.goto('/bookings');
  await expect(adult.getByTestId('booking-card').filter({ hasText: 'Mietwagen 4x4' })).toBeVisible();

  await owner.goto('/bookings');
  await expect(owner.getByTestId('booking-card').filter({ hasText: 'Mietwagen 4x4' })).toBeVisible();
  await owner.context().setOffline(true);
  await adult.context().setOffline(true);
  const edit = async (page: Page, text: string) => {
    const card = page.getByTestId('booking-card').filter({ hasText: 'Mietwagen 4x4' });
    await card.getByRole('button', { name: 'Bearbeiten' }).click({ timeout: 10_000 });
    await page.getByLabel('Notizen').fill(text);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(card).toContainText(text);
  };
  await edit(owner, 'Änderung vom Owner');
  await edit(adult, 'Änderung der Erwachsenen');
  await adult.context().setOffline(false);
  await waitSynced(adult);
  await owner.context().setOffline(false);
  await expect(owner.getByTestId('sync-banner')).toContainText('Konflikt', { timeout: 30_000 });
  await owner.goto('/offline');
  const conflict = owner.getByTestId('conflict');
  await expect(conflict).toContainText('Änderung vom Owner');
  await expect(conflict).toContainText('Änderung der Erwachsenen');
  await owner.getByRole('button', { name: 'Serverstand übernehmen' }).click();
  await expect(conflict).toHaveCount(0);
  await owner.goto('/bookings');
  await expect(owner.getByTestId('booking-card').filter({ hasText: 'Mietwagen 4x4' })).toContainText('Änderung der Erwachsenen');
});

test('Export enthält die synchronisierten Daten und keine Demo-Daten', async () => {
  await owner.goto('/archive');
  const [download] = await Promise.all([owner.waitForEvent('download'), owner.getByRole('button', { name: /Export/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^reise-archiv-.*\.zip$/);
  await expect(owner.getByTestId('export-summary')).not.toContainText('Demo-Daten');
  await owner.getByLabel('Volltextsuche').fill('Windhoek');
  await expect(owner.getByTestId('hit').first()).toBeVisible();
});

test('Abmelden löscht die lokalen Daten, warnt bei ungesendeten Änderungen und sperrt die App', async () => {
  await member.goto('/journal/new');
  await expect(member.getByLabel('Titel')).toBeVisible();
  await member.context().setOffline(true);
  await member.getByLabel('Titel').fill('Nicht gesendet');
  await member.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(member.getByText('Nicht gesendet')).toBeVisible();
  await member.getByRole('button', { name: 'Abmelden' }).first().click();
  await expect(member.getByRole('dialog', { name: 'Nicht synchronisierte Änderungen' })).toBeVisible();
  await member.getByRole('button', { name: 'Abbrechen' }).click();
  await member.context().setOffline(false);
  await waitSynced(member);
  // A slow logout call must not let the login page appear before the local data is gone.
  await member.route('**/auth/v1/logout*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });
  await member.getByRole('button', { name: 'Abmelden' }).first().click();
  await expect(member).toHaveURL(/\/login/, { timeout: 20_000 });
  const leftovers = await member.evaluate(async () => ({
    dbs: (await indexedDB.databases()).map((d) => d.name).filter((n) => n?.startsWith('nb-sb-')),
    keys: Object.keys(localStorage).filter((k) => k.startsWith('nb-') && k !== 'nb-device-id'),
  }));
  expect(leftovers).toEqual({ dbs: [], keys: [] });
  await member.goto('/journal');
  await expect(member).toHaveURL(/\/login/);
});

test('Barrierefreiheit der Anmelde-, Einladungs- und Einrichtungsseiten (axe)', async ({ browser }) => {
  const { context, page } = await newUserContext(browser);
  for (const path of ['/login', '/invite?token=abc']) {
    await page.goto(path);
    await page.waitForTimeout(300);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`), path).toEqual([]);
  }
  await context.close();
});

test.afterAll(async () => {
  void ownerCtx;
});
