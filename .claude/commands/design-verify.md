---
description: Redesign gegen Abnahmekriterien prüfen (Screenshots, Überlauf, Begriffe, Kontrast, Schutzliste)
---
Führe aus und berichte die Ergebnisse als Tabelle (Kriterium-ID · Ergebnis · Beleg):

1. `npx playwright test scripts/design-audit/design-baseline.spec.ts` mit `DESIGN_OUT=docs/design-audit/phase1/after`
   → Screenshots 390/768/1440 aller Routen, Prüfung E1 (kein horizontaler Überlauf) und G1 (verbotene Begriffe im DOM). Ergebnis: `report.json` im Ausgabeordner.
2. `node scripts/design-audit/check-forbidden-strings.mjs` → G1/G2 im Quellcode.
3. `node scripts/design-audit/contrast-check.mjs` → B1 für Token-Paare.
4. Lighthouse/axe, falls verfügbar (`npx @axe-core/cli` gegen localhost) → B1, E2, H1.
5. Schutzliste: `git diff --stat` für Migrations-/Supabase-/Sync-/Krypto-/Berechnungsdateien muss leer sein (I1). Pfade aus `findings.json` → `protected`.
6. Bestehende Tests (`npm test`, E2E) ausführen (I6).

Vergleiche Vorher/Nachher-Screenshots (`docs/design-audit/baseline/` vs. `…/phase1/after/`) und nenne die drei sichtbarsten Verbesserungen sowie offene Mängel.
