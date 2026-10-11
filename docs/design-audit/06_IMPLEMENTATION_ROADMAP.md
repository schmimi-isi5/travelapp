# 06 – Implementierungs-Roadmap

## 0. Wichtiger Hinweis zu Dateipfaden
Das Repository war in dieser Phase **nicht zugänglich**. Routen (`/`, `/route`, `/route/[id]`, `/stays`, `/bookings`, `/journal`, `/gallery`, `/guide`, `/sightings`, `/expenses`, `/safety`, `/family`, `/followers`, `/archive`, `/offline`, `/settings`) und Klassennamen sind **verifiziert**; die unten genannten Dateipfade sind **abgeleitet aus Next.js-App-Router-Konventionen** und mit „(vermutet)“ markiert. Erster Schritt der Umsetzung: Pfade mit `grep -r "sky-city\|Unser Reisebegleiter\|Synchronisiere\|Klärbedarf" app components` bestätigen und diese Tabelle aktualisieren.

## 1. Geschützte Funktionen (dürfen nicht verändert werden)

| Bereich | Schutzregel | Prüfung |
|---|---|---|
| Datenmodell, Supabase-Schema, RLS-Policies | keine Migration, keine Policy-Änderung | `git diff --stat supabase/` = leer |
| Auth | Login/Logout-Flow, Session-Handling unverändert | manueller Login-Test |
| Finanzberechnungen (verifiziert/unverifiziert/Rest, Währungstrennung, Wechselkurs-Konsolidierung) | nur Darstellungskomponenten berühren; Berechnungsfunktionen read-only | Unit-Tests der Berechnungen grün; Snapshot der Beträge vor/nach identisch |
| Offline-Queue & Sync, Konfliktlogik | Status nur **lesen** für Header-Indikator | Offline-Simulation: Änderung → Queue → Sync |
| Offline-Karte (Protomaps-Tiles, Speichern/Entfernen) | Funktion erhalten, nur UI verschieben | Karte im Flugmodus |
| Dokumententresor (AES-256-GCM, Passphrase) | Krypto-Code unverändert | Upload + Entschlüsseln eines Testdokuments |
| Follower-Freigaben, EXIF-/Ortsbereinigung | unverändert | Follower-Link-Test mit Testeintrag |
| Alle bestehenden Funktionen/Routen | keine Entfernung; verschobene Navigationseinträge bleiben erreichbar | Link-Checker über alle 16 Routen |

## 2. Phasen

### Phase 0 – Vorbereitung (0,5 PT)
- Branch `design/v2`, visuelle Baseline (Playwright-Screenshots aller Routen in 390/768/1440).
- Pfade verifizieren (s. o.), Komponenteninventar erstellen.
- Abhängigkeit: keine.

### Phase 1 – Fundament „Größter Sprung“ (P0, ≈ 4–5 PT)

| # | Maßnahme | Dateien (vermutet) | Aufwand | Abhängig von |
|---|---|---|---|---|
| 1.1 | Webfonts Fraunces + Inter via `next/font`, CSS-Variablen | `app/layout.tsx`, `app/globals.css` | S | – |
| 1.2 | Tokens V2 in `@theme` inkl. Aliase (Doc 03 §10) | `app/globals.css` | S | – |
| 1.3 | Typo-Skala als Utilities (`text-display-xl` …), `PageHeader` (Kapitel/Werkzeug) | `components/ui/page-header.tsx` (neu) | M | 1.1, 1.2 |
| 1.4 | App-Shell: Top-Nav entfernen, Sidebar gruppieren, Header mit Sync-Punkt | `components/layout/app-shell.tsx`, `…/sidebar.tsx`, `…/top-nav.tsx`, `…/sync-banner.tsx` (vermutet) | M | 1.2 |
| 1.5 | Label-Mapping (Status, Rollen, Quellen, Sync) + Pluralisierung „Nacht/Nächte“ | `lib/labels.ts` (neu), Verwendungsstellen | M | – |
| 1.6 | `PhotoHero` + Bildpipeline (`next/image`, Blur, ASSETS.json) | `components/media/photo-hero.tsx` (neu), `public/images/` | M | Assets P0 |
| 1.7 | Dashboard-Umbau D1, D4, D5, D8, D9, D13 | `app/(app)/page.tsx`, `components/dashboard/*` (vermutet) | M | 1.3, 1.6 |
| 1.8 | Route: Karten-`fitBounds` ohne Anreise, Marker-Stil, Sticky-Layout, Grid-Überlauf-Fix | `app/(app)/route/page.tsx`, `components/route/route-map.tsx` (vermutet) | M | – |
| 1.9 | `StationImage` mit Fallback-Kette Foto → Landschaftsklasse; Stadt-SVG nur Stadtstationen | `components/route/station-illustration.tsx` (vermutet „sky-city“) | S | 1.6 |

