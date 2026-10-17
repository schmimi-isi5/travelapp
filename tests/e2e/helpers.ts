import { expect, type Page } from '@playwright/test';

export async function open(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.getByTestId('demo-banner')).toBeVisible();
}

export async function switchUser(page: Page, name: string) {
  await page.getByLabel('Profil wechseln (Demo)').selectOption({ label: name });
}

export async function setDemoDate(page: Page, date: string) {
  await page.evaluate((d) => localStorage.setItem('nb-demo-today', d), date);
  await page.reload();
  await expect(page.getByTestId('demo-banner')).toBeVisible();
}

/** Desktop viewport tests use the top select; the select is hidden below 640px. */
export const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** Gallery: picks files and uploads the selection (the gallery stages files first, then uploads the marked ones). */
export async function pickAndUpload(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]): Promise<void> {
  await page.getByLabel('Fotos und Videos zum Hochladen auswählen').setInputFiles(files);
  await page.getByRole('button', { name: /^\d+ (Foto|Fotos|Datei|Dateien) hochladen$/ }).click();
}
