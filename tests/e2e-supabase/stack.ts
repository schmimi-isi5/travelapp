import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const PASSWORD = 'e2e-passphrase-2026';

function secrets(): Record<string, string> {
  const file = join(process.cwd(), 'docker', 'stack.secrets');
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}

export const stack = (() => {
  const s = secrets();
  return {
    url: process.env.SUPABASE_TEST_URL ?? 'http://localhost:18000',
    anonKey: process.env.SUPABASE_TEST_ANON_KEY ?? s.ANON_KEY ?? '',
    serviceKey: process.env.SUPABASE_TEST_SERVICE_KEY ?? s.SERVICE_ROLE_KEY ?? '',
  };
})();

export const mailpit = process.env.MAILPIT_URL ?? 'http://localhost:18025';

export function uniq(): string {
  return randomBytes(3).toString('hex');
}

/** Creates the first owner and an empty family through the operator script (public sign-up is disabled). */
export function bootstrapOwner(email: string, familyName: string): void {
  execFileSync('node', ['scripts/bootstrap-owner.mjs', '--email', email, '--family', familyName], {
    env: { ...process.env, SUPABASE_URL: stack.url, SUPABASE_ANON_KEY: stack.anonKey, SUPABASE_SERVICE_ROLE_KEY: stack.serviceKey, BOOTSTRAP_PASSWORD: PASSWORD },
    stdio: 'pipe',
  });
}

export async function login(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill(password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
}

export async function newUserContext(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

/** Reads the raw invitation token the owner's device keeps locally (the server only stores its hash). */
export async function readInvitationToken(page: Page, email: string): Promise<string> {
  const token = await page.evaluate(async (target) => {
    const dbs = (await indexedDB.databases()).filter((d) => d.name?.startsWith('nb-sb-'));
    for (const info of dbs) {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const open = indexedDB.open(info.name!);
        open.onsuccess = () => res(open.result);
        open.onerror = () => rej(open.error);
      });
      const rows: { email: string; code: string }[] = await new Promise((res) => {
        const q = db.transaction('invitations').objectStore('invitations').getAll();
        q.onsuccess = () => res(q.result);
      });
      db.close();
      const hit = rows.find((r) => r.email === target && r.code);
      if (hit) return hit.code;
    }
    return null;
  }, email);
  expect(token, 'invitation token on the creating device').toBeTruthy();
  return token as string;
}

export async function inviteViaUi(page: Page, email: string, role: 'adult' | 'member' | 'child'): Promise<string> {
  await page.goto('/family');
  await page.getByLabel('E-Mail der eingeladenen Person').fill(email);
  await page.getByLabel('Rolle', { exact: true }).selectOption(role);
  await page.getByRole('button', { name: 'Einladung erstellen' }).click();
  await expect(page.getByTestId('family-message')).toContainText('Einladung erstellt');
  return readInvitationToken(page, email);
}

export async function registerViaInvite(page: Page, token: string, name: string): Promise<void> {
  await page.goto(`/invite?token=${token}`);
  await page.getByLabel('Dein Name').fill(name);
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Passwort wiederholen').fill(PASSWORD);
  await page.getByRole('button', { name: 'Registrieren und beitreten' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  await expect(page.locator('main#main')).toBeVisible();
}

export async function waitSynced(page: Page): Promise<void> {
  await expect(page.getByTestId('sync-banner')).toHaveCount(0, { timeout: 30_000 });
}

export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
