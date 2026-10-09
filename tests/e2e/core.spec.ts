import { expect, test } from '@playwright/test';
import { open, PNG_1PX, setDemoDate, switchUser } from './helpers';

test.describe('Demo, Route und Dashboard', () => {
  test('startet ohne API-Schlüssel, kennzeichnet Demo und behauptet keine echten Buchungen', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page);
    await expect(page.getByTestId('demo-banner')).toContainText('fiktiv');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Abreise in');
    await expect(page.getByTestId('featured-stop')).toContainText('Windhoek');
    await expect(page.getByTestId('booking-check')).toContainText('zu prüfen');
    await expect(page.getByText('Nicht verfügbar: kein Wetterdienst verbunden.')).toBeVisible();
    expect(errors).toEqual([]);
    const health = await page.request.get('/api/health');
    expect((await health.json()).mode).toBe('demo');
  });

  test('Route zeigt Liste, Karte, Fahrtstrecken als Schätzung und Stationsdetails', async ({ page }) => {
    await open(page, '/route');
    await expect(page.getByRole('link', { name: /Station 1: Windhoek/ })).toBeVisible();
    await expect(page.getByLabel('Routenkarte mit Stationen')).toBeVisible();
    await expect(page.getByTestId('route-leg').first()).toContainText('grobe Offline-Schätzung');
    await page.getByRole('link', { name: /Etosha Nationalpark/ }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Etosha Nationalpark' })).toBeVisible();
    await expect(page.getByText('Tagesbriefing')).toBeVisible();
    await expect(page.getByText('Grobe Offline-Schätzung aus Luftlinie')).toBeVisible();
    await expect(page.getByTestId('tip-card').first()).toContainText('Aktualität nicht geprüft');
  });

  test('Tagesbriefing zeigt die korrekte Station und offene Aufgaben für das Demo-Datum', async ({ page }) => {
    await open(page);
    await setDemoDate(page, '2026-10-21');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Etosha Nationalpark');
    await expect(page.getByTestId('featured-stop')).toContainText('Heute');
    await expect(page.getByTestId('open-count')).toContainText('5 offen');
  });

  test('Station hinzufügen berechnet eine Strecke und validiert Eingaben', async ({ page }) => {
    await open(page, '/route');
    await page.getByRole('button', { name: 'Station hinzufügen' }).first().click();
    await page.getByLabel('Titel').fill('Fish River Canyon');
    await page.getByLabel('Breitengrad').fill('abc');
    await page.getByRole('button', { name: 'Station speichern' }).click();
    await expect(page.getByText('Zahl erwartet')).toBeVisible();
    await page.getByLabel('Breitengrad').fill('-27.6');
    await page.getByLabel('Längengrad').fill('17.6');
    await page.getByRole('button', { name: 'Station speichern' }).click();
    await expect(page.getByRole('link', { name: /Station 7: Fish River Canyon/ })).toBeVisible();
    await expect(page.getByTestId('route-leg')).toHaveCount(6);
  });
});

