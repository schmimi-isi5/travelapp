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

test.describe('Mitreisen-Seite: Kopf, Fotos in Vollbild, Neues', () => {
  async function shareTwoPhotos(page: import('@playwright/test').Page) {
    await open(page, '/journal');
    await setDemoDate(page, '2026-10-23');
    const card = page.getByTestId('journal-card').filter({ hasText: 'Sonnenaufgang auf der Düne' });
    await card.getByLabel('Bericht und Fotos für Follower freigeben').check();
    await expect(card.getByText('Für Follower freigegeben')).toBeVisible(); // saved before the page is left
  }

  test('vor der Reise: Titel, Countdown und Hinweis, keine künftigen Stationen', async ({ page }) => {
    await open(page, '/followers');
    await setDemoDate(page, '2026-10-01');
    await page.goto('/f/demo');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(page.getByTestId('follower-status')).toContainText('Noch 12 Tage bis zur Abreise');
    await expect(page.getByText('Die Reise hat noch nicht begonnen')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Abschnitte' })).toHaveCount(0); // nothing to jump to yet
  });

  test('während der Reise: Tageszähler, Überblick und Sprungleiste, die oben haften bleibt', async ({ page }) => {
    await shareTwoPhotos(page);
    await page.goto('/f/demo');
    await expect(page.getByTestId('follower-status')).toContainText('Tag 11 · gerade in Etosha Nationalpark');
    const overview = page.getByRole('list', { name: 'Überblick' });
    await expect(overview).toContainText('4 Stationen');
    await expect(overview).toContainText('2 Fotos');
    await expect(overview).toContainText('2 Berichte');
    const nav = page.getByRole('navigation', { name: 'Abschnitte' });
    await expect(nav.getByRole('link')).toHaveText([/Fotos/, /Berichte/, /Route/, /Tiere/]);
    await nav.getByRole('link', { name: /Route/ }).click();
    await expect(page.getByRole('region', { name: 'Unsere Route' })).toBeInViewport();
    // the bar stays at the top while the page scrolls
    expect(await nav.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(0);
    await expect(page.getByRole('list', { name: 'Stationen' }).getByRole('listitem')).toHaveCount(4);
  });

  test('Fotos: Vollbildansicht mit Zähler, Tasten, Wischen, Vergrößern und Schließen; Filter nach Ort', async ({ page }) => {
    await shareTwoPhotos(page);
    await page.goto('/f/demo');
    await page.getByRole('button', { name: /Foto öffnen/ }).first().click();
    const box = page.getByTestId('lightbox');
    await expect(box).toBeVisible();
    await expect(page.getByTestId('lightbox-counter')).toHaveText('1 von 2');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('lightbox-counter')).toHaveText('2 von 2');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('lightbox-counter')).toHaveText('1 von 2'); // wraps around
    // a swipe to the left shows the next picture, to the right the previous one
    const stage = await box.locator('div.relative.min-h-0').boundingBox();
    const y = stage!.y + stage!.height / 2;
    await page.mouse.move(stage!.x + stage!.width * 0.8, y);
    await page.mouse.down();
    await page.mouse.move(stage!.x + stage!.width * 0.2, y, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId('lightbox-counter')).toHaveText('2 von 2');
    await page.mouse.move(stage!.x + stage!.width * 0.2, y);
    await page.mouse.down();
    await page.mouse.move(stage!.x + stage!.width * 0.8, y, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId('lightbox-counter')).toHaveText('1 von 2');
    // zoom on and off
    const zoom = page.getByRole('button', { name: 'Vergrößern' });
    await zoom.click();
    await expect(page.getByRole('button', { name: 'Verkleinern' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Verkleinern' }).click();
    await expect(page.getByRole('button', { name: 'Vergrößern' })).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');
    await expect(box).toBeHidden();

    // filter by place: only that place's photos, and the full-screen view follows the filter
    const places = page.getByRole('group', { name: 'Fotos nach Ort filtern' });
    await places.getByRole('button', { name: /Sossusvlei/ }).click();
    await expect(page.getByRole('button', { name: /Foto öffnen/ })).toHaveCount(1);
    await page.getByRole('button', { name: /Foto öffnen/ }).click();
    await expect(page.getByTestId('lightbox-counter')).toHaveText('1 von 1');
  });

  test('Neues seit dem letzten Besuch: beim ersten Mal nichts, danach alles Unbekannte', async ({ page }) => {
    await shareTwoPhotos(page);
    await page.goto('/f/demo');
    await expect(page.getByTestId('follower-status')).toBeVisible();
    await expect(page.getByTestId('follower-new')).toHaveCount(0); // first visit: everything would be new
    // a visitor who has been here before and saw nothing yet
    await page.evaluate(() => localStorage.setItem('nb-follow-seen:demo', '[]'));
    await page.reload();
    await expect(page.getByTestId('follower-new')).toContainText(/\d+ neu seit deinem letzten Besuch/);
    await expect(page.getByText('Neu', { exact: true }).first()).toBeVisible();
  });
});

