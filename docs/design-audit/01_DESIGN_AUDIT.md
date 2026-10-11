# 01 – Design-Audit: Namibia & Botswana Reise-App

**Untersuchte Anwendung:** https://reise.schmeckseler.de (Produktivumgebung, eingeloggt als Owner)
**Datum der Analyse:** 11. Oktober 2026 (zwei Tage vor Abreise)
**Methode:** Live-Inspektion im Browser (Claude in Chrome), DOM- und CSS-Analyse der ausgelieferten Next.js-Bundles, Kontrastmessung nach WCAG 2.2, Vergleich mit sechs Referenzportalen.

---

## 0. Rahmen, Methode und Einschränkungen

### 0.1 Was tatsächlich geprüft wurde (✅ = verifiziert)

| Bereich | Route | Desktop | Tablet | Mobile | Bemerkung |
|---|---|---|---|---|---|
| Dashboard | `/` | ✅ | ✅ | ✅ | inkl. „Mehr“-Menü mobil |
| Reiseplan / Route | `/route` | ✅ | ✅ | ✅ | inkl. MapLibre-Karte |
| Stationsdetail | `/route/[id]` (Sossusvlei) | ✅ | – | ✅ | |
| Unterkünfte | `/stays` | ✅ | ✅ | ✅ | Akkordeon geöffnet, Finanzblock geprüft |
| Buchungen | `/bookings` | ✅ | – | ✅ | |
| Reisetagebuch | `/journal` | ✅ | – | ✅ | **leer** – Editor (Neuer Eintrag) geöffnet, nicht gespeichert |
| Galerie | `/gallery` | ✅ | ✅ | – | **leer** – Raster/Lightbox nicht prüfbar |
| KI-Guide | `/guide` | ✅ | – | ✅ | keine Anfrage abgeschickt |
| Safari-Tracker | `/sightings` | ✅ | – | ✅ | **leer** (0 Sichtungen) |
| Ausgaben | `/expenses` | ✅ | – | – | **leer** |
| Sicherheit / Dokumente | `/safety` | ✅ | – | – | Tresor leer |
| Familienbereich | `/family` | ✅ | – | – | nur 1 Mitglied |
| Mitreisen (Follower) | `/followers` | ✅ | – | – | kein Link vorhanden |
| Erinnerungsarchiv | `/archive` | ✅ | – | – | 31 Treffer (Stationen/Buchungen) |
| Offline & Sync | `/offline` | ✅ | – | – | |
| Einstellungen | `/settings` | ✅ | – | – | Screenshot nicht abgelegt (enthält E-Mail-Adresse) |

### 0.2 Einschränkungen (bewusst dokumentiert)

1. **Kein Zugriff auf das Repository.** Diese Sitzung war nicht mit dem Rechner verbunden, auf dem der Code liegt. Die technische Analyse stützt sich auf das ausgelieferte HTML/CSS/JS (Tailwind-v4-Tokens in `:root`, Klassennamen im DOM, Next.js-Chunks). Dateipfade in Dokument 06 sind **abgeleitet und als Annahme markiert** – vor der Umsetzung per `grep` verifizieren.
2. **Viewport-Emulation.** Das Browserfenster ließ sich nicht verkleinern (maximiert), und die App verbietet Einbettung per `iframe` (`frame-ancestors 'none'`, `X-Frame-Options: DENY`). Tablet (768 px) und Mobile (390 px) wurden deshalb emuliert, indem die Media-Queries der geladenen Stylesheets für die Zielbreite ausgewertet und der `body` auf diese Breite begrenzt wurde. Das bildet CSS-Breakpoints korrekt ab, **nicht** aber JavaScript-gesteuertes Verhalten (`matchMedia`, Karten-Resize). Befunde, die davon betroffen sein könnten, sind als **„Verdacht – auf echtem Gerät prüfen“** markiert. In gescrollten Mobil-Screenshots sind fixierte Elemente (Bottom-Navigation) ausgeblendet.
3. **Desktop-Breite.** Der reale Viewport betrug 1 534 CSS-px (≈ Klasse „1440 px Desktop“; kein Breakpoint liegt zwischen 1 440 und 1 534 px).
4. **Leere Module.** Tagebuch, Galerie, Safari-Tracker und Ausgaben enthalten noch keine Daten. Bewertet wurden Leerzustände, Formulare und Struktur; **Bildraster, Lightbox, Audio-Player und Diagramme konnten nicht im befüllten Zustand geprüft werden.** Es wurden keine Testdaten angelegt (keine Datenänderungen in der Audit-Phase).
5. **Login-Seite** wurde nicht geprüft (hätte Abmelden erfordert).

