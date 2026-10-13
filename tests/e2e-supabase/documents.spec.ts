import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { bootstrapOwner, inviteViaUi, login, newUserContext, PASSWORD, registerViaInvite, stack, uniq, waitSynced } from './stack';

test.describe.configure({ mode: 'serial' });

const tag = uniq();
const ownerEmail = `unterlagen.${tag}@example.test`;
const childEmail = `unterlagen.kind.${tag}@example.test`;
const flightTitle = `Hinflug ${tag}`;
const carTitle = `Mietwagen ${tag}`;

test.beforeAll(async () => {
  bootstrapOwner(ownerEmail, `Unterlagen-Familie ${tag}`);
  const owner = createClient(stack.url, stack.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await owner.auth.signInWithPassword({ email: ownerEmail, password: PASSWORD });
  if (signedIn.error) throw new Error(signedIn.error.message);
  const { data: member } = await owner.from('family_members').select('family_id').limit(1).single();
  const { data: trip, error } = await owner.from('trips').insert({ family_id: member!.family_id, title: 'Unterlagen-Test', start_date: '2026-10-13', countries: ['Namibia'] }).select('id').single();
  if (error) throw new Error(error.message);
  const bookings = await owner.from('bookings').insert([
    { trip_id: trip!.id, kind: 'flight', title: flightTitle, starts_at: '2026-10-13' },
    { trip_id: trip!.id, kind: 'car', title: carTitle, starts_at: '2026-10-14' },
  ]);
  if (bookings.error) throw new Error(bookings.error.message);
});

test('Bordkarte und Mietvertrag hochladen; das Kind sieht auf seinem Gerät nur die Bordkarte und kann sie offline halten', async ({ browser }) => {
  const { context: ownerContext, page: owner } = await newUserContext(browser);
  await login(owner, ownerEmail);
  await expect(owner).toHaveURL(/\/$/, { timeout: 30_000 });
  await owner.goto('/bookings');
  const flight = owner.getByTestId('booking-card').filter({ hasText: flightTitle });
  await flight.getByLabel(`Nachweis hochladen für ${flightTitle}`).setInputFiles({ name: 'bordkarte.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 boarding pass') });
  await expect(flight.getByTestId('booking-document')).toContainText('für alle sichtbar');
  const car = owner.getByTestId('booking-card').filter({ hasText: carTitle });
  await car.getByLabel(`Nachweis hochladen für ${carTitle}`).setInputFiles({ name: 'mietvertrag.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 rental contract') });
  await expect(car.getByTestId('booking-document')).toContainText('Vertrag');
  await waitSynced(owner);
  await expect(owner.getByTestId('travel-document')).toHaveCount(2);

  const token = await inviteViaUi(owner, childEmail, 'child');
  await waitSynced(owner);
  const { context: childContext, page: child } = await newUserContext(browser);
  await registerViaInvite(child, token, 'Kind B');
  await child.goto('/bookings');
  await expect(child.getByTestId('travel-document')).toHaveCount(1, { timeout: 30_000 });
  await expect(child.getByTestId('travel-document')).toContainText('bordkarte.pdf');
  await expect(child.getByText('mietvertrag.pdf')).toHaveCount(0);
  await expect(child.getByTestId('travel-documents-status')).toContainText('noch nicht auf diesem Handy');

  // keep it on this device: the file comes from the private storage with the child's own login
  await child.getByRole('button', { name: /Für unterwegs auf dieses Handy laden/ }).click();
  await expect(child.getByTestId('travel-documents-note')).toContainText('jetzt auch ohne Netz auf diesem Handy');
  await expect(child.getByTestId('travel-documents-status')).toContainText('alle ohne Netz auf diesem Handy');

  // and it opens without any network
  await childContext.setOffline(true);
  const [download] = await Promise.all([child.waitForEvent('download'), child.getByRole('button', { name: 'bordkarte.pdf' }).click()]);
  expect(download.suggestedFilename()).toBe('bordkarte.pdf');
  await childContext.setOffline(false);

  await childContext.close();
  await ownerContext.close();
});
