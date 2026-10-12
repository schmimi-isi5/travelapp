# Design V3: Umsetzungsstand

Stand 12.10.2026. Branch `design/v3-plan-angleichung` (aufbauend auf `main` mit Phase 1). Umgesetzt wurde das Paket `namibia-botswana-design-v3-claude-code.zip` und danach die Angleichung an das Plan-Design (P1 bis P9).

## Phase 1 (bereits live): Dashboard-Grundlage und eine Navigation
Siehe Git-Verlauf (PR #14).

## Angleichung an das Plan-Design (dieser Branch)
| ID | Umsetzung | Dateien |
|---|---|---|
| P1 Karte | Eigene illustrierte SVG-Karte: Länderumrisse mit Namens-Wasserzeichen, gepunktete orange Route, runde Foto-Pins, Wagen an der aktuellen Station (nur unterwegs), Frankfurt ausgeblendet, keine Fußnote. Pins und Beschriftungen werden in Bildschirmpixeln gelegt (12 px, nie überlappend; Pins rücken auseinander, zu enge Beschriftungen entfallen, der Name bleibt im Linknamen). | `src/components/trip-map-illustrated.tsx`, `src/lib/map/illustrated-layout.ts` |
| P2 Hero | Randloses Wüstenmotiv aus der Bibliothek (Sossusvlei), unten rechts abgerundet; Eyebrow aus den Reisedaten; „Willkommen zu unserer Reise“; „Noch n Tage bis zum Abflug“ (unterwegs „Tag x von y“, danach Dank); beide Aktionen mit Icons; Zitat in Handschrift (Caveat, selbst gehostet); Orts-Label mit Pin statt „Regionsmotiv“ (Hinweis im Tooltip). | `src/features/dashboard/travel-hero.tsx`, `src/app/fonts/` |
| P3 Wetter | Kachel mit Ort, Tag, Temperatur, Regenangabe, Sonnenauf- und -untergang; ohne Daten ehrlicher Hinweis; übrige Tipps unter „Mehr Tipps“; doppelter Punkt behoben. Es steht nie „sonnig“, weil es keine Bewölkungsdaten gibt. | `src/features/tips/weather-tile.tsx` |
| P4 Nächster Stopp | Foto mit Name, Pfeil-Button, Plakette „Tag n“, Datum; drei Info-Zeilen (Anreise, Übernachtung mit Nächten, Highlights) mit Hinweis ohne Unterkunft. | `src/features/dashboard/dashboard-sections.tsx` |
| P5 Raster | Reihen 5/5/3, 2/3 + 1/3, 1/3 + 2/3; Dreier-Kacheln entfernt; „Buchungen zu prüfen“ und „ohne Beleg“ als zwei benannte Badges in den Aufgaben; „Letzte Erinnerungen“ nur mit Medien. | `src/app/(main)/page.tsx` |
| P6 Impressionen | Weiße Karte, vier Kacheln mit Titel und Untertitel (Etosha, Sossusvlei, Divundu, Chobe zuerst), nur Landschaft und Tiere; Regionsmotiv als Tooltip. | `dashboard-sections.tsx`, `src/lib/media/places.ts` |
| P7 Aufgaben | Vier Einträge, Kategorie-Icon (aus dem Titel geraten), Fälligkeit, Dringlichkeitspunkt mit Text für Screenreader, „Nicht zugewiesen“ nur bei Dringlichkeit, Eingabe hinter einem Plus. | `dashboard-sections.tsx`, `src/features/common/action-checklist.tsx` |
| P8 Familie, Schnellzugriff | Avatare (Foto oder Initialen) mit Name und Rolle, „Einladen“; sechs Kacheln mit Zählern, „Dokumente“ dabei, rollenabhängig. | `dashboard-sections.tsx`, `src/components/avatar.tsx` |
| P9 Header, Sidebar | Suche (Archivsuche, auch Unterkünfte), Glocke, Profilmenü mit Abmelden und Sync-Status; Sidebar mit gefülltem aktivem Eintrag, Reihenfolge nach Plan, „Reiseplan“ und „Karte“, „Reiseführer“, Illustration mit Akazie und Spruch. | `src/components/app-header.tsx`, `app-shell.tsx`, `nav-items.ts`, `sidebar-art.tsx` |

## Weitere Phasen
- **Phase 3 (Module):** Alle Module laufen im neuen Rahmen und mit den gemeinsamen Bausteinen. Neu: `StateBlock` für die acht Zustände (laden, leer, Fehler, offline, Konflikt, kein Zugriff, Foto fehlt, unbekannt) mit Vorschau im Design-System; Karte und Reiseplan getrennt; Familie verlinkt Mitreisen, Galerie verlinkt Erinnerungen.
- **Funktionen:** Profilfoto (Migration 0008), Benachrichtigungen, Android-Teilen, Follower-Ansicht mit Ortsfotos (siehe `docs/DECISIONS.md` 38 bis 42).
- **Bilder:** strengere Filter, 34 ungeeignete Fotos auf der Produktion außer Betrieb, Lücken aufgefüllt.

## Abweichungen zum Plan-Design (verbleibend, bewusst)
Siehe `screenshots/after/vergleich-1536.jpg` (Plan links, Umsetzung rechts):
- **Hero-Motiv:** Das Plan-Design zeigt Dünen mit Köcherbaum. Wir zeigen das beste lizenzierte Sossusvlei-Foto der Bibliothek; die Wirkung hängt am Foto, nicht am Layout.
- **Foto-Pins und Karte:** Unsere Umrisse sind vereinfacht und handgezeichnet, nicht kartografisch genau; die Karte ist als Illustration gedacht, die echte Karte liegt unter „Karte“.
- **Wetter:** „Sonnig und trocken“ steht nicht da, weil es keine Bewölkungsdaten gibt; „Trocken“ kommt aus der Regenangabe. Die Kachel zeigt den ersten Tag der Station (heute nur, wenn heute dort Wetterdaten liegen).
- **Familienfotos:** Fotos erscheinen erst, wenn jemand eins wählt (Einstellungen, Mein Profil).
- **Namen und Zahlen** stammen aus den Daten (die Beispielnamen des Plan-Designs sind es nicht).
- **Kein Wasserzeichen-Bild in der Seitenleiste** über Akazie und Dünen hinaus; die Illustration ist eigener SVG-Code.

## Tests (12.10.2026)
Siehe Abschnitt „Tests“ in der Abschlussmeldung und `docs/IMPLEMENTATION_REPORT.md`. Neue Tests: Layout der Karte, Benachrichtigungen, Motivfilter (App und Pipeline), Wetter-Ausfall, Follower-Bilder (Unit und Backend), Profilfoto (RLS, Sync, Browser), Teilen (Browser), Plan-Design-Seiten (Browser, mit axe).

## Nicht geprüft
Echte Geräte (iPhone, Android), Teilen aus der Android-Galerie in der installierten App (nur im Chromium-Test), Wetter mit dem Owner-Konto über mehrere Tage, Verhalten der Foto-Pins mit sehr vielen Stationen.
