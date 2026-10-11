# 07 – Abnahmekriterien Premium-Design

Jedes Kriterium ist objektiv prüfbar (Messung, Zählung, automatisierter Test oder eindeutiger Sichtbefund). Prüfbreiten: **390 px, 768 px, 1440 px**. Kennzeichnung der Phase: [1] [2] [3].

## A – Typografie
| ID | Kriterium | Prüfung |
|---|---|---|
| A1 [1] | Fraunces und Inter werden als Webfont ausgeliefert (selbst gehostet) und tatsächlich gerendert. | DevTools → Rendered Fonts zeigt „Fraunces“/„Inter“ auf Windows, macOS, Android |
| A2 [1] | Alle Kapitel-H1/H2 nutzen `--font-display`; Werkzeug-H1 Inter. | Computed Style je Route |
| A3 [1] | Keine Textgröße < 12 px; keine Überschrift mit Gewicht > 700. | Skript über alle Textknoten |
| A4 [1] | Max. 9 Größen gemäß Skala (Doc 03 §3.2) im gesamten UI. | Skript: Set der `font-size`-Werte |
| A5 [2] | Beträge und Zeiten mit `tabular-nums`. | Computed Style in Unterkünfte/Buchungen/Ausgaben |

## B – Farbe & Kontrast
| ID | Kriterium | Prüfung |
|---|---|---|
| B1 [1] | Alle Text/Hintergrund-Paare ≥ 4,5 : 1 (≥ 3 : 1 für ≥ 24 px bzw. 19 px fett). | axe-core 0 Verstöße „color-contrast“ |
| B2 [1] | `#D4A373` wird nicht als Textfarbe auf Flächen heller als `#8A8A8A` verwendet. | grep `text-gold` + Sichtprüfung |
| B3 [1] | Keine Tailwind-Standardfarben `blue-*`, `slate-*`, `amber-*` in der UI (außer über semantische Tokens). | grep im Code |
| B4 [2] | Max. ein Statusbadge pro Karte; Status-Taxonomie mit genau 5 Zuständen. | Zählung je Karte |

## C – Bildsprache
| ID | Kriterium | Prüfung |
|---|---|---|
| C1 [1] | Dashboard-Hero zeigt Foto oder Landschaftsillustration einer **Naturstation**, nie eine Stadtsilhouette. | Sichtprüfung |
| C2 [1] | Hero-Höhe Desktop ≥ 56 vh, Mobil ≥ 60 vh (Dashboard). | Messung |
| C3 [2] | Jede Station, Unterkunft und Tierart hat eine Bildfläche (Foto oder spezifischer Fallback); keine Fallback-Illustration wird für mehr als 3 Stationen verwendet. | Zählung |
| C4 [1] | Jedes Rasterbild ist in `ASSETS.json` mit Quelle, Lizenz, Urheber und Alt-Text dokumentiert. | Skript: Abgleich `public/images` ↔ `ASSETS.json` |
| C5 [1] | Alle Bilder via `next/image` mit `sizes`; Hero `priority`, übrige `lazy`; Formate AVIF/WebP. | Netzwerk-Tab |
| C6 [1] | Text auf Foto erfüllt B1 an der Textposition (Overlay). | Kontrastmessung Pixelwert |

## D – Layout & Komponenten
| ID | Kriterium | Prüfung |
|---|---|---|
| D1 [1] | Genau drei Containerbreiten im Einsatz (`prose`, `content`, `wide`). | Computed `max-width` je Route |
| D2 [2] | Max. eine gefüllte Primäraktion pro Viewport-Höhe. | Sichtprüfung je Route/Breite |
| D3 [2] | Unterkünfte als Bildkarten-Raster (2 Sp. ≥ 768 px, 1 Sp. < 768 px). | Sichtprüfung |
| D4 [2] | Unterkunfts-Finanzblock: 2×2-Grid auf 390 px; Beträge identisch zum Stand vor Redesign. | Snapshot-Vergleich Beträge (13 Unterkünfte) |
| D5 [2] | Keine Wiederholung von „unbekannt“-Feldern; fehlende Angaben als **eine** `MissingInfo`-Zeile. | Zählung „unbekannt“ pro Karte ≤ 1 |
| D6 [3] | Empty States in 3 Typen; kein Bereich zeigt mehr als einen Leerzustand gleichzeitig. | Sichtprüfung Ausgaben/Tagebuch/Galerie/Tracker |
| D7 [3] | Skeletons in Komponentenform, kein Vollseiten-Spinner. | Netzwerk-Drosselung „Slow 4G“ |

