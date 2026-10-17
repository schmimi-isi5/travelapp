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
});
