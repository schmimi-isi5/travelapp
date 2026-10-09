import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { open } from './helpers';

const PAGES = ['/', '/route', '/route/demo-stop-etosha', '/stays', '/bookings', '/journal', '/journal/new', '/gallery', '/guide', '/sightings', '/expenses', '/safety', '/family', '/archive', '/offline', '/settings', '/more'];

for (const path of PAGES) {
  test(`Barrierefreiheit (axe, WCAG A/AA): ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, path);
    await page.waitForTimeout(400);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
  });
}