test.describe('Unterkünfte, Zahlungen, Aufgaben', () => {
  test('Hotel anlegen, zwei Teilzahlungen, Restbetrag korrekt, unverifizierte Zahlung separat', async ({ page }) => {
    await open(page, '/stays');
    await page.getByRole('button', { name: 'Unterkunft anlegen' }).first().click();
    await page.getByLabel('Name der Unterkunft').fill('Test-Lodge Okavango');
    await page.getByLabel('Preisstatus').selectOption('confirmed');
    await page.getByLabel('Bruttobetrag').fill('10.000,00');
    await page.getByLabel('Währung').selectOption('BWP');
    await page.getByRole('button', { name: 'Unterkunft anlegen' }).last().click();
    const card = page.getByTestId('stay-card').filter({ hasText: 'Test-Lodge Okavango' });
    await card.click();
    const section = page.getByRole('region', { name: 'Zahlungen Test-Lodge Okavango' });
    await expect(section.getByTestId('remaining')).toContainText('10.000,00');

    await section.getByRole('button', { name: 'Zahlung hinzufügen' }).click();
    const dialog = page.getByRole('dialog', { name: 'Zahlung hinzufügen' });
    await dialog.getByLabel('Betrag').fill('4.000,00');
    await dialog.getByLabel('Verifizierung').selectOption('verified');
    await dialog.getByRole('button', { name: 'Zahlung speichern' }).click();
    await section.getByRole('button', { name: 'Zahlung hinzufügen' }).click();
    await dialog.getByLabel('Betrag').fill('1.000,00');
    await dialog.getByRole('button', { name: 'Zahlung speichern' }).click();

    await expect(section.getByTestId('verified')).toContainText('4.000,00');
    await expect(section.getByTestId('unverified')).toContainText('1.000,00');
    await expect(section.getByTestId('remaining')).toContainText('6.000,00');
    await expect(section.getByTestId('remaining')).toContainText('BWP');
    await expect(page.getByRole('button', { name: /Test-Lodge Okavango/ }).getByTestId('payment-status')).toHaveText('teilbezahlt');
  });

  test('unbekannte Demo-Unterkünfte zeigen unbekannt statt offen/unbezahlt', async ({ page }) => {
    await open(page, '/stays');
    await page.getByTestId('stay-card').filter({ hasText: 'Demo-Lodge Etosha' }).click();
    const section = page.getByRole('region', { name: 'Zahlungen Demo-Lodge Etosha' });
    await expect(section.getByTestId('price')).toHaveText('unbekannt');
    await expect(section.getByTestId('remaining')).toHaveText('unbekannt');
    await expect(page.getByRole('button', { name: 'Klärbedarf' })).toBeVisible();
  });

  test('Filter teilbezahlt findet das Demo-Beispiel mit Teilzahlungen', async ({ page }) => {
    await open(page, '/stays');
    await page.getByRole('button', { name: /Teilbezahlt/ }).click();
    await expect(page.getByTestId('stay-card')).toHaveCount(1);
    await expect(page.getByTestId('stay-card')).toContainText('Gästehaus Swakopmund');
  });

  test('Beleg hochladen, Aufgabe anlegen, zuweisen und erledigen aktualisiert das Dashboard', async ({ page }) => {
    await open(page, '/stays');
    await page.getByTestId('stay-card').filter({ hasText: 'Demo-Unterkunft Chobe' }).click();
    await page.getByLabel('Beleg hochladen für Demo-Unterkunft Chobe').setInputFiles({ name: 'rechnung.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 demo') });
    await expect(page.getByRole('button', { name: 'rechnung.pdf' })).toBeVisible();

    await page.getByLabel('Neue Aufgabe').last().fill('Anzahlung überweisen');
    await page.getByLabel('Zuständige Person').last().selectOption({ label: 'Demo-Erwachsene B' });
    await page.getByRole('button', { name: 'Hinzufügen' }).last().click();
    await expect(page.getByText('Zuständig: Demo-Erwachsene B').first()).toBeVisible();

    await open(page, '/');
    await expect(page.getByTestId('open-count')).toContainText('6 offen');
    await open(page, '/stays');
    await page.getByTestId('stay-card').filter({ hasText: 'Demo-Unterkunft Chobe' }).click();
    await page.getByLabel('Anzahlung überweisen').click();
    await expect(page.getByLabel('Anzahlung überweisen')).toBeChecked();
    await open(page, '/');
    await expect(page.getByTestId('open-count')).toContainText('5 offen');
  });

  test('Ausgaben: Summen je Währung, keine EUR-Summe ohne Wechselkurs', async ({ page }) => {
    await open(page, '/expenses');
    await expect(page.getByTestId('total-NAD')).toContainText('850,00');
    await expect(page.getByTestId('total-BWP')).toContainText('320,00');
    await expect(page.getByTestId('total-EUR')).toContainText('45,90');
    await expect(page.getByTestId('no-consolidation')).toBeVisible();
    await expect(page.getByTestId('consolidated')).toHaveCount(0);
    const dialog = page.getByRole('dialog', { name: 'Wechselkurs erfassen' });
    await page.getByRole('button', { name: 'Wechselkurs erfassen' }).click();
    await dialog.getByLabel('Von').selectOption('NAD');
    await dialog.getByLabel('Kurs', { exact: true }).fill('0,05');
    await dialog.getByRole('button', { name: 'Kurs speichern' }).click();
    await expect(dialog.getByText('Quelle des Kurses ist erforderlich.')).toBeVisible();
    await dialog.getByLabel('Quelle').fill('Wechselstube Windhoek, Beleg 1');
    await dialog.getByRole('button', { name: 'Kurs speichern' }).click();
    await page.getByRole('button', { name: 'Wechselkurs erfassen' }).click();
    await dialog.getByLabel('Von').selectOption('BWP');
    await dialog.getByLabel('Kurs', { exact: true }).fill('0,07');
    await dialog.getByLabel('Quelle').fill('Bank Maun, Beleg 2');
    await dialog.getByRole('button', { name: 'Kurs speichern' }).click();
    await expect(page.getByTestId('consolidated')).toContainText('EUR');
    await expect(page.getByTestId('consolidated')).toContainText('Wechselstube Windhoek');
  });
});

test.describe('Buchungen', () => {
  test('Flug anlegen, an Station hängen, Nachweis hinzufügen und exportieren', async ({ page }) => {
    await open(page, '/bookings');
    await page.getByRole('button', { name: 'Buchung anlegen' }).first().click();
    await page.getByLabel('Titel').fill('Rückflug Windhoek–Frankfurt');
    await page.getByLabel('Station').selectOption({ label: 'Maun / Okavango' });
    await page.getByRole('button', { name: 'Buchung anlegen' }).last().click();
    const card = page.getByTestId('booking-card').filter({ hasText: 'Rückflug Windhoek–Frankfurt' });
    await expect(card).toContainText('Maun / Okavango');
    await expect(card).toContainText('Referenz: unbekannt');
    await card.getByLabel('Nachweis hochladen für Rückflug Windhoek–Frankfurt').setInputFiles({ name: 'ticket.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF demo') });
    await expect(card.getByRole('button', { name: 'ticket.pdf' })).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Exportieren' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^buchung-.*\.json$/);
  });
});