### 0.3 Technische Basisbefunde (verifiziert)

| Befund | Beleg |
|---|---|
| Framework | Next.js App Router (`/_next/static/chunks/main-app-*.js`, `self.__next_f`) |
| CSS | Tailwind CSS v4 (OKLCH-Farbvariablen, `--spacing:.25rem`, `@theme`-Tokens in `:root`) |
| Eigene Tokens vorhanden | `--color-deep #0f3d4e`, `--color-deep-700 #14566d`, `--color-deep-50 #e6f0f3`, `--color-gold #d4a373`, `--color-sand #f5e6d3`, `--color-sand-50 #fbf6ee`, `--color-clay #c65a3a`, `--color-clay-strong #a8472b`, `--color-ink #1f2937`, `--color-muted #566376`, `--color-line #e5dccd`, `--color-warn/danger/info`, `--radius-md 12px / lg 16px / xl 24px` |
| **Schrift** | `--font-sans: Inter, …` – **Inter wird nicht geladen** (kein `@font-face`, kein Font-Preload). Auf Windows rendert die App in **Segoe UI** (per Canvas-Messung verifiziert). **Es gibt keine Display-Schrift.** |
| Bilder | Auf dem Dashboard existiert genau **ein** `<img>`: `/icons/icon.svg` (150×150). Alle „Bilder“ sind inline-SVG-Illustrationen. |
| Karte | MapLibre GL + Protomaps, OSM-Daten vom eigenen Server, offline speicherbar |
| CSP | `img-src 'self' data: blob: https://api.reise.schmeckseler.de` → externe Bild-CDNs sind blockiert; Fotos müssen selbst gehostet werden (wichtig für Asset-Plan). |
| Typo-Streuung Dashboard | 8 Schriftgrößen (11/12/14/15/16/18/20/48 px), 5 Gewichte (400–800), 3 verschiedene Textgrautöne (ink `#1f2937`, Tailwind slate-700 `#334155`, muted `#566376`) |

---

## 1. Gesamtbewertung

| # | Kategorie | Note (1–10) |
|---|---|---|
| 1 | Visuelle Gesamtqualität | **4** |
| 2 | Emotionale Wirkung & Reisegefühl | **3** |
| 3 | Qualität der Bildsprache | **2** |
| 4 | Typografie | **3** |
| 5 | Farben & Kontraste | **6** |
| 6 | Layout & Weißraum | **5** |
| 7 | Konsistenz des Design-Systems | **6** |
| 8 | Mobile User Experience | **5** |
| 9 | Navigation & Informationsarchitektur | **4** |
| 10 | Qualität der UI-Komponenten | **5** |
| | **Durchschnitt** | **4,3 / 10** |

**Kurzurteil:** Die App ist funktional sorgfältig, ehrlich im Umgang mit unsicheren Daten und technisch solide gebaut (Offline, RLS, Verschlüsselung). Gestalterisch ist sie ein **sauberes, aber generisches Verwaltungs-Dashboard in Safari-Farben**. Das Designkonzept (großflächige Fotografie, charaktervolle Display-Schrift, editoriale Reisekarten) ist in seinen drei tragenden Säulen **nicht umgesetzt**: Es gibt keine Fotografie, keine Display-Schrift und keine editoriale Seitenkomposition. Die Farbpalette ist das einzige Element des Konzepts, das sichtbar angekommen ist – und sie wird durch Systemhinweise, Statusbadges und Warnboxen überlagert.

