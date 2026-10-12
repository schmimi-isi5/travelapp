import { expect, test } from '@playwright/test';
import { open, PNG_1PX } from './helpers';

test.describe('Teilen mit der App (Android share_target)', () => {
  test('ohne aktiven Service Worker leitet der Server mit Hinweis zur Galerie um und speichert nichts', async ({ request }) => {
    const response = await request.post('/share-target', { maxRedirects: 0, multipart: { media: { name: 'foto.png', mimeType: 'image/png', buffer: PNG_1PX } } });
    expect(response.status()).toBe(303);
    expect(response.headers().location).toContain('/gallery?shared=unavailable');
  });

  test('die App kündigt das Teilen im Manifest an', async ({ request }) => {
    const manifest = (await (await request.get('/manifest.webmanifest')).json()) as { share_target?: { action: string; method: string; params: { files: { name: string; accept: string[] }[] } } };
    expect(manifest.share_target).toMatchObject({ action: '/share-target', method: 'POST' });
    expect(manifest.share_target?.params.files[0]).toMatchObject({ name: 'media', accept: ['image/*', 'video/*', 'audio/*'] });
  });

  test('geteilte Fotos landen über den Service Worker in der Galerie und der Posteingang wird geleert', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Service-Worker-Formularübergabe im Test nur mit Chromium stabil');
    await open(page, '/gallery');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await page.evaluate(async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/share-target';
      form.enctype = 'multipart/form-data';
      const input = document.createElement('input');
      input.type = 'file';
      input.name = 'media';
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'geteilt.png', { type: 'image/png' }));
      input.files = transfer.files;
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
    }, PNG_1PX.toString('base64'));

    await expect(page).toHaveURL(/\/gallery\?shared=1/);
    await expect(page.getByTestId('share-notice')).toContainText('1 geteilte Datei in die Galerie übernommen', { timeout: 20_000 });
    await expect(page.getByTestId('media-tile').filter({ has: page.getByLabel(/geteilt\.png/) })).toHaveCount(1);
    expect(await page.evaluate(() => caches.has('nb-share-inbox'))).toBe(false);
  });
});