**Ergebnis Phase 1:** Neue Typografie überall, ruhige Shell, Foto-Hero auf Dashboard/Route, keine Systemsprache. Erwarteter Notensprung Ø 4,3 → ≈ 6,5.

### Phase 2 – Premium-Komponenten (P1, ≈ 7–9 PT)

| # | Maßnahme | Dateien (vermutet) | Aufwand | Abhängig von |
|---|---|---|---|---|
| 2.1 | `MediaCard`, `StatusDot`, `MissingInfo`, `SourceInfo`, `FactBar` | `components/ui/*` (neu) | M | 1.2 |
| 2.2 | Stationskarten + `RouteSegment` | `components/route/station-card.tsx`, `…/route-segment.tsx` | M | 2.1 |
| 2.3 | Stationsdetail: Hero, FactBar, eingebettete StayCard | `app/(app)/route/[id]/page.tsx` | M | 2.1, 2.4 |
| 2.4 | Unterkünfte: `StayCard`, `PaymentMeter`, `Sheet`-Detail, SegmentedControl | `app/(app)/stays/page.tsx`, `components/stays/*` | L | 2.1 |
| 2.5 | Buchungen: Timeline-Gruppierung, kompakte Zeilen, ⋯-Menü | `app/(app)/bookings/page.tsx`, `components/bookings/*` | M | 2.1 |
| 2.6 | KI-Guide: SourceInfo, Eingabe mobil, FilterRail | `app/(app)/guide/page.tsx` | S | 2.1 |
| 2.7 | Safari-Tracker: `SpeciesTile`, `ProgressRing`, Erfassen-Sheet | `app/(app)/sightings/page.tsx` | M | Assets A-01…A-05, A-S |
| 2.8 | Tagebuch: `JournalCard`, Feed-Gruppierung, Editor „Schreibmoment“, `AudioPlayer` | `app/(app)/journal/*`, `components/journal/*` | L | 2.1 |
| 2.9 | Galerie: Justified Grid, `Lightbox`, Gruppierung | `app/(app)/gallery/page.tsx`, `components/gallery/*` | L | 1.6 |
| 2.10 | Mobile: Bottom-Nav neu, FilterRail global, 2×2-Grids, Sheets statt Akkordeons | `components/layout/bottom-nav.tsx` | M | 1.4 |
| 2.11 | Sicherheit: Reihenfolge, Notfall-Karten, Tresor-Sheet | `app/(app)/safety/page.tsx` | M | 2.1 |

### Phase 3 – Feinschliff (P2, ≈ 4–5 PT)
- Ken-Burns, Hover-Lift, View-Transitions Station → Detail (reduced-motion beachten).
- Empty States (3 Typen), Skeletons in Komponentenform.
- Erinnerungsarchiv-Zeitachse, Familien-Avatar-Karten, Rollen-Matrix, Einstellungen gruppiert.
- Ausgaben: Währungs-Tabs, Kategorie-Balken.
- Wortmarke, OG-Bild, Favicon-Feinschliff.

### Phase 4 – Qualitätssicherung (1–1,5 PT)
- Playwright-Visual-Regression 390/768/1440 für alle Routen.
- axe-core / Lighthouse CI (Ziele Doc 07).
- Offline-Regressionstest, Finanz-Snapshot-Vergleich, Follower-Ansicht.

**Gesamtaufwand:** ≈ 17–21 Personentage (ohne Bildbeschaffung).

## 3. Abhängigkeitsgraph
```
Assets P0 ─┐
1.1 Fonts ─┼─► 1.3 PageHeader ─► 1.7 Dashboard
1.2 Tokens ┼─► 1.4 Shell ─► 2.10 Mobile Nav
           └─► 2.1 Basis-Komponenten ─► 2.2/2.3/2.4/2.5/2.6/2.8/2.11
1.6 PhotoHero ─► 1.7, 1.9, 2.9
1.5 Labels (unabhängig, früh)      1.8 Karte (unabhängig, früh)
```

