import { expect, test, type Page } from '@playwright/test';
import { open } from './helpers';

const MEMO = { name: 'sprachmemo-1.webm', mimeType: 'audio/webm', buffer: Buffer.alloc(4096, 3) };
const allowAi = (page: Page) => page.evaluate(() => localStorage.setItem('nb-ai-consent', '1'));

async function writeEntryWithMemo(page: Page, title: string, body = '') {
  await open(page, '/journal/new');
  await page.getByLabel('Titel').fill(title);
  if (body) await page.getByLabel('Was habt ihr erlebt?').fill(body);
  await page.getByLabel('Fotos, Videos oder Audio auswählen').setInputFiles(MEMO);
}

test.describe('Sprachmemos als Text und Einträge löschen', () => {
  test('Abschrift im Editor: erst nach Bestätigung gesendet, bearbeitbar, glättbar, mit „Vorher“ und in den Text übernehmbar', async ({ page, browserName }) => {
    await writeEntryWithMemo(page, 'Tag am Wasserloch');
    await allowAi(page);
    const sent: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/ai/transcribe') && request.method() === 'POST') sent.push('transcribe');
    });
    const panel = page.getByTestId('transcribe-panel');
    await panel.getByRole('button', { name: 'Abschrift erstellen' }).click();
    const confirm = page.getByRole('dialog', { name: 'Aufnahme zur Abschrift senden?' });
    await expect(confirm).toContainText('dort nicht gespeichert');
    expect(sent).toEqual([]);
    await confirm.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(confirm).toBeHidden();
    await page.waitForTimeout(150);
    expect(sent).toEqual([]);

    await panel.getByRole('button', { name: 'Abschrift erstellen' }).click();
    await page.getByRole('dialog', { name: 'Aufnahme zur Abschrift senden?' }).getByRole('button', { name: 'Aufnahme senden' }).click();
    const text = panel.getByLabel('Abschrift', { exact: true });
    await expect(text).toHaveValue(/äh also wir waren heute am Wasserloch/, { timeout: 20_000 });
    if (browserName !== 'webkit') expect(sent).toEqual(['transcribe']);
    await expect(panel.getByTestId('transcribe-note')).toContainText('Bitte lesen und korrigieren');

    await text.fill('äh also wir waren heute am Wasserloch und haben Elefanten und Zebras gesehen'); // the person corrects it
    await panel.getByRole('button', { name: 'Glätten' }).click();
    await expect(panel.getByTestId('transcribe-note')).toContainText('Von der KI geglättet');
    await expect(text).toHaveValue(/Stub-KI-Entwurf/);
    await panel.getByRole('button', { name: 'Vorher wiederherstellen' }).click();
    await expect(text).toHaveValue(/Elefanten und Zebras/);

    await panel.getByRole('button', { name: 'In den Text übernehmen' }).click();
    await expect(page.getByLabel('Was habt ihr erlebt?')).toHaveValue(/Elefanten und Zebras gesehen/);
  });

  test('ohne KI-Freigabe wird nichts gesendet, und das sagt die Seite', async ({ page }) => {
    await writeEntryWithMemo(page, 'Ohne Freigabe');
    const panel = page.getByTestId('transcribe-panel');
    await panel.getByRole('button', { name: 'Abschrift erstellen' }).click();
    await page.getByRole('dialog', { name: 'Aufnahme zur Abschrift senden?' }).getByRole('button', { name: 'Aufnahme senden' }).click();
    await expect(panel.getByTestId('transcribe-note')).toContainText('nicht freigegeben');
    await expect(panel.getByLabel('Abschrift', { exact: true })).toHaveCount(0);
  });

  test('gespeicherter Eintrag: Abschrift erstellen, speichern, in den Text übernehmen, und sie bleibt nach dem Neuladen', async ({ page }) => {
    await writeEntryWithMemo(page, 'Memo-Eintrag');
    await page.getByRole('button', { name: 'Veröffentlichen' }).click();
    await expect(page).toHaveURL(/\/journal$/);
    await allowAi(page);
    const card = page.getByTestId('journal-card').filter({ hasText: 'Memo-Eintrag' });
    await card.getByRole('button', { name: 'Abschrift erstellen' }).click();
    await page.getByRole('dialog', { name: 'Aufnahme zur Abschrift senden?' }).getByRole('button', { name: 'Aufnahme senden' }).click();
    await expect(card.getByLabel('Abschrift', { exact: true })).toHaveValue(/Wasserloch/, { timeout: 20_000 });
    await card.getByRole('button', { name: 'In den Eintrag übernehmen' }).click();
    await expect(card.locator('p').filter({ hasText: 'äh also wir waren heute am Wasserloch' })).toHaveCount(1); // now part of the entry text (the paragraph, not the editable field)
    await page.reload();
    const again = page.getByTestId('journal-card').filter({ hasText: 'Memo-Eintrag' });
    await expect(again.getByLabel('Abschrift', { exact: true })).toHaveValue(/Wasserloch/, { timeout: 20_000 }); // the transcript is saved with the memo
  });

  test('Eintrag löschen: nur der Text oder mit allen Dateien, nach Bestätigung', async ({ page }) => {
    await writeEntryWithMemo(page, 'Zum Löschen', 'Das kann weg.');
    await page.getByRole('button', { name: 'Veröffentlichen' }).click();
    await expect(page).toHaveURL(/\/journal$/);
    const card = () => page.getByTestId('journal-card').filter({ hasText: 'Zum Löschen' });
    await card().getByRole('button', { name: 'Löschen' }).click();
    const dialog = page.getByRole('dialog', { name: 'Eintrag löschen?' });
    await expect(dialog).toContainText('wird unwiderruflich gelöscht');
    await dialog.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(card()).toHaveCount(1);

    // only the text: the memo stays in the gallery
    await card().getByRole('button', { name: 'Löschen' }).click();
    await page.getByRole('dialog', { name: 'Eintrag löschen?' }).getByRole('button', { name: 'Endgültig löschen' }).click();
    await expect(card()).toHaveCount(0);
    await page.goto('/gallery');
    await expect(page.getByRole('button', { name: /Öffnen: sprachmemo-1\.webm/ })).toHaveCount(1);

    // with all files: nothing remains
    await writeEntryWithMemo(page, 'Alles weg', 'Auch die Aufnahme.');
    await page.getByRole('button', { name: 'Veröffentlichen' }).click();
    await expect(page).toHaveURL(/\/journal$/);
    const second = page.getByTestId('journal-card').filter({ hasText: 'Alles weg' });
    await second.getByRole('button', { name: 'Löschen' }).click();
    const dialog2 = page.getByRole('dialog', { name: 'Eintrag löschen?' });
    await dialog2.getByLabel('Eintrag mit allen Dateien und Abschriften löschen.').check();
    await dialog2.getByRole('button', { name: 'Endgültig löschen' }).click();
    await expect(second).toHaveCount(0);
    await page.goto('/gallery');
    await expect(page.getByRole('button', { name: /Öffnen: sprachmemo-1\.webm/ })).toHaveCount(1); // only the first memo is left
  });
});