Der Abstand zu andBeyond/Wilderness liegt weniger in Details als in der **Grundentscheidung**: Die Referenzen führen mit Bild und Typografie und ordnen Funktion darunter an. Die App führt mit Formularen, Badges und Disclaimern.

---

## 2. Die zehn größten gestalterischen Schwächen

### S1 – Keine Fotografie; Vektorillustrationen ersetzen das gesamte Bildkonzept (P0)
- **Beleg:** Einziges `<img>` im Dashboard ist das Logo. Hero = SVG mit Verlauf, Kreis und Rechtecken (`desktop/01_dashboard_hero.jpg`). Die Rechtecke sind eine **Stadtsilhouette** („sky-city“) – für eine Afrika-Reise das falsche erste Bild.
- Stationen: 9 von 14 Stationen (Erongo ×2, Etosha Süd/Ost, Rundu, Divundu, Kasane, Nata, Maun) zeigen **dieselbe** Savannen-Komposition mit Akazie und Tiersilhouette, 7 davon farbidentisch (`desktop/05_route_liste_mitte.jpg`, `06_route_ende.jpg`). Windhoek nutzt dieselbe Stadtsilhouette wie der Frankfurt-Abflug (`04_route_liste_karte.jpg`).
- Unterkünfte, Buchungen, Safari-Tracker, Archiv: **gar keine Bildfläche**.
- **Wirkung:** Die App kann das Versprechen „emotionale Namibia-Fotografie“ nicht einlösen; Sossusvlei, Etosha und Okavango sehen austauschbar aus.

### S2 – Typografie ohne Charakter; Webfont wird nicht geladen (P0)
- **Beleg:** `--font-sans: Inter` ohne `@font-face` → Rendering in Segoe UI (Windows) bzw. SF/Roboto auf Mobilgeräten. Alle Überschriften (H1 48 px / 800) in derselben Groteskschrift. Keine Serif-/Display-Schrift.
- Eyebrow „DEIN NÄCHSTER REISETAG“: 12 px, Gold `#d4a373` auf hellem Verlauf → **Kontrast ≈ 1,2 : 1** (gemessen gegen den oberen Hero-Verlauf; auf Weiß 2,26 : 1). Auf Mobil kaum lesbar (`mobile/01_dashboard_hero.jpg`).
- **Wirkung:** Plattformabhängiges Erscheinungsbild; H1 wirkt wie ein Admin-Titel, nicht wie ein Reisemagazin.

### S3 – Dreifache, inkonsistente Navigation (P0)
- **Beleg (Desktop):** Top-Navigation (5 Punkte) + linke Sidebar (14 Punkte) + Dashboard-Kachelraster „Unser Reisebegleiter“ (14 Kacheln) zeigen weitgehend **dieselben Ziele dreimal** (`desktop/01`, `03_dashboard_reisebegleiter_grid.jpg`).
- Die Top-Navigation hat für 9 der 14 Module **keinen aktiven Zustand** (z. B. `/bookings`, `/guide` – `desktop/16_buchungen.jpg`, `18_ki_guide.jpg`).
- Galerie ist auf Desktop Hauptnavigation, auf Mobil unter „Mehr“ versteckt (`mobile/04_mehr_menue.jpg`). „Abmelden“ steht im Mehr-Menü als erstes Element über allen Modulen.
- Sidebar 14 Einträge gleichrangig, ohne Gruppierung (Reise / Erinnern / Organisation / System).

