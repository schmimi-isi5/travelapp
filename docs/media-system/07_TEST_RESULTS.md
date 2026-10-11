# 07 Testergebnisse (Stand 11.10.2026, lokal)

| Prüfung | Ergebnis |
|---|---|
| `npm run lint`, `npm run typecheck`, `npm run build` | sauber |
| `npm test` (Vitest) | **216 bestanden** (darunter 18 Unit-Tests zu Orten, Lizenzschranke, Ortsbeleg, Bewertung, Zuordnung; 6 Pipeline-Tests; 70 Rechte-/Migrationstests, davon 5 neue zur Bibliothek) |
| `npm run test:backend` (echter lokaler Stack) | **57 bestanden**, 5 bewusst übersprungen (`not_configured`-Zweige). Neu: 4 Tests der Bibliothek mit echter Tabelle, echtem Speicher und echter App-Route |
| `npm run test:e2e` (Demo, Chromium, WebKit, Pixel 7, iPhone 14) | **111 bestanden**, 1 übersprungen (Offline-Karte in WebKit); Demo bleibt bei den Illustrationen |
| `npm run test:e2e:supabase` (App-Container + Stack) | **17 bestanden** (inkl. 2 Browsertests der Bildintegration) |
| Echter Importlauf | 11 Orte, 52 Bilder gespeichert, 46 mit Ortsbeleg, 6 Regionsmotive; Hero bei 10 von 11 Orten |
| Screenshots | `screenshots/` (24 Dateien): vorher/nachher für Dashboard, Route, Station (Sossusvlei) und Unterkünfte bei 390, 768 und 1440 px |

## Was die neuen Tests beweisen
- **Lizenzschranke:** NC, ND, GFDL, Fair Use, unbekannte Lizenzen, fehlender Urheber bei Namensnennungslizenzen und Dateien mit Einschränkungen werden nie gespeichert (Unit und Pipeline).
- **Ortsbeleg:** Dateikoordinaten außerhalb des Radius führen zum Verwerfen; Dateien ohne Koordinaten werden nur als Regionsmotiv zugelassen und in der App so beschriftet (Pipeline, Browser).
- **Idempotenz:** Zweiter Lauf gegen echte Datenbank und echten Speicher sucht, lädt und schreibt nichts (Backend). Teilweise Orte werden nur ergänzt, keine Datei doppelt.
- **Varianten:** WebP mit 1920/1200/800 px bzw. 800/320 px, ohne EXIF/GPS (Backend, `sharp`-Metadaten).
- **Rechte:** Angemeldete lesen nur freigegebene Zeilen, Besucher nichts, Clients können nicht schreiben, `approved` nur mit `license_verified` (RLS-Tests und echter Stack).
- **Auslieferung:** App-Route liefert unveränderliche WebP-Dateien von der eigenen Origin und verweigert Pfade außerhalb der Bibliothek (404).
- **Browser:** Hero, Stationskarte, Station und Galerie zeigen echte Bilder (geladen, `naturalWidth > 0`) von der eigenen Origin, mit Nachweis und Quellenlink; „Regionsmotiv“ bei nicht belegtem Ort; Axe-Prüfung (WCAG A/AA) auf Dashboard und Stationsseite mit Fotos ohne Verstöße.
- **Fallback und Rücknahme:** Wird die Freigabe entzogen, erscheint ohne Code-Änderung wieder die Illustration.
- **Offline:** Nach dem Vorwärmen laden die Titelbilder der Routenseite im Offline-Modus aus dem Service-Worker-Cache (Chromium).

## Nicht ausgeführt / nicht belegt
- Firefox (startet auf dem Entwicklungsrechner nicht); echte iPhones und Android-Geräte.
- Lighthouse/LCP-Messung der Fotoseiten; die Performance-Aussage beruht auf gemessenen Dateigrößen (siehe 06).
- Der Importlauf und die Bibliothek wurden **nicht in der Produktion** ausgeführt (Migration 0007 ist dort noch nicht angewendet).
- Anbieter außer Wikimedia Commons (kein Pexels-Test).
