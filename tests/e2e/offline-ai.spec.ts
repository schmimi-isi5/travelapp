import { expect, test } from '@playwright/test';
import { open } from './helpers';

test.describe('Offline-First', () => {
  test('Netz aus: Journal erstellen und Hotelaufgabe erledigen, Queue sichtbar, nach Netz synchronisiert', async ({ page }) => {
    await open(page, '/offline');
    await page.getByTestId('toggle-offline').click();
    await expect(page.getByTestId('net-state')).toContainText('Offline');

    await page.getByRole('link', { name: 'Tagebuch', exact: true }).first().click();
    await page.getByRole('link', { name: 'Neuer Eintrag' }).click();
    await page.getByLabel('Titel').fill('Offline-Eintrag');
    await page.getByLabel('Was habt ihr erlebt?').fill('Kein Netz, trotzdem gespeichert.');
    await page.getByRole('button', { name: 'Veröffentlichen' }).click();
    await expect(page.getByText('Offline-Eintrag')).toBeVisible();

    await page.getByRole('link', { name: 'Unterkünfte', exact: true }).first().click();
    await page.getByTestId('stay-card').filter({ hasText: 'Demo-Lodge Etosha' }).click();
    await page.getByLabel('Buchungsbestätigung Lodge prüfen').click();
    await expect(page.getByLabel('Buchungsbestätigung Lodge prüfen')).toBeChecked();
    await expect(page.getByTestId('sync-banner')).toContainText('Offline');
    await expect(page.getByTestId('sync-banner')).toContainText('in Warteschlange');

    await page.goto('/offline');
    await expect(page.getByTestId('pending-count')).toHaveText('2 in Warteschlange');
    await page.getByTestId('toggle-offline').click();
    await expect(page.getByTestId('pending-count')).toHaveText('0 in Warteschlange');
    await expect(page.getByTestId('mutation-list')).toContainText('bestätigt');

    await page.goto('/journal');
    await expect(page.getByText('Offline-Eintrag')).toBeVisible();
    await page.goto('/stays');
    await page.getByTestId('stay-card').filter({ hasText: 'Demo-Lodge Etosha' }).click();
    await expect(page.getByLabel('Buchungsbestätigung Lodge prüfen')).toBeChecked();
  });

  test('Zwei Geräte ändern dieselbe Buchung: Konflikt sichtbar, keine stille Überschreibung', async ({ page }) => {
    await open(page, '/offline');
    await page.getByRole('button', { name: 'Zweites Gerät ändert Buchung' }).click();
    await expect(page.getByText('auf einem simulierten zweiten Gerät geändert')).toBeVisible();
    await page.getByTestId('toggle-offline').click();
    await page.goto('/bookings');
    const card = page.getByTestId('booking-card').first();
    const title = (await card.locator('h3').textContent()) ?? '';
    await card.getByRole('button', { name: 'Bearbeiten' }).click();
    await page.getByLabel('Notizen').fill('Meine lokale Änderung');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(card).toContainText('Meine lokale Änderung');
    await page.goto('/offline');
    await page.getByTestId('toggle-offline').click();
    await expect(page.getByTestId('conflict')).toBeVisible();
    await expect(page.getByTestId('conflict')).toContainText('Meine lokale Änderung');
    await expect(page.getByTestId('conflict')).toContainText('Geändert auf Gerät B (Demo)');
    await expect(page.getByTestId('sync-banner')).toContainText('Konflikt');
    await page.getByRole('button', { name: 'Serverstand übernehmen' }).click();
    await expect(page.getByTestId('conflict')).toHaveCount(0);
    await page.goto('/bookings');
    await expect(page.getByTestId('booking-card').filter({ hasText: title })).toContainText('Geändert auf Gerät B (Demo)');
  });

  test('Notfallkontakte sind ohne Netz verfügbar (Service Worker + lokale Daten)', async ({ page, context }) => {
    await open(page, '/safety');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await page.goto('/journal');
    await page.goto('/safety');
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('contact').first()).toBeVisible();
    await expect(page.getByTestId('contact')).toHaveCount(3);
    await context.setOffline(false);
  });
});