### S4 – Karte zeigt den falschen Ausschnitt (P0)
- **Beleg:** Auf `/route` zeigt die Karte überwiegend leere Fläche, eine gestrichelte Flugroute und die Beschriftung „GABUN“ am unteren Rand – nicht die Namibia-Botswana-Rundreise; Stationsmarker sind nicht sichtbar (`desktop/04_route_liste_karte.jpg`, `mobile/06_route_karte.jpg`). Ursache vermutlich: `fitBounds` schließt Frankfurt (Station 01) ein.
- Unter der Karte stehen zwei Erklärtexte und ein „Entfernen“-Button für Offline-Kacheln – technisch korrekt, gestalterisch dominanter als die Karte selbst.

### S5 – System- und Entwicklersprache in der Oberfläche (P0)
- **Belege:**
  - „Quelle: user_entered“ und „Min..“ (doppelter Punkt) – Stationsdetail (`desktop/07_station_sossusvlei_oben.jpg`)
  - Englische Badges „unknown“ bei Aktivitäten (`08_station_sossusvlei_unten.jpg`)
  - „Rechte werden in der Datenbank per Row-Level-Security durchgesetzt“ – Familie (`24_familie.jpg`)
  - „Server: Supabase“, „Letzter Lauf: übersprungen (running)“, „members · geändert“ – Offline & Sync (`28_offline_sync.jpg`)
  - Rolle „owner“ (klein, englisch) im Header
  - Dashboard-Karten „Offline-Status“ und „Datenherkunft: 0 von 53 Datensätzen sind Demo-Daten“ (`02_dashboard_aufgaben_status.jpg`)
  - Dauerhaftes blaues Banner „Synchronisiere …“ auf **jeder** Seite (32 px Höhe, alle Screenshots), obwohl der Status „0 in Warteschlange“ meldet.
  - Grammatik: „1 Nächte“ (alle 1-Nacht-Unterkünfte, `09_unterkuenfte_liste.jpg`).

### S6 – Unterkünfte und Buchungen als Verwaltungsliste; Status „unbekannt“ dominiert (P0/P1)
- **Beleg:** 13 Unterkünfte als Akkordeonzeilen ohne Bild; jede trägt dasselbe Badge „unbekannt“ (`09`, `10`). Aufgeklappt: Formularfelder „Buchungsreferenz unbekannt / Kontakt unbekannt / Zahlung fällig unbekannt“, Restbetrag „unbekannt“ (`11`).
- Filterzeile „Offen 0 · Teilbezahlt 0 · Bezahlt 0 · Klärbedarf 13“ – drei von fünf Filtern sind leer; die eigentliche Information („alles ist noch zu klären“) wird nicht als Aufgabe, sondern als Zählerei vermittelt.
- Buchungskarten wiederholen „Referenz: unbekannt · Anbieter: unbekannt“ und „Kein Nachweis hinterlegt“ 17-mal (`16`, `17`).
- **Wirkung:** Das wichtigste Planungsmodul vermittelt Unsicherheit statt Vorfreude; Hotelnamen wie „Island Lodge“ oder „Hakusembe Tented Camp“ verschwinden in grauem Text.

### S7 – Badge- und Disclaimer-Inflation (P1)
- **Beleg:** KI-Guide: jede Karte trägt drei identische Badges („Redaktionell kuratiert“, „Aktualität nicht geprüft“, „Offline verfügbar“) plus eine gelbe Warnbox oben (`18`, `19`). Sicherheit wiederholt dieselben Karten (`22`). Stationsdetail: „Angaben nicht geprüft“ + „Highlights sind Beispielangaben ohne Quelle …“.
- **Wirkung:** Visuelles Rauschen; echte Warnungen (z. B. Platzhalter-Notfallnummern) verlieren ihr Gewicht.

### S8 – Dashboard ohne klare Hierarchie und ohne Reisegefühl (P0)
- **Beleg:** Unter dem Hero drei gleich große Kennzahlenkarten, davon zwei mit trivialem Inhalt („Abreise 13. Oktober 2026“ wiederholt den Hero, „Reiseziele: Namibia & Botswana“ wiederholt den App-Namen). Aufgabenliste mit ~100 px Leerraum unter dem Eingabefeld; rechte Spalte mit vier Systemkarten (Belege, Wetter „nicht verfügbar“, Offline-Status, Datenherkunft). „Letzte Erinnerungen: Noch keine Medien.“ als einzeiliger Text.
- Gefordert, aber **nicht vorhanden**: nächste Unterkunft mit Foto, Familienprofile, KI-Tagesempfehlung, Countdown-Erlebnis.

