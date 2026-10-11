# Startauftrag: Premium-Redesign Phase 1 – Namibia & Botswana Reise-App

## Kontext
Die App (Next.js App Router, React, Tailwind CSS v4, Supabase Auth/RLS, Offline-Sync, MapLibre/Protomaps) ist funktional weitgehend fertig, bleibt gestalterisch aber hinter dem Designkonzept zurück. Ein Design-Audit der Live-App liegt in `docs/design-audit/` vor (Durchschnittsnote 4,3/10). Lies vor jeder Änderung:

1. `docs/design-audit/01_DESIGN_AUDIT.md` – Befunde S1–S10 mit Screenshots
2. `docs/design-audit/03_DESIGN_SYSTEM_V2.md` – Tokens, Typografie, Komponenten
3. `docs/design-audit/04_SCREEN_REDESIGN_PLAN.md` – Maßnahmen je Seite (IDs G1…, D1…, R1…)
4. `docs/design-audit/06_IMPLEMENTATION_ROADMAP.md` – Phasen, Abhängigkeiten, Schutzliste
5. `docs/design-audit/07_ACCEPTANCE_CRITERIA.md` – Abnahmekriterien
6. `docs/design-audit/handoff/findings.json` – alle Maßnahmen maschinenlesbar

Die Regeln in `CLAUDE.design.md` gelten verbindlich.

## Schritt 0 – Orientierung (keine Codeänderung)
1. Lege Branch `design/v2-phase1` an (kein Commit ohne Freigabe).
2. Verifiziere die vermuteten Dateipfade aus Roadmap §2. Hilfreiche Suchen:
   ```bash
   grep -rn "sky-city\|Unser Reisebegleiter\|Synchronisiere\|Klärbedarf\|Datenherkunft\|user_entered\|Row-Level-Security" --include=*.tsx --include=*.ts .
   grep -rn "@theme\|--color-deep\|--font-sans" --include=*.css .
   grep -rn "fitBounds\|maplibre" --include=*.tsx .
   ```
3. Trage die tatsächlichen Pfade in `docs/design-audit/handoff/findings.json` (Feld `files`) ein.
4. Erstelle die Baseline: `npx playwright test scripts/design-audit/design-baseline.spec.ts` (Ausgabe `docs/design-audit/baseline/`). Login-Zustand liegt in `.auth/state.json` (vom Nutzer erzeugt) – gib selbst keine Zugangsdaten ein.
5. Liefere mir eine kurze Bestandsaufnahme: echte Pfade, Abweichungen vom Audit, Risiken. **Warte danach auf mein OK.**

## Schritt 1 – Hotfix-Paket (risikoarm, je ≤ 0,5 PT)
| ID | Maßnahme |
|---|---|
| G9 | Fraunces + Inter via `next/font` (Entwurf: `handoff/fonts.snippet.tsx`) |
| 1.2 | Tokens V2 inkl. Aliase (Entwurf: `handoff/theme-v2.css`) – bestehende Klassen dürfen nicht brechen |
| G10/1.5 | `lib/labels.ts` (Entwurf: `handoff/labels.de.ts`), alle Technikbegriffe aus Doc 07 G1 ersetzen, Pluralisierung „Nacht/Nächte“, „Min..“ |
| R1/R7 | Karte: `fitBounds` nur über Stationen in NA/BW; Grid `grid-cols-1` + `min-w-0`; `map.resize()` bei Container-Resize |
| R5 | „ca. ? km · ca. unbekannt“ → unbekannte Werte weglassen |
| D8/D9 | Wetter-Karte nur mit Daten; Offline-Status- und Datenherkunft-Karte vom Dashboard entfernen |
| G3 | Sync-Banner → Header-Indikator (gleiche Datenquelle, nur lesen) |

Danach: `/design-verify`, Vorher/Nachher-Screenshots, Zusammenfassung. **Warte auf Freigabe.**

## Schritt 2 – Rest von Phase 1
G1, G2, G4, G7, 1.6 (`PhotoHero` + `public/images/ASSETS.json`), D1–D5, D13, 1.9 (`StationImage`-Fallback). Solange keine lizenzierten Fotos vorliegen: Bildslots mit SVG-Fallback der richtigen Landschaftsklasse, nie Stadtsilhouette für Naturorte.

## Grenzen (verbindlich)
- Keine Änderungen an Datenmodell, Migrationen, Supabase-Schema, RLS, Auth.
- Keine Änderung fachlicher Berechnungen (Zahlungen, Restbeträge, Währungen, Wechselkurse).
- Keine Änderung an Offline-Queue/Sync-Logik, Tresor-Kryptografie, Follower-Freigaben, EXIF-Bereinigung.
- Keine Funktion entfernen; verschobene Navigationsziele bleiben erreichbar.
- Keine neuen UI-Bibliotheken; nur `next/font` und vorhandene Abhängigkeiten.
- Keine Bilder ohne dokumentierte Lizenz; keine Hotlinks (CSP erlaubt nur self/data/blob/api.reise.schmeckseler.de).
- **Keine Commits, Pushes, Merges, Deployments** ohne meine ausdrückliche Freigabe.

## Ergebnisformat je Etappe
1. Geänderte Dateien (Liste) und kurze Begründung je Datei
2. Erfüllte / offene Kriterien aus Doc 07 (IDs)
3. Vorher/Nachher-Screenshots in `docs/design-audit/phase1/`
4. Bestätigung, dass Schutzliste unberührt ist (`git diff --stat` der geschützten Bereiche)
5. Offene Fragen und benötigte Assets
