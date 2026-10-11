# Hotfix-Paket (Etappe 1) – Ergebnis

Stand: 2026-10-11, Branch `design/v2-phase1`. Nicht committet, nicht deployt.

## Tatsächliche Pfade (statt der vermuteten)
| Audit | Repo |
|---|---|
| `app/(app)/…` | `src/app/(main)/…` |
| Karte `components/route/route-map.tsx` | `src/components/trip-map.tsx` (+ `trip-map-schematic.tsx` als Ersatzkarte) |
| Shell `components/layout/*` | `src/components/app-shell.tsx` |
| Tokens | `src/app/globals.css` (Tailwind 4, `@theme`) |
| Labels | neu: `src/lib/labels.ts` |
| Schriften | neu: `src/app/fonts/` (selbst gehostet, `next/font/local`) |

## Umgesetzt
| ID | Maßnahme | Stand |
|---|---|---|
| G9 | Fraunces (Überschriften) und Inter (UI) als selbst gehostete Variable Fonts, `font-display`; Gewicht der Überschriften ≤ 700 | erledigt (lokal statt `next/font/google`: kein Build-Zugriff auf Google, offline-tauglich) |
| 1.2 | Tokens V2 (teal, gold, sand, clay, savanna, ochre, stone, ink, Container, Schatten) neben den bestehenden Namen; `warn`, `danger`, `info` bewusst unverändert | erledigt |
| G10/1.5 | `lib/labels.ts`: `nights()` („1 Nacht/2 Nächte“), `persons()`, `roleLabel`, `driveSummary`; Technikbegriffe in Einladung, Familie, Einstellungen, Tagebuch, Audio, Kopfzeile ersetzt („Live-Version“, „KI-Anbieter: bereit“) | erledigt (Rest: nur Entwicklerhinweise im Demo-Modus) |
| R1/R7 | Karte: Ausschnitt nur über Stationen in Namibia/Botswana (Anreise bleibt als Marker), `ResizeObserver` → `map.resize()`, Grid `grid-cols-1` + `min-w-0` | erledigt |
| R5 | „ca. ? km · ca. unbekannt (Quelle unbekannt)“ entfällt, unbekannte Werte werden weggelassen | erledigt |
| D8/D9 | Wetter-, Offline-Status- und Datenherkunft-Karte vom Dashboard entfernt (Offline-Status zeigt der Header) | erledigt |
| G3 | Sync-Hinweis: Punkt + Wort im Kopf (`SyncIndicator`); das Banner bleibt nur für Offline, offene Änderungen und Konflikte | erledigt |
| B2/B3/A3 | Standardfarben `amber`/`blue` in Badges, Hinweisen und Banner durch Tokens ersetzt; `text-[11px]` → `text-xs`; Goldtext nur `gold-200` auf dunklem Grund | erledigt |

## Nicht angefasst (Schutzliste)
`git diff --stat main -- supabase src/lib/offline src/lib/domain/money.ts src/lib/db/documents.ts src/lib/follow src/lib/server src/app/api` ist leer.

## Prüfung
- Vitest 187, Demo-E2E 111 (inkl. Axe auf allen Hauptseiten bei 390 px), Produktiv-E2E 15: grün.
- `check-forbidden-strings`: 0 offene Treffer außer Entwicklerhinweis im Demo-Modus; `contrast-check`: alle vorgesehenen Paare AA.
- Vorher/Nachher (Route, Dashboard, Unterkünfte, 1280 px, echte Reise-Daten): `before/` und `after/` in diesem Ordner.

## Offen (Etappe 2, nicht Teil des Hotfix)
G1, G2, G4, G7, 1.6 (`PhotoHero`), D1–D5, D13, 1.9 (`StationImage`-Fallback: Anreise-Station zeigt noch die Stadtsilhouette), Bildslots mit Lizenzdokumentation, Phase 2/3. Die Basis-Screenshots aller 16 Routen in 390/768/1440 (`design-baseline.spec.ts`) brauchen den gespeicherten Login `.auth/state.json`.