### S9 – Generische, austauschbare Leerzustände (P1)
- **Beleg:** Tagebuch, Galerie, Safari-Tracker, Ausgaben, Mitreisen nutzen denselben gestrichelten Kasten mit Icon im Kreis (`13`, `15`, `20`, `21`, `25`). Ausgaben zeigt zusätzlich „Noch keine Ausgaben.“ **und** einen Leerzustand „Keine Ausgaben“ **und** eine leere Karte „Kategorien“ ohne Inhalt.
- Gerade zwei Tage vor Abreise wären das die Momente, um Vorfreude zu erzeugen (z. B. „Euer erstes Kapitel beginnt am 13. Oktober in Windhoek“).

### S10 – Mobile: zu lang, zu gestapelt, Engstellen (P1)
- **Belege (emuliert, 390 px):**
  - Dashboard 3 582 px hoch (≈ 4,2 Bildschirmhöhen); drei Kennzahlenkarten je volle Breite gestapelt (`mobile/01`, `02`).
  - Finanzblock einer Unterkunft: vier Beträge untereinander statt 2×2 (`mobile/09_unterkunft_finanzen.jpg`).
  - Filterchips brechen auf 2–3 Zeilen um (Unterkünfte, Buchungen; `mobile/08`, `10`).
  - KI-Guide: Eingabefeld auf ~160 px gequetscht, Platzhalter abgeschnitten (`mobile/11`).
  - Buchungskarte: Aktionsbuttons umbrechen, Löschen-Icon steht allein in einer dritten Zeile (`mobile/10`).
  - Safari-Tracker: 15 Artenchips füllen den gesamten ersten Bildschirm (`mobile/12`).
  - **Verdacht – auf echtem Gerät prüfen:** Route-Liste läuft horizontal über (Karten rechts abgeschnitten, `mobile/05_route.jpg`). Ursache: Grid ohne `grid-cols-1`/`minmax(0,1fr)`, in dem die Kartenleinwand eine feste Breite (474 px) trägt; zusätzlich `truncate`-Titel.

### Weitere Einzelbefunde
- **Inhaltsbreiten ohne erkennbare Regel (gemessen `max-width`):** Tagebuch und Mitreisen 768 px, Unterkünfte und Erinnerungsarchiv 896 px, Galerie/Route/Dashboard 1 152 px – der Inhaltsblock „springt“ beim Seitenwechsel, und die Breite folgt nicht dem Seitentyp (Lesen vs. Sammlung vs. Werkzeug).
- **Primärbutton-Platzierung** wechselt: rechts neben H1 (Route, Galerie), unter H1 (Ausgaben), im Formular (Familie).
- **Tagebuch-Editor** (`14_tagebuch_neuer_eintrag.jpg`) ist ein Standardformular (Titel, Datum, Selects, Textarea) – kein „Schreibmoment“; positiv: Sprachmemo-Button in Clay und Mikrofon-FAB auf Mobil.
- **Safari-Tracker:** Arten nur als Textchips, ohne Tierbild/Illustration; „Nashorn (Spitzmaulnashorn)“ sprengt das Chipraster.
- **Erinnerungsarchiv:** 31 Treffer als gleichförmige Textkarten mit unterstrichenen Titeln; keine Zeitachse, keine Gruppierung nach Tag/Station (`26`, `27`).

---

## 3. Bewertung je Kategorie

