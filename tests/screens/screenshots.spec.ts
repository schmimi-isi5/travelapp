import { expect, test, type Page } from '@playwright/test';

const SIZES = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
] as const;

interface Shot {
  file: string;
  path: string;
  prepare?: (page: Page) => Promise<void>;
}

const SHOTS: Shot[] = [
  { file: '01-dashboard', path: '/' },
  { file: '02-route', path: '/route' },
  { file: '03-stationsdetail', path: '/route/demo-stop-etosha' },
  { file: '04-unterkuenfte', path: '/stays', prepare: async (p) => { await p.getByTestId('stay-card').filter({ hasText: 'Gästehaus Swakopmund' }).click(); } },
  { file: '05-buchungen', path: '/bookings' },
  { file: '06-tagebuch', path: '/journal' },
  { file: '07-tagebuch-neu', path: '/journal/new' },
  { file: '08-galerie', path: '/gallery' },
  { file: '09-ki-guide', path: '/guide', prepare: async (p) => { await p.getByLabel('Deine Frage').fill('Wasserloch Tierbeobachtung'); await p.getByRole('button', { name: 'Fragen' }).click(); await p.getByTestId('ai-answer').waitFor(); } },
  { file: '10-safari-tracker', path: '/sightings' },
  { file: '11-ausgaben', path: '/expenses' },
  { file: '12-sicherheit', path: '/safety' },
  { file: '13-familie', path: '/family' },
  { file: '14-erinnerungsarchiv', path: '/archive', prepare: async (p) => { await p.getByLabel('Volltextsuche').fill('Elefanten'); } },
  { file: '15-offline-sync', path: '/offline' },
  { file: '16-einstellungen', path: '/settings' },
  { file: '17-mehr', path: '/more' },
  { file: '18-design-system', path: '/settings/design-system' },
  { file: '19-kind-profil-unterkuenfte', path: '/stays', prepare: async (p) => { await p.evaluate(() => localStorage.setItem('nb-current-user', 'demo-user-kind-b')); await p.reload(); await p.getByTestId('demo-banner').waitFor(); } },
];

for (const size of SIZES) {
  test.describe(`Screenshots ${size.name}px`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    for (const shot of SHOTS) {
      test(`${shot.file}`, async ({ page }) => {
        await page.goto(shot.path);
        await expect(page.getByTestId('demo-banner')).toBeVisible();
        await page.waitForTimeout(500);
        await shot.prepare?.(page);
        await page.waitForTimeout(300);
        await page.screenshot({ path: `docs/screenshots/${size.name}/${shot.file}.png`, fullPage: size.name !== '1440' ? true : true });
      });
    }
  });
}