test.describe('KI-Guide', () => {
  test('ohne Freigabe antwortet nur die lokale, als regelbasiert gekennzeichnete Hilfe', async ({ page }) => {
    await open(page, '/guide');
    await page.getByLabel('Deine Frage').fill('Wasserloch Tierbeobachtung');
    await page.getByRole('button', { name: 'Fragen' }).click();
    const answer = page.getByTestId('ai-answer');
    await expect(answer).toContainText('Regelbasiert · keine KI');
    await expect(answer).toContainText('nicht freigegeben');
    await expect(answer).toContainText('Tierbeobachtung an Wasserlöchern');
  });

  test('mit Freigabe und Stub-Provider entsteht ein deutlich gelabelter KI-Entwurf, offline der Fallback', async ({ page }) => {
    await open(page, '/settings');
    await page.getByLabel(/Texte an den KI-Dienst senden dürfen/).check();
    await expect(page.getByTestId('ai-status')).toContainText('stub (ready)');
    await page.goto('/guide');
    await page.getByLabel('Deine Frage').fill('Wie fahren wir auf Schotter?');
    await page.getByRole('button', { name: 'Fragen' }).click();
    await expect(page.getByTestId('ai-answer')).toContainText('KI-Entwurf · stub');
    await expect(page.getByTestId('ai-answer')).toContainText('Stub-KI-Entwurf');
    await page.goto('/offline');
    await page.getByTestId('toggle-offline').click();
    await page.getByRole('link', { name: 'KI-Guide' }).first().click().catch(() => page.goto('/guide'));
    await page.goto('/guide');
    await page.getByLabel('Deine Frage').fill('Schotterpisten fahren');
    await page.getByRole('button', { name: 'Fragen' }).click();
    await expect(page.getByTestId('ai-answer')).toContainText('Regelbasiert · keine KI');
    await expect(page.getByTestId('ai-answer')).toContainText('Offline');
  });

  test('Tagebuch-Zusammenfassung ist ohne Provider als regelbasierter Auszug gekennzeichnet', async ({ page }) => {
    await open(page, '/journal');
    await page.getByTestId('journal-card').first().getByRole('button', { name: 'Zusammenfassen' }).click();
    await expect(page.getByTestId('summary').first()).toContainText('Regelbasierter Auszug, keine KI');
  });
});

test.describe('Archiv, Export, PWA', () => {
  test('Archiv durchsuchen und ZIP-Export mit vollständigem Manifest erzeugen', async ({ page }) => {
    await open(page, '/archive');
    await page.getByLabel('Volltextsuche').fill('Elefanten');
    await expect(page.getByTestId('hit').first()).toBeVisible();
    const count = await page.getByTestId('hit').count();
    expect(count).toBeGreaterThanOrEqual(2);
    await page.getByLabel('Nach Station').selectOption({ label: 'Etosha Nationalpark' });
    await expect(page.getByTestId('hit').first()).toContainText(/Etosha|Elefanten/);
    await page.getByLabel('Volltextsuche').fill('');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export/ }).click()]);
    expect(download.suggestedFilename()).toMatch(/^reise-archiv-.*\.zip$/);
    await expect(page.getByTestId('export-summary')).toContainText('Tabellen');
    await expect(page.getByTestId('export-summary')).toContainText('Demo');
  });

  test('PWA: Manifest, Icons und Service Worker', async ({ page, request }) => {
    await open(page);
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope ?? null)).not.toBeNull();
  });

  test('Familie: Einladung erstellen, annehmen und widerrufen', async ({ page }) => {
    await open(page, '/family');
    await page.getByRole('button', { name: 'Einladung erstellen' }).click();
    const code = (await page.getByTestId('invitation-row').first().locator('code').textContent()) ?? '';
    await page.getByLabel('Einladungscode').fill('FALSCH');
    await page.getByRole('button', { name: 'Annehmen' }).click();
    await expect(page.getByTestId('family-message')).toContainText('ungültig');
    await page.getByLabel('Einladungscode').fill(code);
    await page.getByRole('button', { name: 'Annehmen' }).click();
    await expect(page.getByTestId('member-row')).toHaveCount(6);
    await page.getByRole('button', { name: 'Einladung erstellen' }).click();
    await page.getByTestId('invitation-row').first().getByRole('button', { name: 'Widerrufen' }).click();
    await expect(page.getByTestId('invitation-row')).toHaveCount(0);
  });

  test('Dokumenten-Tresor: Ausweis verschlüsselt, falsche Passphrase wird abgelehnt', async ({ page }) => {
    await open(page, '/safety');
    await page.getByLabel('Dokumentart').selectOption('passport');
    await page.getByLabel('Dokument zum Tresor hinzufügen').setInputFiles({ name: 'pass.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF pass') });
    await expect(page.getByText('Für Ausweis- und Versicherungsdokumente ist eine Passphrase erforderlich.')).toBeVisible();
    await page.getByLabel('Passphrase').first().fill('tresor-passphrase');
    await page.getByLabel('Dokument zum Tresor hinzufügen').setInputFiles({ name: 'pass.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF pass') });
    await expect(page.getByTestId('vault-doc')).toHaveCount(1);
    await page.getByTestId('vault-doc').getByRole('button', { name: 'Öffnen' }).click();
    await page.getByLabel('Passphrase').last().fill('falsch');
    await page.getByRole('button', { name: /Entschlüsseln/ }).click();
    await expect(page.getByText('Passphrase falsch oder Datei beschädigt.').first()).toBeVisible();
  });
});
