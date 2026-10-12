import { expect, test, type Page } from '@playwright/test';
import { open, PNG_1PX } from './helpers';

const allowAi = (page: Page) => page.evaluate(() => localStorage.setItem('nb-ai-consent', '1'));

test.describe('KI-Hilfen und Planung', () => {
  test('Tagesbriefing zeigt, was bekannt ist, ohne den alten "kein Dienst"-Satz, und die KI-Vorschau ist nur auf Knopfdruck', async ({ page }) => {
    await open(page, '/route');
    await page.getByRole('link', { name: /STATION 04.*Etosha/i }).click();
    const briefing = page.getByTestId('day-briefing');
    await expect(briefing).toContainText('Station 4 von 6');
    await expect(briefing).toContainText('Unterkunft');
    await expect(briefing).not.toContainText('kein Dienst verbunden');
    await expect(page.getByTestId('briefing-weather-status')).toContainText('nur in der Live-Version'); // honest in demo mode
    await expect(page.getByTestId('day-briefing-ai')).toHaveCount(0); // nothing is sent or shown before the button is pressed

    await allowAi(page);
    await page.getByRole('button', { name: 'Tagesvorschau mit KI' }).click();
    await expect(page.getByTestId('day-briefing-ai')).toContainText('KI-Entwurf (stub)');
    await expect(page.getByTestId('day-briefing-ai')).toContainText('day_briefing');
  });

  test('Reiseplan hat einen Reise-Check mit Hinweisen, der Dashboard-Hinweis führt dorthin, und die KI formuliert nächste Schritte', async ({ page }) => {
    await open(page, '/');
    const badge = page.getByTestId('plan-findings');
    await expect(badge).toBeVisible();
    await badge.click();
    await expect(page).toHaveURL(/\/route#reise-check/);
    const check = page.getByTestId('trip-check');
    await expect(check).toBeVisible();
    expect(await page.getByTestId('trip-check-finding').count()).toBeGreaterThan(0);
    await allowAi(page);
    await check.getByRole('button', { name: 'Nächste Schritte mit KI' }).click();
    await expect(page.getByTestId('trip-check-ai')).toContainText('KI-Entwurf (stub)');
  });

  test('Reiseführer sendet Ort, Unterkunft und Gruppengröße als Kontext mit, aber keine Namen', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit lässt Anfragen einer vom Service Worker gesteuerten Seite nicht zuverlässig mit page.route abfangen');
    await open(page, '/guide');
    await allowAi(page);
    await expect(page.getByTestId('ai-context-note')).toContainText(/Keine Namen/);
    const sent: { facts?: string[]; question?: string }[] = [];
    await page.route('**/api/ai/generate', async (route) => {
      sent.push((route.request().postDataJSON() as { input: { facts?: string[]; question?: string } }).input);
      await route.continue();
    });
    await page.getByLabel('Deine Frage').fill('Wie fahren wir auf Schotter?');
    await page.getByRole('button', { name: 'Fragen' }).click();
    await expect(page.getByTestId('ai-answer')).toContainText('KI-Entwurf · stub');
    const facts = (sent[0]?.facts ?? []).join(' | ');
    expect(facts).toMatch(/Heute ist der/);
    expect(facts).toMatch(/(Aktuelle|Nächste) Station: Windhoek/);
    expect(facts).toMatch(/Reisegruppe: \d+ Erwachsene und \d+ Kinder/);
    expect(facts).not.toMatch(/Demo-Erwachsene|Demo-Kind/);
  });

  test('Tagebuch: Entwurf aus dem Tag und Titelvorschlag, ohne Freigabe nur die lokale Vorlage', async ({ page }) => {
    await open(page, '/journal/new');
    await page.getByLabel('Station').selectOption({ label: 'Etosha Nationalpark' });
    await page.getByRole('button', { name: 'Entwurf aus dem Tag' }).click();
    await expect(page.getByTestId('journal-draft')).toContainText('Regelbasiert, keine KI'); // no consent yet
    await page.getByRole('button', { name: 'In den Text übernehmen' }).click();
    await expect(page.getByLabel('Was habt ihr erlebt?')).toContainText('Etosha Nationalpark');

    await allowAi(page);
    await page.getByRole('button', { name: 'Titel vorschlagen' }).click();
    await expect(page.getByTestId('journal-title-ideas')).toContainText('KI-Entwurf (stub)');
    await page.getByRole('button', { name: 'Ersten Vorschlag übernehmen' }).click();
    await expect(page.getByLabel('Titel')).not.toHaveValue('');
  });

  test('Safari-Tracker: typische Tiere der Station als Schnellauswahl und Artvorschlag aus der Notiz', async ({ page }) => {
    await open(page, '/sightings');
    await page.getByRole('button', { name: 'Sichtung eintragen' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Sichtung eintragen' });
    await dialog.getByLabel('Station').selectOption({ label: 'Etosha Nationalpark' });
    const picks = dialog.getByTestId('species-quick-picks');
    await expect(picks).toContainText('Erfahrungswerte, keine Garantie');
    await picks.getByRole('button', { name: 'Elefant' }).click();
    await expect(dialog.getByLabel('Art')).not.toHaveValue('');
    await dialog.getByLabel('Art').selectOption('');
    await dialog.getByLabel('Notiz').fill('Eine große Herde Elefanten am Wasserloch');
    await dialog.getByRole('button', { name: 'Art aus der Notiz vorschlagen' }).click();
    await expect(dialog.getByTestId('species-suggestion')).toContainText('Regelbasiert, keine KI');
    await dialog.getByRole('button', { name: 'Ersten Vorschlag übernehmen' }).click();
    await expect(dialog.getByLabel('Art')).not.toHaveValue('');
  });

  test('Ausgaben: Belegfoto wird erst nach Bestätigung gesendet, schlägt Werte vor und speichert nichts von selbst', async ({ page, browserName }) => {
    await open(page, '/expenses');
    await allowAi(page);
    const sent: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/ai/receipt')) sent.push('receipt');
    });
    await page.getByRole('button', { name: 'Ausgabe erfassen' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Ausgabe erfassen' });
    await dialog.getByLabel('Belegfoto auswählen').setInputFiles({ name: 'beleg.png', mimeType: 'image/png', buffer: PNG_1PX });
    const confirm = page.getByRole('dialog', { name: 'Belegfoto an die KI senden?' });
    await expect(confirm).toContainText('nirgends gespeichert');
    expect(sent).toEqual([]); // nothing left the device yet
    await confirm.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(confirm).toBeHidden();
    await page.waitForTimeout(150); // the dialog reports its closing a moment later
    expect(sent).toEqual([]);

    await dialog.getByLabel('Belegfoto auswählen').setInputFiles({ name: 'beleg.png', mimeType: 'image/png', buffer: PNG_1PX });
    await page.getByRole('dialog', { name: 'Belegfoto an die KI senden?' }).getByRole('button', { name: 'Foto senden' }).click();
    await expect(page.getByTestId('receipt-note')).toContainText('Von der KI vorgeschlagen', { timeout: 20_000 });
    if (browserName !== 'webkit') expect(sent).toEqual(['receipt']); // WebKit does not report requests of a page controlled by a service worker
    await expect(dialog.getByLabel('Betrag')).toHaveValue('123,45');
    await expect(dialog.getByLabel('Währung')).toHaveValue('NAD');
    await expect(dialog.getByLabel('Beschreibung')).toHaveValue('Stub-Laden');
    await expect(dialog.getByLabel('Datum')).toHaveValue('2026-10-20');
    await expect(page.getByTestId('expense-row').filter({ hasText: 'Stub-Laden' })).toHaveCount(0); // not saved until the person presses save
  });

  test('Ausgaben: Referenzkurs laden füllt Kurs, Quelle und Stand, gespeichert wird erst nach dem Prüfen', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit lässt Anfragen einer vom Service Worker gesteuerten Seite nicht zuverlässig mit page.route abfangen');
    await open(page, '/expenses');
    await page.route('**/api/fx*', (route) => route.fulfill({ json: { from: 'NAD', to: 'EUR', rate: 0.0488, asOf: '2026-10-12', source: 'open.er-api.com (Rates By Exchange Rate API)' } }));
    await page.getByRole('button', { name: /Kurs erfassen|Wechselkurs/ }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Wechselkurs erfassen' });
    await dialog.getByRole('button', { name: 'Aktuellen Referenzkurs laden' }).click();
    await expect(dialog.getByLabel('Kurs', { exact: true })).toHaveValue('0,0488');
    await expect(dialog.getByLabel('Quelle')).toHaveValue(/open\.er-api\.com.*Referenzkurs/);
    await expect(dialog.getByLabel('Stand (Datum)')).toHaveValue('2026-10-12');
    await expect(dialog.getByTestId('rate-note')).toContainText('Wechselstubenkurs');
  });
});
