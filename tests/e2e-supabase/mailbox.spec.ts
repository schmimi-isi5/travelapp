import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { bootstrapOwner, login, newUserContext, PASSWORD, stack, uniq, waitSynced } from './stack';

test.describe.configure({ mode: 'serial' });

const tag = uniq();
const email = `postfach.${tag}@example.test`;
const stayName = `Mail-Lodge ${tag}`;

test.beforeAll(async () => {
  bootstrapOwner(email, `Postfach-Familie ${tag}`);
  const owner = createClient(stack.url, stack.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await owner.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw new Error(signedIn.error.message);
  const { data: member } = await owner.from('family_members').select('family_id').limit(1).single();
  const { data: trip, error } = await owner.from('trips').insert({ family_id: member!.family_id, title: 'Postfach-Test', start_date: '2026-10-13', countries: ['Namibia'] }).select('id').single();
  if (error) throw new Error(error.message);
  const stay = await owner.from('stays').insert({ trip_id: trip!.id, name: stayName, booking_ref: 'UI-48151', currency: 'NAD', price_minor: 634_000, quote_status: 'confirmed', booking_status: 'confirmed' });
  if (stay.error) throw new Error(stay.error.message);
});

test('Postfach abrufen, Mail zuordnen, Zahlung nach Klick eintragen und an der Unterkunft sehen', async ({ browser }) => {
  const { context, page } = await newUserContext(browser);
  await login(page, email);
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });

  await page.goto('/mailbox');
  await expect(page.getByTestId('mailbox-status')).toContainText('reise@example.test');
  await expect(page.getByTestId('mailbox-status')).toContainText('noch nie abgerufen');
  await page.getByRole('button', { name: 'Postfach abrufen' }).click();
  await expect(page.getByTestId('mailbox-note')).toContainText('1 neue Mail, 1 davon zugeordnet, 1 mit Vorschlägen');

  const card = page.getByTestId('mail-card').filter({ hasText: 'Anzahlung erhalten' });
  await expect(card.getByLabel('Abgelegt bei')).toHaveValue(/^stay:/);
  await expect(card).toContainText('Zuordnung: Buchungsnummer in der Mail');
  const received = card.getByTestId('mail-suggestion').filter({ hasText: 'Zahlung erhalten' });
  await expect(received).toContainText('2.340,00');
  await expect(received).toContainText('We have received your deposit of NAD 2,340.00');

  // nothing is booked before the click
  await page.goto('/stays');
  await page.getByTestId('stay-card').filter({ hasText: stayName }).click();
  await expect(page.getByRole('region', { name: `Zahlungen ${stayName}` }).getByTestId('payment-row')).toHaveCount(0);

  await page.goto('/mailbox');
  const again = page.getByTestId('mail-card').filter({ hasText: 'Anzahlung erhalten' }).getByTestId('mail-suggestion').filter({ hasText: 'Zahlung erhalten' });
  await again.getByRole('button', { name: 'Als Zahlung eintragen' }).click();
  await expect(again).toContainText('übernommen');
  await waitSynced(page);

  await page.goto('/stays');
  await page.getByTestId('stay-card').filter({ hasText: stayName }).click();
  const payments = page.getByRole('region', { name: `Zahlungen ${stayName}` });
  await expect(payments.getByTestId('payment-row')).toContainText('2.340,00');
  await expect(payments.getByTestId('payment-row')).toContainText('nicht verifiziert');
  await expect(payments.getByTestId('verified')).toContainText('0,00');
  await expect(payments.getByTestId('remaining')).toContainText('6.340,00');
  await expect(page.getByRole('region', { name: `Kommunikation ${stayName}` }).getByTestId('correspondence-item')).toContainText('E-Mail: Anzahlung erhalten', { timeout: 30_000 });

  // a second fetch finds nothing new
  await page.goto('/mailbox');
  await page.getByRole('button', { name: 'Postfach abrufen' }).click();
  await expect(page.getByTestId('mailbox-note')).toContainText('Keine neuen Mails');
  await context.close();
});

test('der Besitzer sieht den Eintrag Postfach in der Navigation', async ({ browser }) => {
  const { context, page } = await newUserContext(browser);
  await login(page, email);
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Postfach' })).toBeVisible({ timeout: 30_000 });
  await context.close();
});

test('Zugang in der App einrichten: testen, speichern, ändern ohne Passwort, entfernen', async ({ browser }) => {
  const { context, page } = await newUserContext(browser);
  await login(page, email);
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  await page.goto('/mailbox');
  const setup = page.getByTestId('mailbox-setup');
  await setup.getByRole('button', { name: 'Zugang einrichten' }).click();

  // the buttons stay off until the form is complete
  await expect(setup.getByRole('button', { name: 'Verbindung testen' })).toBeDisabled();
  await setup.getByLabel('IMAP-Server').fill('imap.example.test');
  await setup.getByLabel('Passwort').fill('geheim-12345');
  await setup.getByLabel('Verschlüsselung').selectOption('starttls');
  await expect(setup.getByLabel('Port')).toHaveValue('143');
  await setup.getByLabel('Verschlüsselung').selectOption('tls');
  await expect(setup.getByLabel('Port')).toHaveValue('993');

  await setup.getByRole('button', { name: 'Verbindung testen' }).click();
  await expect(page.getByTestId('mailbox-test-result')).toContainText('Verbindung steht');
  await setup.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('mailbox-test-result')).toContainText('Gespeichert');
  await expect(page.getByTestId('mailbox-summary')).toContainText('imap.example.test, Port 993, SSL/TLS');
  await expect(page.getByTestId('mailbox-setup')).not.toContainText('geheim-12345');

  // after a reload the password is not shown anywhere, but a change works without typing it again
  await page.reload();
  await page.getByTestId('mailbox-setup').getByRole('button', { name: 'Zugang ändern' }).click();
  await expect(page.getByLabel('Passwort')).toHaveValue('');
  await expect(page.getByTestId('mailbox-setup')).toContainText('Gespeichert. Leer lassen, um es zu behalten.');
  await page.getByLabel('IMAP-Server').fill('imap2.example.test');
  await page.getByRole('button', { name: 'Verbindung testen' }).click();
  await expect(page.getByTestId('mailbox-test-result')).toContainText('Verbindung steht');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('mailbox-summary')).toContainText('imap2.example.test');

  await page.getByRole('button', { name: 'Zugang ändern' }).click();
  await page.getByRole('button', { name: 'Zugang entfernen' }).click();
  await page.getByRole('dialog', { name: 'Zugang entfernen?' }).getByRole('button', { name: 'Entfernen' }).click();
  await expect(page.getByTestId('mailbox-summary')).toHaveCount(0);
  await context.close();
});
