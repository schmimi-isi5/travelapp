import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { open, setDemoDate, switchUser } from './helpers';

test.describe('Mitreisen von zuhause (Follower-Vorschau im Demo-Modus)', () => {
  test('vor der Reise zeigt die Vorschau keine Stationen und keine künftigen Daten', async ({ page }) => {
    await open(page, '/followers');
    await setDemoDate(page, '2026-10-01');
    await page.goto('/f/demo');
    await expect(page.getByRole('heading', { level: 1, name: /Familienabenteuer/ })).toBeVisible();
    await expect(page.getByText('Die Reise hat noch nicht begonnen')).toBeVisible();
    await expect(page.getByText('Etosha Nationalpark')).toHaveCount(0);
    await expect(page.getByText('Windhoek')).toHaveCount(0);
  });

  test('während der Reise: nur erreichte Stationen und nur ausdrücklich freigegebene Inhalte', async ({ page }) => {
    await open(page, '/followers');
    await setDemoDate(page, '2026-10-23');
    await page.goto('/f/demo');
    await expect(page.getByTestId('follower-current')).toContainText('Etosha Nationalpark');
    await expect(page.getByText('Elefanten am Wasserloch (Demo)')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Tiersichtungen' })).toContainText('Elefant');
    await expect(page.getByRole('button', { name: /Foto öffnen/ })).toHaveCount(1);
    // not shared, future or finance: never on the page
    await expect(page.getByText('Sonnenaufgang auf der Düne')).toHaveCount(0);
    await expect(page.getByText('Kasane')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(/€|EUR|Buchung|Zahlung/);
  });

  test('Freigabe im Tagebuch erscheint in der Vorschau und lässt sich zurücknehmen', async ({ page }) => {
    await open(page, '/journal');
    await setDemoDate(page, '2026-10-23');
    const card = page.getByTestId('journal-card').filter({ hasText: 'Sonnenaufgang auf der Düne' });
    await card.getByLabel('Bericht und Fotos für Follower freigeben').check();
    await expect(card.getByText('Für Follower freigegeben')).toBeVisible();
    await page.goto('/f/demo');
    await expect(page.getByRole('heading', { level: 3, name: /Sonnenaufgang auf der Düne/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Foto öffnen/ })).toHaveCount(2);

    await page.goto('/journal');
    await expect(card.getByText('Für Follower freigegeben')).toBeVisible(); // wait for the stored state before toggling
    await card.getByLabel('Bericht und Fotos für Follower freigeben').uncheck();
    await expect(card.getByText('Für Follower freigegeben')).toHaveCount(0);
    await page.goto('/f/demo');
    await expect(page.getByText('Sonnenaufgang auf der Düne')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Foto öffnen/ })).toHaveCount(1);
  });

  test('nur Erwachsene sehen die Freigabe-Schalter und die Link-Verwaltung', async ({ page }) => {
    await open(page, '/journal');
    await expect(page.getByLabel('Bericht und Fotos für Follower freigeben').first()).toBeVisible();
    await switchUser(page, 'Demo-Kind A (member)');
    await expect(page.getByLabel('Bericht und Fotos für Follower freigeben')).toHaveCount(0);
    await page.goto('/followers');
    await expect(page.getByText('Links verwalten dürfen nur Inhaber und Erwachsene.')).toBeVisible();
  });

  test('Verwaltung erklärt, was Follower sehen, und zählt die Freigaben', async ({ page }) => {
    await open(page, '/followers');
    await expect(page.getByText('Nie zu sehen: Buchungen, Preise, Zahlungen')).toBeVisible();
    await expect(page.getByTestId('share-summary')).toContainText('1 Bericht');
    await expect(page.getByRole('link', { name: 'Vorschau öffnen' })).toHaveAttribute('href', '/f/demo');
  });

  for (const path of ['/followers', '/f/demo']) {
    test(`Barrierefreiheit (axe): ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, '/followers');
      await setDemoDate(page, '2026-10-23');
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForTimeout(800);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
    });
  }
});