test.describe('Tagebuch, Medien, Rollen', () => {
  test('Journal mit zwei Fotos und Audio; andere Person kann es lesen, private Einträge nicht', async ({ page }) => {
    await open(page, '/journal/new');
    await page.getByLabel('Titel').fill('Löwen am Morgen');
    await page.getByLabel('Was habt ihr erlebt?').fill('Drei Löwen am Wasserloch. Die Kinder waren leise.');
    await page.getByLabel('Station').selectOption({ label: 'Etosha Nationalpark' });
    await page.getByLabel('Fotos, Videos oder Audio auswählen').setInputFiles([
      { name: 'loewe1.png', mimeType: 'image/png', buffer: PNG_1PX },
      { name: 'loewe2.png', mimeType: 'image/png', buffer: PNG_1PX },
      { name: 'memo.webm', mimeType: 'audio/webm', buffer: Buffer.from('webm-audio-demo') },
    ]);
    await page.getByRole('button', { name: 'Veröffentlichen' }).click();
    await expect(page).toHaveURL(/\/journal$/);
    const card = page.getByTestId('journal-card').filter({ hasText: 'Löwen am Morgen' });
    await expect(card.locator('img')).toHaveCount(2);
    await expect(card.locator('audio')).toHaveCount(1);
    await expect(card).toContainText('Demo-Erwachsene A');

    await switchUser(page, 'Demo-Erwachsene B (adult)');
    await expect(page.getByTestId('journal-card').filter({ hasText: 'Löwen am Morgen' })).toBeVisible();

    await switchUser(page, 'Demo-Erwachsene A (owner)');
    await page.goto('/journal/new');
    await page.getByLabel('Titel').fill('Mein privater Gedanke');
    await page.getByLabel('Sichtbarkeit').selectOption('private');
    await page.getByRole('button', { name: 'Veröffentlichen' }).click();
    await expect(page.getByText('Mein privater Gedanke')).toBeVisible();
    await switchUser(page, 'Demo-Erwachsene B (adult)');
    await expect(page.getByText('Mein privater Gedanke')).toHaveCount(0);
  });

  test('Upload validiert Dateityp und zeigt Fehler', async ({ page }) => {
    await open(page, '/gallery');
    await page.getByLabel('Medien hochladen').setInputFiles({ name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
    await expect(page.getByText(/Dateityp .* ist nicht erlaubt/)).toBeVisible();
    await page.getByLabel('Medien hochladen').setInputFiles({ name: 'ok.png', mimeType: 'image/png', buffer: PNG_1PX });
    await expect(page.getByTestId('media-tile')).toHaveCount(5);
  });

  test('Kinderprofil sieht weder Preise, Belege, Ausgaben noch Dokumente', async ({ page }) => {
    await open(page, '/');
    await switchUser(page, 'Demo-Kind B (child)');
    await expect(page.getByRole('link', { name: 'Ausgaben' })).toHaveCount(0);
    await page.goto('/expenses');
    await expect(page.getByText('Kein Zugriff')).toBeVisible();
    await page.goto('/stays');
    await expect(page.getByText('Preise, Zahlungen und Belege sind in dieser Rolle ausgeblendet.')).toBeVisible();
    await page.getByTestId('stay-card').first().click();
    await expect(page.getByRole('region', { name: /Zahlungen/ })).toHaveCount(0);
    await expect(page.getByText('Belege sind für diese Rolle nicht sichtbar.')).toBeVisible();
    await page.goto('/safety');
    await expect(page.getByText('Dokumenten-Tresor gesperrt')).toBeVisible();
    await page.goto('/bookings');
    await expect(page.getByText('Betrag unbekannt')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Buchung anlegen' })).toHaveCount(0);
  });

  test('Tiersichtung Elefant mit Bild eintragen, nach Art und Station filtern', async ({ page }) => {
    await open(page, '/sightings');
    await page.getByRole('button', { name: 'Sichtung eintragen' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Sichtung eintragen' });
    await dialog.getByLabel('Art', { exact: true }).selectOption({ label: 'Elefant' });
    await dialog.getByLabel('Station').selectOption({ label: 'Kasane / Chobe' });
    await dialog.getByLabel('Anzahl (optional)').fill('7');
    await dialog.getByLabel('Foto (optional)').setInputFiles({ name: 'ele.png', mimeType: 'image/png', buffer: PNG_1PX });
    await dialog.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('sighting-row')).toHaveCount(3);
    await page.getByLabel('Nach Station filtern').selectOption({ label: 'Kasane / Chobe' });
    await expect(page.getByTestId('sighting-row')).toHaveCount(1);
    await expect(page.getByTestId('sighting-row').locator('img')).toHaveCount(1);
    await page.getByLabel('Nach Station filtern').selectOption('all');
    await page.getByRole('button', { name: /^Elefant/ }).first().click();
    await expect(page.getByTestId('sighting-row')).toHaveCount(2);
    await expect(page.getByTestId('sighting-row')).toContainText(['Elefant', 'Elefant']);
  });
});
