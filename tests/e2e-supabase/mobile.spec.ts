import { expect, test } from '@playwright/test';
import { bootstrapOwner, login, uniq } from './stack';

// Smartphone viewport against the real backend: sign-in, setup, navigation and logout without horizontal scrolling.
test('Anmeldung, Einrichtung und Navigation auf dem Smartphone', async ({ page }) => {
  const email = `mobile.${uniq()}@example.test`;
  bootstrapOwner(email, 'Mobile Familie');
  await login(page, email);
  await expect(page).toHaveURL(/\/setup/);
  await page.getByLabel('Titel der Reise').fill('Namibia & Botswana');
  await page.getByRole('button', { name: 'Reise anlegen' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('navigation', { name: 'Tab-Leiste' })).toBeVisible();
  for (const path of ['/', '/route', '/stays', '/journal', '/more', '/family']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(1);
  }
  await page.goto('/more');
  await page.getByRole('button', { name: 'Abmelden' }).first().click();
  await expect(page).toHaveURL(/\/login/);
});
