# Design V3: Umsetzungsstand (Phase 1, Dashboard und Navigation)

Stand 12.10.2026, Branch `design/v3-dashboard`, **nicht committet**. Paket: `namibia-botswana-design-v3-claude-code.zip` (Zielbild `02_clean_v2_TARGET.png`).

## Umgesetzt
- **Eine Hauptnavigation:** Die zweite Navigation in der Kopfzeile (Dashboard, Route, Unterkünfte, Tagebuch, Galerie) entfällt. Die Seitenleiste heißt jetzt „Hauptnavigation“, mobil bleibt die Tab-Leiste (`src/components/app-shell.tsx`).
- **Dashboard** (`src/app/(main)/page.tsx`, neue Bausteine in `src/features/dashboard/dashboard-sections.tsx`): Hero (unverändert, echtes Bibliotheksfoto oder Illustration), Eckdaten, „Unser nächster Stopp“ (Foto/Illustration, Datum, Unterkunft aus den Daten), „Unsere Route“ (schematische Karte, so beschriftet), Stationstipps mit Wetter (bestehend), „Reiseimpressionen“ (je eine Galerieaufnahme der nächsten Stationen aus der Bildbibliothek, Regionsmotive gekennzeichnet; ohne Bibliothek, z. B. Demo, entfällt der Streifen), „Offene Aufgaben“ (die ersten drei, Rest per „Alle n anzeigen“, alle bleiben abhakbar), Familie, sechs Schnellzugriffe (rollenabhängig), „Letzte Erinnerungen“.
- Überschriften der Abschnitte in der Display-Schrift (Fraunces, wie im bestehenden System).

## Bewusst nicht übernommen
- **Suchleiste und Profilmenü des Mockups:** Es gibt keine Suchfunktion, eine Attrappe wäre eine Pseudofunktion. Das Profil bleibt rechts oben wie bisher.
- **Wetter-Karte aus dem Mockup:** Das Wetter steckt in der bestehenden Tipps-Karte (echte Open-Meteo-Daten, kein Fake-Wetter).
- **Farb- und Schriftwerte des Pakets** (`DM Serif Display`, andere Hex-Werte): Das bestehende System (Fraunces, Tokens in `CLAUDE.design.md`) gilt weiter; die Werte liegen sehr nah beieinander.
- **Familienfotos/-namen aus dem Mockup:** Es werden nur die echten Mitglieder aus den Daten gezeigt.

## Noch offen (Phase 3 des Pakets)
Übertragung auf Route/Karte, Unterkünfte, Buchungen, Tagebuch, Galerie, Safari-Tracker, Ausgaben, Sicherheit, Familie, Archiv. Die Seiten funktionieren unverändert im neuen Rahmen, sind aber noch nicht im V3-Stil überarbeitet. Die Zustandsvorgaben (loading, empty, error, …) sind nicht neu vereinheitlicht.

## Tests (lokal, 12.10.2026)
Lint, Typecheck, Build ok; Playwright Demo (chromium, mobile-safari) 56 bestanden; Playwright gegen echtes Supabase 19 bestanden; horizontaler Überlauf bei 390/768/1440 px: keiner. Screenshots: `screenshots/before` (Ist-Zustand aus dem Paket) und `screenshots/after` (lokaler Teststand mit Bibliotheksfotos; die Vorschaubilder unten sind im Vollseiten-Screenshot teils noch nicht nachgeladen). Nicht durchgeführt: Prüfung auf echten Geräten, axe-Lauf eigens für das neue Dashboard (axe läuft im bestehenden a11y-Test über `/`, dieser ist grün).

## Medien
Es wurden keine neuen Fotos aus dem Paket übernommen (`references/` sind KI-Layoutvorlagen). Alle gezeigten Fotos stammen aus der Bildbibliothek mit Lizenznachweis (siehe `docs/media-system/`), Quellen auf `/settings/credits`.