### 3.1 Visuelle Gesamtqualität – 4/10
- **Ist:** Saubere Karten (Radius 16 px, feine Linie `#e5dccd`, weicher Schatten), warmer Sandhintergrund, konsistente Lucide-Icons in Gold-Kreisen.
- **Schwächen:** Keine Bildebene, keine typografische Spannung, alle Seiten folgen demselben Muster „H1 + Untertitel + Button + Kartenstapel“. Kein Seitentyp hebt sich ab.
- **Belege:** alle Desktop-Screenshots; besonders `09`, `16`, `18`.
- **Ziel:** Drei klar unterscheidbare Seitentypen: *Editorial* (Dashboard, Route, Station, Tagebuch, Erinnerungen), *Kollektion* (Galerie, Unterkünfte, Tracker), *Werkzeug* (Ausgaben, Sicherheit, Familie, Sync, Einstellungen).
- **Maßnahmen:** Fotografie-Layer (S1), Display-Schrift (S2), Seitentyp-Templates (Doc 04).
- **Priorität:** P0 · **Aufwand:** M–L (5–8 PT inkl. Assets)

### 3.2 Emotionale Wirkung – 3/10
- **Ist:** Countdown „Abreise in 2 Tagen“ ist der einzige emotionale Moment.
- **Schwächen:** Hero-Motiv Stadt statt Wüste; keine Menschen/Familie; „Synchronisiere …“ und Systemkarten brechen die Stimmung.
- **Ziel:** Jeder Einstieg (Dashboard, Station, Tagebuch) beginnt mit einem Ortsbild und einem Satz, der die Familie anspricht.
- **Maßnahmen:** Dashboard-Hero mit Ortsfoto der nächsten/aktuellen Station; Familien-Avatare im Hero; Systemstatus in dezenten Header-Indikator verlagern.
- **Priorität:** P0 · **Aufwand:** M (3 PT)

### 3.3 Bildsprache – 2/10
- **Ist:** 5 SVG-Varianten (Stadt, Dünen, Ozean, Savanne, Fluss) für 14 Stationen; keine Fotos.
- **Ziel:** Je Station ein kuratiertes Hero-Foto (3:2/16:9), je Unterkunft ein Foto (4:3), je Tierart ein Bild (1:1). SVGs bleiben als Offline-/Fallback-Ebene.
- **Maßnahmen:** siehe Doc 05 (Asset-Plan) und Komponente `StationImage` mit Fallback-Kette Foto → Illustration.
- **Priorität:** P0 · **Aufwand:** M (Code 2 PT) + Asset-Beschaffung

### 3.4 Typografie – 3/10
- **Ist:** Systemschrift-Fallback, H1 48/48 px 800, H2 18 px 700, Eyebrow 12 px uppercase gold.
- **Schwächen:** Keine Display-Schrift, Zeilenhöhe der H1 1,0 bei 48 px zu eng für mehrzeilige Titel, 8 Größen ohne Skala, Eyebrow unlesbar.
- **Ziel:** Serif-Display (Fraunces) für H1/H2/Zitate, Inter (tatsächlich geladen) für UI; modulare Skala 1,25.
- **Priorität:** P0 · **Aufwand:** S (1 PT) – größter Hebel pro Aufwand.

### 3.5 Farben & Kontraste – 6/10
- **Ist:** Tokens deep/gold/sand/clay vorhanden und konsistent eingesetzt. Gemessen: Weiß auf Deep 11,7 : 1 ✅, Deep auf Gold-Button 5,2 : 1 ✅, Muted auf Sand-50 5,7 : 1 ✅, Clay auf Weiß 4,26 : 1 ⚠️ (knapp unter 4,5 für Fließtext), Gold auf Weiß 2,26 : 1 ❌.
- **Schwächen:** Gold als Textfarbe nicht barrierefrei; Mischung von Tailwind-Standardfarben (slate, amber, blue für Info/Sync-Banner) mit eigener Palette – das blaue Sync-Banner und die blaue Info-Box auf `/route` fallen farblich aus dem System.
- **Ziel:** Gold-Textton `gold-700 #8F5F2E` (5,5 : 1), semantische Statusfarben aus der Palette (Doc 03).
- **Priorität:** P1 · **Aufwand:** S (0,5 PT)

