import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { open, pickAndUpload, PNG_1PX } from './helpers';

/** Reads the byte size and type of every blob stored in the local demo database. */
async function storedBlobs(page: import('@playwright/test').Page): Promise<{ name: string; type: string; size: number }[]> {
  return page.evaluate(async () => {
    const info = (await indexedDB.databases()).find((d) => d.name === 'nb-local'); // the demo's own database, not the simulated server
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open(info!.name!);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows: { name: string; type: string; size: number; blob?: Blob; data?: ArrayBuffer }[] = await new Promise((resolve) => {
      const all = db.transaction('blobs').objectStore('blobs').getAll();
      all.onsuccess = () => resolve(all.result);
    });
    db.close();
    return rows.map((r) => ({ name: r.name, type: r.type, size: r.blob?.size ?? r.data?.byteLength ?? r.size }));
  });
}

test.describe('Fotos vom Handy', () => {
  test('große Fotos werden vor dem Upload verkleinert, kleine bleiben unverändert, der Schalter lässt es aus', async ({ page }) => {
    const noisy = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 60 } } }).jpeg({ quality: 92 }).toBuffer();
    expect(noisy.length).toBeGreaterThan(1_500_000);
    await open(page, '/gallery');
    await pickAndUpload(page, [{ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: noisy }]);
    await expect.poll(async () => (await storedBlobs(page)).some((b) => b.name === 'IMG_0001.jpg'), { timeout: 15_000 }).toBe(true);
    const shrunk = (await storedBlobs(page)).find((b) => b.name === 'IMG_0001.jpg')!;
    expect(shrunk.type).toBe('image/jpeg');
    expect(shrunk.size).toBeLessThan(noisy.length * 0.7);

    // a small file is stored as it is
    const small = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#c65a3a' } }).jpeg().toBuffer();
    await pickAndUpload(page, [{ name: 'klein.jpg', mimeType: 'image/jpeg', buffer: small }]);
    await expect.poll(async () => (await storedBlobs(page)).find((b) => b.name === 'klein.jpg')?.size).toBe(small.length);

    // switched off in the settings: the large photo is kept as it is
    await page.goto('/settings');
    await page.getByLabel(/Fotos vor dem Hochladen verkleinern/).uncheck();
    await page.goto('/gallery');
    await pickAndUpload(page, [{ name: 'IMG_0002.jpg', mimeType: 'image/jpeg', buffer: noisy }]);
    await expect.poll(async () => (await storedBlobs(page)).find((b) => b.name === 'IMG_0002.jpg')?.size).toBe(noisy.length);
  });

  test('die Einstellung zum Verkleinern ist sichtbar und standardmäßig an', async ({ page }) => {
    await open(page, '/settings');
    await expect(page.getByLabel(/Fotos vor dem Hochladen verkleinern/)).toBeChecked();
  });

  test('mehrere Fotos auswählen, einzelne abwählen und mit Album und Station zusammen hochladen', async ({ page }) => {
    await open(page, '/gallery');
    await expect(page.getByTestId('media-tile')).toHaveCount(4); // the demo gallery
    const before = 4;
    const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG_1PX });
    const picker = page.getByLabel('Fotos und Videos zum Hochladen auswählen');
    await picker.setInputFiles([png('a1.png'), png('a2.png'), png('a3.png'), png('a4.png'), { name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') }]);
    await expect(page.getByText(/virus\.exe.*Dateityp .* ist nicht erlaubt/)).toBeVisible();
    const count = page.getByTestId('bulk-count');
    // a tap on the picture marks or unmarks it
    const tap = (name: string) => page.getByTestId('bulk-item').filter({ hasText: name }).locator('label').click();
    await expect(count).toContainText('4 von 4 ausgewählt');
    // nothing is uploaded before the button is pressed
    await expect(page.getByTestId('media-tile')).toHaveCount(before);

    // mark: single deselect, none, all, and pick again
    await tap('a3.png');
    await expect(page.getByLabel('Auswählen: a3.png')).not.toBeChecked();
    await expect(count).toContainText('3 von 4 ausgewählt');
    await page.getByRole('button', { name: 'Keine auswählen' }).click();
    await expect(count).toContainText('0 von 4 ausgewählt');
    await expect(page.getByRole('button', { name: /hochladen$/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Alle auswählen' }).click();
    await expect(count).toContainText('4 von 4 ausgewählt');
    await tap('a3.png');
    // picking more adds them to the list (new files start marked)
    await expect(page.getByRole('button', { name: 'Weitere auswählen' })).toBeVisible();
    await picker.setInputFiles([png('a5.png')]);
    await expect(count).toContainText('4 von 5 ausgewählt');

    // one album and one station for the whole batch
    await page.getByLabel('Album für alle (optional)').fill('Etosha-Test');
    await page.getByLabel('Station für alle (optional)').selectOption({ label: 'Windhoek' });
    await page.getByRole('button', { name: '4 Fotos hochladen' }).click();
    await expect(page.getByTestId('bulk-summary')).toContainText('4 Dateien hochgeladen');
    await expect(page.getByTestId('media-tile')).toHaveCount(before + 4);
    // the unmarked photo stays in the list for later
    await expect(page.getByTestId('bulk-item')).toHaveCount(1);
    await expect(count).toContainText('0 von 1 ausgewählt');
    await page.getByRole('button', { name: 'Etosha-Test' }).click();
    await expect(page.getByTestId('media-tile')).toHaveCount(4);

    await page.getByRole('button', { name: 'Auswahl verwerfen' }).click();
    await expect(page.getByTestId('bulk-panel')).toHaveCount(0);
  });

  const gpsPhoto = (lat: [number, number, number], latRef: 'N' | 'S', lon: [number, number, number], lonRef: 'E' | 'W', taken: string) =>
    sharp({ create: { width: 64, height: 48, channels: 3, background: '#c65a3a' } })
      .jpeg()
      .withExif({
        IFD0: { Make: 'Apple', Model: 'iPhone 14' },
        IFD2: { DateTimeOriginal: taken },
        IFD3: { GPSLatitudeRef: latRef, GPSLatitude: lat.map((n) => `${n}/1`).join(' '), GPSLongitudeRef: lonRef, GPSLongitude: lon.map((n) => `${n}/1`).join(' ') },
      })
      .toBuffer();

  test('Fotos mit Aufnahmeort werden beim Hochladen den Reisezielen zugeordnet und lassen sich von Hand ändern', async ({ page }) => {
    const etosha = await gpsPhoto([18, 51, 18], 'S', [16, 19, 45], 'E', '2026:10:21 17:30:00');
    const sossusvlei = await gpsPhoto([24, 44, 0], 'S', [15, 18, 0], 'E', '2026:10:16 08:00:00');
    const plain = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#0f3d4e' } }).jpeg().toBuffer();
    await open(page, '/gallery');
    await expect(page.getByTestId('media-tile')).toHaveCount(4);
    await pickAndUpload(page, [
      { name: 'etosha.jpg', mimeType: 'image/jpeg', buffer: etosha },
      { name: 'sossusvlei.jpg', mimeType: 'image/jpeg', buffer: sossusvlei },
      { name: 'ohne-daten.jpg', mimeType: 'image/jpeg', buffer: plain },
    ]);
    const summary = page.getByTestId('bulk-summary');
    await expect(summary).toContainText('3 Dateien hochgeladen');
    await expect(summary).toContainText('2 mit Aufnahmeort');
    await expect(summary).toContainText('2 nach Aufnahmeort einer Station zugeordnet');
    await expect(summary).toContainText('1 ohne Station');

    // the gallery can be filtered by station
    const tileOf = (name: RegExp) => page.getByTestId('media-tile').filter({ has: page.getByLabel(name) });
    await page.getByLabel('Nach Station filtern').selectOption({ label: 'Etosha Nationalpark' });
    await expect(tileOf(/etosha\.jpg/)).toHaveCount(1);
    await expect(tileOf(/sossusvlei\.jpg/)).toHaveCount(0);
    await page.getByLabel('Nach Station filtern').selectOption({ label: 'Sossusvlei' });
    await expect(tileOf(/sossusvlei\.jpg/)).toHaveCount(1);
    await page.getByLabel('Nach Station filtern').selectOption({ label: 'Ohne Station' });
    await expect(page.getByTestId('media-tile').filter({ has: page.getByLabel(/ohne-daten\.jpg/) })).toHaveCount(1);
    await page.getByLabel('Nach Station filtern').selectOption({ label: 'Etosha Nationalpark' });

    // position, camera and the way the station was found
    await tileOf(/etosha\.jpg/).getByRole('button', { name: /Öffnen/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('photo-location')).toContainText('-18.8550, 16.3292');
    await expect(dialog.getByTestId('photo-location')).toContainText('bei Etosha Nationalpark');
    await expect(dialog.getByTestId('photo-location').getByRole('link')).toHaveAttribute('href', /openstreetmap\.org\/\?mlat=-18\.855/);
    await expect(dialog.getByTestId('photo-camera')).toContainText('Apple iPhone 14');
    await expect(dialog.getByLabel('Station')).toHaveValue(/.+/);
    await expect(dialog).toContainText('nach Aufnahmeort zugeordnet');

    // a person can change the station; then it says so
    await dialog.getByLabel('Station').selectOption({ label: 'Windhoek' });
    await expect(dialog).toContainText('von Hand zugeordnet');
    await page.getByRole('button', { name: 'Schließen' }).click();
    await expect(tileOf(/etosha\.jpg/)).toHaveCount(0); // it left the Etosha filter
    await page.getByLabel('Nach Station filtern').selectOption({ label: 'Windhoek' });
    await expect(tileOf(/etosha\.jpg/)).toHaveCount(1);
  });

  test('bereits hochgeladene Fotos werden nachträglich ausgewertet und zugeordnet', async ({ page }) => {
    const etosha = await gpsPhoto([18, 51, 18], 'S', [16, 19, 45], 'E', '2026:10:21 17:30:00');
    const plain = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#0f3d4e' } }).jpeg().toBuffer();
    // uploaded the way it used to be: without reading the metadata (switched off in the journal)
    await open(page, '/journal/new');
    await page.getByLabel('Titel').fill('Alte Fotos');
    await page.getByLabel('Was habt ihr erlebt?').fill('Fotos, deren Daten beim Hochladen nicht gelesen wurden.');
    await page.getByLabel(/Aufnahmeort \(GPS\)/).uncheck();
    await page.getByLabel('Fotos, Videos oder Audio auswählen').setInputFiles([
      { name: 'alt-mit-ort.jpg', mimeType: 'image/jpeg', buffer: etosha },
      { name: 'alt-ohne-daten.jpg', mimeType: 'image/jpeg', buffer: plain },
    ]);
    await page.getByRole('button', { name: 'Veröffentlichen' }).click();
    await expect(page).toHaveURL(/\/journal$/);

    await open(page, '/gallery');
    await expect(page.getByTestId('media-tile')).toHaveCount(6);
    const scan = page.getByRole('button', { name: /Vorhandene Fotos auswerten \(2\)/ });
    await expect(scan).toBeVisible();
    await scan.click();
    const note = page.getByTestId('scan-note');
    await expect(note).toContainText('2 Fotos geprüft');
    await expect(note).toContainText('1 mit Aufnahmeort');
    await expect(note).toContainText('1 einer Station zugeordnet');
    await expect(note).toContainText('1 ohne Ort und Datum in der Datei');
    await expect(page.getByRole('button', { name: /Vorhandene Fotos auswerten/ })).toHaveCount(0); // nothing is read twice

    await page.getByLabel('Nach Station filtern').selectOption({ label: 'Etosha Nationalpark' });
    await page.getByTestId('media-tile').filter({ has: page.getByLabel(/alt-mit-ort\.jpg/) }).getByRole('button', { name: /Öffnen/ }).click();
    await expect(page.getByRole('dialog').getByTestId('photo-location')).toContainText('bei Etosha Nationalpark');
    await expect(page.getByRole('dialog')).toContainText('nach Aufnahmeort zugeordnet');
  });
});
