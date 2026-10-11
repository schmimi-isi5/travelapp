/**
 * Design-Baseline & Abnahmeprüfung (Doc 07: E1 Überlauf, G1/G2 Begriffe, Screenshots)
 *
 * Aufruf:
 *   BASE_URL=http://localhost:3000 DESIGN_OUT=docs/design-audit/baseline \
 *   npx playwright test scripts/design-audit/design-baseline.spec.ts
 *
 * Login: Der Nutzer erzeugt einmalig .auth/state.json
 *   npx playwright codegen --save-storage=.auth/state.json http://localhost:3000
 * Dieses Skript gibt niemals Zugangsdaten ein.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const cfg = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "docs/design-audit/handoff/routes.json"), "utf8"),
);
const BASE = process.env.BASE_URL ?? cfg.baseUrl;
const OUT = process.env.DESIGN_OUT ?? "docs/design-audit/baseline";
const AUTH = process.env.AUTH_STATE ?? ".auth/state.json";

type Result = {
  viewport: string; route: string; overflowPx: number; forbidden: string[];
  smallText: number; screenshot: string; error?: string;
};
const results: Result[] = [];

test.use({ storageState: fs.existsSync(AUTH) ? AUTH : undefined });
test.describe.configure({ mode: "serial" });

async function resolveStation(page: Page): Promise<string | null> {
  await page.goto(`${BASE}/route`, { waitUntil: "networkidle" });
  const hrefs = await page.$$eval('a[href^="/route/"]', (as) => as.map((a) => a.getAttribute("href")));
  const unique = [...new Set(hrefs.filter(Boolean))] as string[];
  return unique[2] ?? unique[0] ?? null; // dritte Station = erste Naturstation (Sossusvlei)
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(600);
}

for (const vp of cfg.viewports) {
  test.describe(`${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`alle Routen @${vp.name}`, async ({ page }) => {
      test.setTimeout(240_000);
      const station = await resolveStation(page);
      for (const r of cfg.routes) {
        const route = r.path.includes(":firstStation") ? station : r.path;
        if (!route) continue;
        const file = path.join(OUT, vp.name, `${r.name}.png`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        try {
          await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
          await settle(page);
          const m = await page.evaluate((forbidden: string[]) => {
            const doc = document.documentElement;
            const text = document.body.innerText;
            const hits = forbidden.filter((s) => text.includes(s));
            let small = 0;
            document.querySelectorAll("body *").forEach((el) => {
              const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
              if (hasText && parseFloat(getComputedStyle(el).fontSize) < 12) small++;
            });
            return { overflow: doc.scrollWidth - doc.clientWidth, hits, small };
          }, cfg.forbiddenStrings);
          await page.screenshot({ path: file, fullPage: true });
          const allowed = cfg.forbiddenAllowedOn.includes(r.path);
          results.push({
            viewport: vp.name, route: r.path, overflowPx: m.overflow,
            forbidden: allowed ? [] : m.hits, smallText: m.small, screenshot: file,
          });
        } catch (e) {
          results.push({ viewport: vp.name, route: r.path, overflowPx: -1, forbidden: [], smallText: -1, screenshot: file, error: String(e) });
        }
      }
    });
  });
}

test.afterAll(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const summary = {
    generatedAt: new Date().toISOString(),
    E1_noOverflow: results.filter((r) => r.overflowPx > 0).map((r) => `${r.viewport} ${r.route}: +${r.overflowPx}px`),
    G1_forbiddenStrings: results.filter((r) => r.forbidden.length).map((r) => `${r.viewport} ${r.route}: ${r.forbidden.join(", ")}`),
    A3_textUnder12px: results.filter((r) => r.smallText > 0).map((r) => `${r.viewport} ${r.route}: ${r.smallText}`),
    errors: results.filter((r) => r.error).map((r) => `${r.viewport} ${r.route}: ${r.error}`),
    results,
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(summary, null, 2));
  console.log(`Report: ${path.join(OUT, "report.json")}`);
  console.log(`E1 Überlauf: ${summary.E1_noOverflow.length} · G1 Begriffe: ${summary.G1_forbiddenStrings.length} · A3 <12px: ${summary.A3_textUnder12px.length}`);
  // Baseline-Lauf soll nicht fehlschlagen; im Abnahmelauf STRICT=1 setzen.
  if (process.env.STRICT === "1") {
    expect(summary.E1_noOverflow, "E1").toEqual([]);
    expect(summary.G1_forbiddenStrings, "G1").toEqual([]);
  }
});