## 4. Wiederverwendung vs. Neubau

| Bestehend (vermutet) | Entscheidung |
|---|---|
| Card, Button (Pill), Chip mit Zähler, EmptyState, Badge, TaskList, Inline-Aufgabenformular | ♻ verbessern (Tokens, Varianten), nicht neu schreiben |
| Station-Illustrations-SVGs | ♻ als Fallback behalten, Varianten ergänzen |
| RouteMap (MapLibre/Protomaps) | ♻ nur Bounds, Stil, Layout |
| Akkordeon Unterkünfte | ↺ durch Sheet ersetzen; Inhalt (Formulare, Zahlungen, Belege) als Unterkomponenten wiederverwenden |
| Dashboard „Reisebegleiter“-Grid | ✕ auf Desktop entfernen, Inhalte bleiben in Navigation erreichbar |
| Sync-Banner | ↺ durch Header-Indikator ersetzen (gleiche Datenquelle) |

## 5. Risiken
| Risiko | Gegenmaßnahme |
|---|---|
| Bilder erhöhen Offline-Speicher und LCP | 3 Breiten, AVIF, Precache-Budget 6 MB, SVG-Fallback |
| Tokens-Umbenennung bricht Klassen | Aliase (Doc 03 §10), schrittweise Migration |
| Fraunces wirkt zu „verspielt“ | `SOFT 0`, `WONK 0`; Alternative Cormorant/Newsreader vorbereitet |
| Zeitdruck (Abreise 13.10.) | Phase 1.1, 1.2, 1.5, 1.8, D8/D9 sind je ≤ 0,5 PT und risikoarm → als „Hotfix-Paket“ vor Abreise möglich; alles andere nach Rückkehr bzw. unterwegs nicht deployen |

## 6. Anschlussfähiger Implementierungsauftrag (Phase 1)

> **Auftrag: Premium-Redesign Phase 1 – Fundament**
>
> Arbeite im Repository der Namibia-&-Botswana-Reise-App auf einem neuen Branch `design/v2-phase1`. Grundlage sind `docs/design-audit/02_PREMIUM_DESIGN_VISION.md`, `03_DESIGN_SYSTEM_V2.md`, `04_SCREEN_REDESIGN_PLAN.md` und `07_ACCEPTANCE_CRITERIA.md`.
>
> 1. Verifiziere zuerst die vermuteten Dateipfade aus `06_IMPLEMENTATION_ROADMAP.md` §2 und aktualisiere die Tabelle.
> 2. Erstelle Playwright-Baseline-Screenshots aller 16 Routen in 390/768/1440 px.
> 3. Setze Phase 1 (1.1–1.9) um: Fraunces + Inter via `next/font`; Tokens V2 mit Aliasen; `PageHeader`; App-Shell (Top-Nav entfernen, Sidebar gruppieren, Sync-Banner → Header-Indikator); `lib/labels.ts` inkl. Pluralisierung; `PhotoHero` mit `next/image` und `public/images/ASSETS.json`; Dashboard D1/D4/D5/D8/D9/D13; Route-Karte `fitBounds` ohne Anreise + Grid-Überlauf-Fix; `StationImage`-Fallback.
> 4. Verwende nur Bilder mit dokumentierter Lizenz in `ASSETS.json`; solange keine vorhanden sind, nutze die SVG-Fallbacks und lasse die Bildslots vorbereitet.
> 5. **Nicht verändern:** Datenmodell, Supabase-Schema, RLS, Auth, Finanzberechnungen, Offline-Synchronisierung, Tresor-Kryptografie, Follower-Logik. Keine Funktion entfernen.
> 6. Prüfe gegen `07_ACCEPTANCE_CRITERIA.md` (Abschnitte A, B, C, F, G) und dokumentiere das Ergebnis mit Vorher/Nachher-Screenshots in `docs/design-audit/phase1/`.
> 7. Keine Commits, Pushes, Merges oder Deployments ohne meine ausdrückliche Freigabe. Liefere am Ende eine Zusammenfassung der geänderten Dateien, offene Punkte und eine Liste benötigter Bild-Assets.
