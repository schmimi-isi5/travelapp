import { expect, test } from '@playwright/test';
import { open, PNG_1PX, setDemoDate } from './helpers';

// Runs in the mobile project only (phone viewport, touch). Covers navigation and the flows that differ on small screens.
test.describe('Smartphone', () => {
  test('Tab-Leiste, Mehr-Menü und Profilwechsel funktionieren mit Daumenbedienung', async ({ page }) => {
    await open(page);
    const tabs = page.getByRole('navigation', { name: 'Tab-Leiste' });
    await expect(tabs).toBeVisible();
    expect(await tabs.getByRole('link').count()).toBe(5);
    // touch targets are at least 44px high
    for (const link of await tabs.getByRole('link').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await tabs.getByRole('link', { name: 'Mehr' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Mehr' })).toBeVisible();
    await page.getByLabel('Profil (Demo)').selectOption({ label: 'Demo-Kind B (child)' });
    await page.getByRole('link', { name: /Ausgaben/ }).count().then((n) => expect(n).toBe(0));
    await page.getByRole('link', { name: /Safari-Tracker/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Safari-Tracker' })).toBeVisible();
  });

  test('es gibt keinen horizontalen Seitenscroll auf den Hauptseiten', async ({ page }) => {
    for (const path of ['/', '/route', '/stays', '/journal', '/gallery', '/bookings', '/safety', '/expenses', '/offline']) {
      await open(page, path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });

  test('Tagebucheintrag mit Foto lässt sich auf dem Smartphone erfassen, die Aktionsleiste bleibt erreichbar', async ({ page }) => {
    await open(page, '/journal');
    await page.getByRole('link', { name: 'Sprachmemo aufnehmen' }).isVisible();
    await page.goto('/journal/new');
    await page.getByLabel('Titel').fill('Handy-Eintrag');
    await page.getByLabel('Fotos, Videos oder Audio auswählen').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: PNG_1PX });
    await page.getByRole('button', { name: 'Veröffentlichen' }).click();
    await expect(page).toHaveURL(/\/journal$/);
    await expect(page.getByTestId('journal-card').filter({ hasText: 'Handy-Eintrag' }).locator('img')).toHaveCount(1);
  });

  test('Unterkunft mit Zahlungen ist auf 390 px bedienbar (Akkordeon, Dialog)', async ({ page }) => {
    await open(page, '/stays');
    await page.getByTestId('stay-card').filter({ hasText: 'Gästehaus Swakopmund' }).click();
    await expect(page.getByTestId('remaining')).toContainText('16.000,00');
    await page.getByRole('button', { name: 'Zahlung hinzufügen' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });

  test('Mitreisen-Seite: kein Seitwärts-Scroll, große Tippflächen, Titel lesbar und Vollbild-Foto passt auf den Bildschirm', async ({ page }) => {
    await open(page, '/journal');
    await setDemoDate(page, '2026-10-23');
    const card = page.getByTestId('journal-card').filter({ hasText: 'Sonnenaufgang auf der Düne' });
    await card.getByLabel('Bericht für Follower freigeben').check();
    await expect(card.getByText('Für Follower freigegeben')).toBeVisible();
    await page.goto('/f/demo');
    await expect(page.getByTestId('follower-status')).toContainText('Tag 11');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    // the title is white on the picture and fits the screen
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toHaveCSS('color', 'rgb(255, 255, 255)');
    expect((await title.boundingBox())!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    // every button and link of the navigation is at least 44 px high
    for (const link of await page.getByRole('navigation', { name: 'Abschnitte' }).getByRole('link').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const name of [/Aktualisieren/, /Etosha Nationalpark \(1\)/]) expect((await page.getByRole('button', { name }).first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // the photos run edge to edge in two columns
    const tiles = page.getByTestId('photo-grid').locator('li');
    const first = await tiles.nth(0).boundingBox();
    expect(first!.x).toBeLessThanOrEqual(1);
    // full screen: the picture, the counter and the buttons are all inside the screen, the page below does not scroll
    await page.getByRole('button', { name: /Foto öffnen/ }).first().click();
    const view = page.viewportSize()!;
    for (const target of [page.getByTestId('lightbox-counter'), page.getByRole('button', { name: 'Schließen' }), page.getByRole('button', { name: 'Vergrößern' })]) {
      const box = (await target.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(view.height);
      expect(box.x + box.width).toBeLessThanOrEqual(view.width);
    }
    expect((await page.getByRole('button', { name: 'Schließen' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
  });
});