### 3.6 Layout & Weißraum – 5/10
- **Ist:** Großzügige Kartenabstände, Content-Spalte zentriert.
- **Schwächen:** 3 Inhaltsbreiten (768/896/1152 px) ohne Bezug zum Seitentyp; Leerraum an falschen Stellen (Aufgabenkarte unten leer, Route-Karte mit leerer Fläche), zu wenig Raum oberhalb von Sektionsüberschriften; Dashboard-Raster 2/3 + 1/3 mit gleich gewichteten Karten.
- **Ziel:** Ein 12-Spalten-Raster mit zwei Containerbreiten (`content 72rem`, `prose 42rem`), vertikaler Rhythmus 8-px-Basis, Sektionsabstand 64/96 px.
- **Priorität:** P1 · **Aufwand:** M (2 PT)

### 3.7 Konsistenz des Design-Systems – 6/10
- **Ist:** Wiederkehrende Komponenten (Card, Pill-Button, Chip mit Zähler, EmptyState, Badge) sind erkennbar einheitlich.
- **Schwächen:** Badges in 5+ Farbvarianten ohne Semantik-Regel; drei Graustufen für Text; Primäraktion mal oben rechts, mal unten links; Sprache DE/EN gemischt.
- **Ziel:** Token-Ebenen (Basis → Semantik → Komponente), Badge-Taxonomie mit max. 5 Zuständen.
- **Priorität:** P1 · **Aufwand:** M (2 PT)

### 3.8 Mobile UX – 5/10
- **Ist:** Bottom-Navigation mit 5 Zielen, Sticky-Header, Mikrofon-FAB im Tagebuch – gute Grundlage.
- **Schwächen:** siehe S10.
- **Ziel:** Mobile-first-Kompositionen: horizontale Scroll-Rails für Kennzahlen und Filter, 2×2-Finanzgrid, Bottom-Sheets statt Akkordeons, Dashboard ≤ 2,5 Bildschirmhöhen bis „Reisebegleiter“.
- **Priorität:** P0 (Überlauf) / P1 (Rest) · **Aufwand:** M (3 PT)

### 3.9 Navigation & IA – 4/10
- **Ist / Schwächen:** siehe S3. Zusätzlich: Buchungen und Unterkünfte sind zwei Module, obwohl Unterkünfte fachlich Buchungen sind (Filter „Hotel 0“ in Buchungen verweist ins Leere).
- **Ziel:** Desktop: eine Navigation (Sidebar gruppiert, Header nur Marke + Suche + Familie + Sync-Status). Mobil: 5 Tabs „Heute · Route · Erinnern (Tagebuch+Galerie) · Unterkünfte · Mehr“. Querverweis „Unterkünfte“ als Tab in „Buchungen“ oder umgekehrt (nur UI, kein Datenmodell-Eingriff).
- **Priorität:** P0 · **Aufwand:** M (2 PT)

### 3.10 UI-Komponenten – 5/10
- **Ist:** Solide Basiskomponenten, gute Fokusflächen, Formulare beschriftet, Touch-Ziele überwiegend ≥ 40 px (9 Elemente < 40 px auf dem Dashboard, v. a. Textlinks).
- **Schwächen:** Keine Bildkarten-Komponente, kein Status-Stepper, Akkordeon für komplexe Unterkunftsdaten, Selects im Browser-Standardstil, Filter-Select „Alle Stationen“ über die volle Breite (Tagebuch, Tracker).
- **Ziel:** Neue Komponenten `MediaCard`, `StayCard`, `PaymentMeter`, `StatusStep`, `StationRail`, `SpeciesTile`, `JournalCard`, `AudioPlayer`, `Lightbox`, `SegmentedControl`.
- **Priorität:** P1 · **Aufwand:** L (5 PT)

---

## 4. Seitenweise Kurzbefunde