## E – Mobile
| ID | Kriterium | Prüfung |
|---|---|---|
| E1 [1] | Kein horizontaler Überlauf auf 360/390 px auf allen Routen (`scrollWidth === clientWidth`). | Playwright auf echtem Mobile-Viewport |
| E2 [2] | Touch-Ziele ≥ 44×44 px. | axe „target-size“ / Skript |
| E3 [2] | Filter in einer Zeile (FilterRail/SegmentedControl), kein Umbruch. | Sichtprüfung 390 px |
| E4 [2] | Dashboard mobil: Hero, nächste Unterkunft und Aufgaben innerhalb von 1,5 × Viewport-Höhe; Gesamthöhe ≤ 2 400 px. | Messung |
| E5 [2] | KI-Guide-Eingabefeld ≥ 80 % Breite auf 390 px. | Messung |
| E6 [2] | Bottom-Nav mit aktivem Zustand für jede Route (auch Mehr-Unterseiten markieren „Mehr“). | Sichtprüfung |

## F – Navigation & IA
| ID | Kriterium | Prüfung |
|---|---|---|
| F1 [1] | Desktop hat genau **eine** Primärnavigation (Sidebar); kein Ziel ist auf einer Seite doppelt verlinkt (außer Inhalts-Deeplinks). | Link-Zählung Dashboard |
| F2 [1] | Jede Route hat einen sichtbaren aktiven Navigationszustand. | 16 Routen prüfen |
| F3 [1] | Alle 16 bisherigen Routen bleiben erreichbar (max. 2 Klicks von der Startseite). | Link-Checker |
| F4 [1] | Kein dauerhaftes Sync-Banner; Sync-Status als Header-Indikator mit Textalternative. | Sichtprüfung + Screenreader |

## G – Sprache & Inhalte
| ID | Kriterium | Prüfung |
|---|---|---|
| G1 [1] | Keine der folgenden Zeichenketten erscheint in der UI (außer Einstellungen → Erweitert): `user_entered`, `unknown`, `running`, `Supabase`, `Row-Level-Security`, `members`, `owner`, `Provider`, `Demo-Daten`, `Datensätze`. | Volltextsuche im gerenderten DOM aller Routen |
| G2 [1] | Korrekte Pluralformen („1 Nacht“, „2 Nächte“); kein doppelter Punkt („Min..“). | Regex-Test |
| G3 [1] | Unbekannte Fahrtwerte werden ausgelassen statt „ca. ? km“. | Volltextsuche „?“ in Route |
| G4 [1] | Durchgängig Deutsch, Du-Form. | Stichprobe + Volltextsuche |

## H – Performance & Barrierefreiheit
| ID | Kriterium | Prüfung |
|---|---|---|
| H1 [4] | Lighthouse mobil: Performance ≥ 85, Accessibility ≥ 95, Best Practices ≥ 95. | Lighthouse CI |
| H2 [4] | LCP ≤ 2,5 s (Slow 4G, Mid-Tier-Gerät) auf Dashboard und Route. | WebPageTest/Lighthouse |
| H3 [4] | CLS ≤ 0,05 (Bilder mit festen Ratios). | Lighthouse |
| H4 [3] | `prefers-reduced-motion` deaktiviert alle nicht-essentiellen Animationen. | Emulation |
| H5 [4] | Offline-Modus: Dashboard, Route, Station, Sicherheit renderbar mit Bild-Fallback. | DevTools Offline |

## I – Funktionsschutz (Regression)
| ID | Kriterium | Prüfung |
|---|---|---|
| I1 | Keine Änderungen in Datenmodell, Migrations, RLS, Auth-Konfiguration. | `git diff` auf betroffene Verzeichnisse leer |
| I2 | Finanzwerte aller Unterkünfte/Buchungen vor/nach identisch. | JSON-Snapshot-Vergleich |
| I3 | Offline-Queue: Aufgabe offline anlegen → online → synchronisiert, kein Konflikt. | manueller Test |
| I4 | Tresor: Dokument verschlüsselt speichern und öffnen. | manueller Test |
| I5 | Follower-Link zeigt nur freigegebene Inhalte ohne Ortsdaten. | manueller Test |
| I6 | Alle bestehenden Unit-/E2E-Tests grün. | CI |

## J – Gesamturteil
Abnahme Phase 1, wenn A1–A4, B1–B3, C1, C2, C4–C6, D1, E1, F1–F4, G1–G4 und I1–I6 erfüllt sind. Abnahme Gesamt-Redesign, wenn zusätzlich alle [2]- und [3]-Kriterien erfüllt sind und ein Re-Audit nach Doc 01 einen Durchschnitt ≥ 8,0 ergibt (keine Kategorie < 7).
