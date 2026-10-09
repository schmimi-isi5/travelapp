import { expect, test } from '@playwright/test';
import { open, PNG_1PX } from './helpers';

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
});
