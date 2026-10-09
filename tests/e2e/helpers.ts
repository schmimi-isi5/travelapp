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
