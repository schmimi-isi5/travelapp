import { expect, test, type Page } from '@playwright/test';
import { bootstrapOwner, inviteViaUi, login, newUserContext, registerViaInvite, uniq, waitSynced } from '../e2e-supabase/stack';

const SIZES = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
] as const;

async function shoot(page: Page, size: string, file: string) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `docs/screenshots/supabase/${size}/${file}.png`, fullPage: true });
}

test('Produktivmodus: Anmeldung, Einrichtung, leere Zustände, Familie und Mitgliedersicht', async ({ browser }) => {
  const run = uniq();
  const ownerEmail = `owner.${run}@example.test`;
  bootstrapOwner(ownerEmail, `Screenshot-Familie ${run}`);
  for (const size of SIZES) {
    // a fresh account per size: only an account without a trip sees the setup page
    const sizeEmail = size.name === '390' ? ownerEmail : `owner.${size.name}.${run}@example.test`;
    if (size.name !== '390') bootstrapOwner(sizeEmail, `Screenshot-Familie ${size.name} ${run}`);
    const { context, page } = await newUserContext(browser);
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
    await shoot(page, size.name, '01-anmelden');
    await page.goto('/invite?token=beispiel');
    await shoot(page, size.name, '02-einladung-registrieren');
    await login(page, sizeEmail);
    await expect(page).toHaveURL(/\/setup/);
    await shoot(page, size.name, '03-einrichtung');
    if (size.name === '390') {
      await page.getByLabel('Titel der Reise').fill('Namibia & Botswana');
      await page.getByLabel('Abreisedatum').fill('2026-10-13');
      await page.getByRole('button', { name: 'Reise anlegen' }).click();
      await expect(page).toHaveURL(/\/$/);
    } else {
      await context.close();
      continue;
    }
    for (const [path, file] of [['/', '04-dashboard-leer'], ['/route', '05-route-leer'], ['/stays', '06-unterkuenfte-leer'], ['/journal', '07-tagebuch-leer'], ['/safety', '08-sicherheit'], ['/settings', '09-einstellungen']] as const) {
      await page.goto(path);
      await shoot(page, size.name, file);
    }
    await context.close();
  }

  // owner with data and a second person on the larger viewports
  const { context, page } = await newUserContext(browser);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, ownerEmail);
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/route');
  await page.getByRole('button', { name: 'Station hinzufügen' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Station hinzufügen' });
  await dialog.getByLabel('Titel').fill('Windhoek');
  await dialog.getByLabel('Breitengrad').fill('-22.56');
  await dialog.getByLabel('Längengrad').fill('17.07');
  await dialog.getByLabel('Ankunft').fill('2026-10-13');
  await dialog.getByRole('button', { name: 'Station speichern' }).click();
  await waitSynced(page);
  const memberEmail = `mitglied.${run}@example.test`;
  const token = await inviteViaUi(page, memberEmail, 'member');
  await waitSynced(page);
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/family');
    await shoot(page, size.name, '10-familie-einladung');
    await page.goto('/route');
    await shoot(page, size.name, '11-route-mit-station');
  }
  const member = await newUserContext(browser);
  await member.page.setViewportSize({ width: 390, height: 844 });
  await registerViaInvite(member.page, token, 'Mitglied');
  await member.page.goto('/stays');
  await shoot(member.page, '390', '12-mitgliedsansicht-unterkuenfte');
  await member.page.goto('/more');
  await shoot(member.page, '390', '13-mehr-menue');
  await member.context.close();
  await context.close();
});
