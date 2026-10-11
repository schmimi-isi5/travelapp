import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { open } from './helpers';

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
    await page.getByLabel('Medien hochladen').setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: noisy });
    await expect.poll(async () => (await storedBlobs(page)).some((b) => b.name === 'IMG_0001.jpg'), { timeout: 15_000 }).toBe(true);
    const shrunk = (await storedBlobs(page)).find((b) => b.name === 'IMG_0001.jpg')!;
    expect(shrunk.type).toBe('image/jpeg');
    expect(shrunk.size).toBeLessThan(noisy.length * 0.7);

    // a small file is stored as it is
    const small = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#c65a3a' } }).jpeg().toBuffer();
    await page.getByLabel('Medien hochladen').setInputFiles({ name: 'klein.jpg', mimeType: 'image/jpeg', buffer: small });
    await expect.poll(async () => (await storedBlobs(page)).find((b) => b.name === 'klein.jpg')?.size).toBe(small.length);

    // switched off in the settings: the large photo is kept as it is
    await page.goto('/settings');
    await page.getByLabel(/Fotos vor dem Hochladen verkleinern/).uncheck();
    await page.goto('/gallery');
    await page.getByLabel('Medien hochladen').setInputFiles({ name: 'IMG_0002.jpg', mimeType: 'image/jpeg', buffer: noisy });
    await expect.poll(async () => (await storedBlobs(page)).find((b) => b.name === 'IMG_0002.jpg')?.size).toBe(noisy.length);
  });

  test('die Einstellung zum Verkleinern ist sichtbar und standardmäßig an', async ({ page }) => {
    await open(page, '/settings');
    await expect(page.getByLabel(/Fotos vor dem Hochladen verkleinern/)).toBeChecked();
  });
});