| Seite | Stärken | Wichtigste Mängel | Screenshot |
|---|---|---|---|
| Dashboard | Countdown, klare Primäraktionen | Stadt-Hero, triviale KPIs, Systemkarten, Navigation doppelt | desktop/01–03, tablet/01–02, mobile/01–04 |
| Route | Stationsnummer + Fahrzeit zwischen Karten = gute Timeline-Idee | Karte falsch gerahmt, wiederholte Illustrationen, „ca. ? km · ca. unbekannt (Quelle unbekannt)“ | desktop/04–06, tablet/03, mobile/05–06 |
| Station | Tagesbriefing, Checkliste, Unterkunft verlinkt | Dünen-SVG als Hero, „user_entered“, „unknown“, Fahrtstrecke-Karte halb leer | desktop/07–08, mobile/07 |
| Unterkünfte | Finanzlogik transparent (verifiziert/unverifiziert/Rest) | keine Bilder, Akkordeon, 13× „unbekannt“, „1 Nächte“ | desktop/09–12, tablet/04, mobile/08–09 |
| Buchungen | Typ-Badges, Betrag rechts | Textwüste, Wiederholungen, Aktionsleiste 4 gleichrangige Buttons | desktop/16–17, mobile/10 |
| Tagebuch | FAB-Mikrofon mobil, Sprachmemo-Button | leer; Editor = Formular; Filter „Alle“ allein | desktop/13–14, mobile/13 |
| Galerie | Filter Alben/Arten/Favoriten | leer; Raster/Lightbox nicht prüfbar | desktop/15, tablet/05 |
| KI-Guide | Schnellfragen-Chips, Quellenlinks | Badge-Inflation, Eingabe mobil gequetscht, nicht in Stationen integriert | desktop/18–19, mobile/11 |
| Safari-Tracker | Artenliste mit Zähler + Favorit | reine Textchips, kein „Big Five“-Fortschritt, keine Bilder | desktop/20, mobile/12 |
| Ausgaben | Währungen getrennt (fachlich richtig) | dreifacher Leerzustand, leere Kategorienkarte | desktop/21 |
| Sicherheit | Pannen-Checkliste, Tresor mit Verschlüsselung | Notfallkontakte nicht sichtbar priorisiert; Formular-Look | desktop/22–23 |
| Familie | Rollenübersicht klar | „Row-Level-Security“, keine Avatare/Fotos, nur Formular | desktop/24 |
| Mitreisen | Datenschutz verständlich erklärt | Formular gequetscht (Label-Höhen ungleich) | desktop/25 |
| Erinnerungen | Suche + Filter umfangreich | Liste ohne Zeitachse, ohne Bilder, unterstrichene Titel | desktop/26–27 |
| Offline & Sync | Funktion klar | Entwicklersprache („running“, „members“) | desktop/28 |

---

## 5. Was bereits gut ist und erhalten bleiben muss
1. Ehrliche Datenhaltung (unbekannt bleibt unbekannt, Planwerte als solche gekennzeichnet) – **nur die Darstellung** wird leiser, nicht die Information.
2. Finanztrennung „verifiziert gezahlt / nicht verifiziert / Restbetrag“.
3. Offline-Karte mit eigenem Tile-Server, Offline-Queue, verschlüsselter Dokumententresor, Follower-Datenschutz, EXIF-/Ortsdatenbereinigung.
4. Farb-Tokens als Basis, Lucide-Iconset, Pill-Buttons, Bottom-Navigation, Mikrofon-FAB.

---

## 6. Screenshot-Verzeichnis
Alle Bilder unter `screenshots/desktop/` (28), `screenshots/tablet/` (5), `screenshots/mobile/` (13). Desktop-Aufnahmen sind auf 1377 px Breite skaliert (Viewport 1534 CSS-px). Tablet/Mobile sind auf die emulierte Breite zugeschnitten.
Referenzportale wurden aus urheberrechtlichen Gründen **nicht** als Screenshot abgelegt.
