# 02 – Premium Design Vision

> **„Unsere Reise. Unsere Geschichte.“**
> Planen. Erleben. Festhalten. Wiederentdecken.

Dieses Dokument ist das **verbindliche visuelle Zielbild**. Alle Entscheidungen in Doc 03–07 leiten sich daraus ab.

---

## 1. Erkenntnisse aus den Referenzen

Geprüft im Browser am 11.10.2026 (✅) bzw. aus allgemeiner Kenntnis der Plattform (ⓘ). Cookie-Banner wurden nicht akzeptiert; es wurden keine Inhalte übernommen.

| Referenz | Beobachtung | Abgeleitetes Prinzip für uns |
|---|---|---|
| **andBeyond** ✅ | Vollflächiges Nachtfoto (Akazie unter Sternenhimmel), Serif-Display 80 px Gewicht 400 (*questa-grande*), kleine Versal-Eyebrow („I DREAM OF“), ein einziger Outline-CTA, Navigation auf Logo + Suche + Menü reduziert. | **Ein Bild, ein Satz, eine Aktion.** Display-Serif in *leichtem* Gewicht wirkt hochwertiger als fette Grotesk. |
| **Wilderness** ✅ | Löwe frontal, Bildmitte = Blickachse, Wortmarke 96 px Serif mit sehr weiter Laufweite, gedämpftes Bild (dunkles Overlay), Navigation minimal, ein Akzent-Orange für die Hauptaktion. | **Gedämpfte Fotos + helle Typo**; Akzentfarbe exklusiv für die eine Primäraktion. |
| **Black Tomato** ✅ | Elefantenherde mit Vordergrund-Unschärfe, schmale Condensed-Versalien 60 px mit Laufweite, zwei Buttons (Outline + gefüllt), Versal-Navigation in kleiner Größe. | **Tiefe durch Vordergrund**, klare Zweier-CTA-Hierarchie. |
| **National Geographic Travel** ✅ | Editoriales Raster: großes Leitbild links (≈ 60 %), Artikelliste rechts mit Rubrik-Icons; Bildunterschrift im Bild auf Verlauf. | **Asymmetrisches Editorial-Raster** für Dashboard und Tagebuch; Text auf Bild nur mit Verlauf. |
| **Airbnb** ✅ | Ergebnisliste 2-spaltig mit 4:3-Fotos (Radius ≈ 12 px), Herz oben rechts, Badge „Gäste-Favorit“ oben links im Bild, darunter Titel, 2 Meta-Zeilen, Preis fett, Karte rechts sticky. | **Bildkarte mit Overlay-Badge** für Unterkünfte; **Liste + Sticky-Karte** für die Route. |
| **GetYourGuide** ✅ | 4-spaltige Aktivitätskarten, 4:3-Bild mit Badge („Neue Aktivität“) und Favoriten-Herz, Dauer als Versal-Mikrotext, Titel 2-zeilig, Preis rechtsbündig unten; horizontale Filter-Rail. | **Horizontale Filter-Rail** statt umbrechender Chips; Dauer/Meta als Mikro-Eyebrow. |

**Gemeinsamer Nenner:** (1) Fotografie trägt die Emotion, (2) Typografie trägt die Marke, (3) UI tritt zurück – wenige, klar gestufte Aktionen, wenig Farbe außerhalb von Bildern.

---

## 2. Markenkern der App

| Dimension | Zielwirkung | Nicht |
|---|---|---|
| Persönlichkeit | warm, ruhig, kundig, familiär | verspielt, laut, technisch |
| Bild | Golden Hour, weiter Horizont, Nähe zu Tier und Mensch | Stock-Lächeln, Postkartenkitsch, Stadtsilhouetten |
| Typo | editorial, großzügig, leicht | fett, gedrängt, Versal-lastig |
| Farbe | Erde, Sand, tiefes Wasser, Abendlicht | Signalblau, Neon, Tailwind-Standardgrau |
| Bewegung | langsam, fließend (Ken-Burns, Fade) | Bounce, Pop, Konfetti |
| Ton | „Euer“, „Heute“, „Nächster Halt“ | „Datensatz“, „Provider“, „running“ |

### Leitmotiv „Golden-Hour-Journal“
Die App ist ein **Reisejournal, das zufällig auch planen kann**. Jede Seite ist entweder ein *Kapitel* (Ort, Tag, Erinnerung) oder ein *Werkzeug* (Geld, Dokumente, Sync). Kapitel bekommen Bild und Display-Typo, Werkzeuge bleiben ruhig und präzise.

---

## 3. Visuelle Grundregeln (verbindlich)

1. **Bild zuerst.** Jede Kapitel-Seite beginnt mit einem Foto (Desktop ≥ 56 vh, Mobil ≥ 52 vh beim Dashboard; 40 vh bei Station/Tagebuch). Ohne Foto: kuratierte Illustration der richtigen Landschaftsklasse, nie eine Stadt für einen Naturort.
2. **Eine Display-Schrift, eine Textschrift.** Fraunces (Serif, variabel, Gewicht 300–500, optisches Sizing) für H1/H2/Zitate/Zahlen in Heros; Inter (tatsächlich geladen) für alles andere.
3. **Maximal eine gefüllte Primäraktion pro Sichtbereich.** Weitere Aktionen sind Outline, Ghost oder Icon.
4. **Status ist leise, Aufgaben sind laut.** „Unbekannt“ wird zu einem neutralen Punkt, offene Klärungen werden zu einer gezählten Aufgabe mit Aktion („3 Dinge klären“).
5. **Systeminformationen verlassen die Bühne.** Sync, Datenherkunft, Provider, RLS gehören in einen Status-Indikator im Header und in die Einstellungen – nicht auf Inhaltsseiten.
6. **Zwei Containerbreiten.** `content` 72 rem (1152 px) für Kollektionen, `prose` 42 rem (672 px) für Lesen/Schreiben. Volle Breite nur für Bilder und Karten.
7. **Farbe gehört dem Bild.** UI-Flächen bleiben Sand/Weiß/Deep; Gold und Clay sind Akzente (≤ 10 % Fläche).
8. **Deutsch, du-Form, keine Technikbegriffe.** Jeder Text besteht den „Oma-Test“ (Follower-Zielgruppe).

---

## 4. Zielbild je Hauptbereich

### 4.1 Dashboard „Heute“
```
┌───────────────────────────────────────────────────────────────┐
│ [FOTO nächste/aktuelle Station, Ken-Burns 20 s, Verlauf unten]  │
│  NÄCHSTER HALT · DO 15. OKT                    (Eyebrow, sand-100)│
│  Sossusvlei                                   (Fraunces 72/300) │
│  „Noch 2 Tage bis Windhoek.“                  (Inter 18, 90 %)  │
│  [Tagesbriefing]  (Route ansehen)   ●●●●● Familie-Avatare        │
└───────────────────────────────────────────────────────────────┘
 ┌ Nächste Unterkunft ─────────┐ ┌ Heute für euch (KI) ────────┐
 │ [Foto 4:3] Arebbusch Lodge   │ │ 3 Empfehlungen mit Quelle   │
 │ 14.–15. Okt · 1 Nacht        │ │ (nur nach Freigabe)         │
 │ ● Zu klären: Bestätigung     │ └─────────────────────────────┘
 └──────────────────────────────┘
 ┌ Vor der Abreise (Aufgaben 8) ─────────────────────────────────┐
 │ ☐ … max. 5 sichtbar · „Alle anzeigen“                          │
 └───────────────────────────────────────────────────────────────┘
 Route-Rail: [01 FRA] [02 WDH] [03 Sossusvlei] … horizontal scrollbar
 Letzte Erinnerungen: Polaroid-Stapel / inspirierender Leerzustand
```
- KPI-Karten „Reiseziele“ und „Abreise“ entfallen (Inhalt steht im Hero).
- „Buchungsstatus 29 zu prüfen“ wird zur Aufgabe „29 Buchungen bestätigen“ mit Fortschrittsring.
- Wetter erscheint nur, wenn Daten vorliegen; sonst entfällt die Karte (kein „nicht verfügbar“).
- „Unser Reisebegleiter“-Kachelraster entfällt auf Desktop (Sidebar genügt); mobil ersetzt durch „Mehr“.

### 4.2 Reiseplan „Route“
- **Desktop:** Split-View 5/7 – links scrollende Stations-Timeline, rechts **sticky Karte**, die auf Namibia/Botswana gerahmt ist (Flugsegment FRA–WDH als eigene, einklappbare Anreise-Karte, nicht in `fitBounds`). Hover auf Station hebt Marker hervor und umgekehrt.
- **Stationskarte (editorial):** Foto 3:2 links (Desktop) bzw. oben (Mobil), Eyebrow „TAG 3–4 · 15.–17. OKT“, Titel in Fraunces 28, Region · Land, 2–3 Highlight-Chips, Fußzeile: 🛏 Unterkunft · ☐ 1 offen · 🚙 330 km / ~4 h 30.
- **Fahrtsegment** zwischen Stationen: Linie mit Fahrzeug-Icon, „330 km · ~4 h 30“. Unbekannte Werte werden **weggelassen** statt „ca. ? km“ angezeigt; Quelle als Tooltip/Info-Icon.
- **Mobil:** Liste/Karte-Umschalter (Segmented Control) oben; Karte als Vollbild-Ansicht mit Stations-Carousel am unteren Rand (Airbnb-Muster).

### 4.3 Stationsdetail
- Hero 40 vh mit Foto + Titel im Bild; Sticky-Subnavigation „Überblick · Unterkunft · Aktivitäten · Notizen · Erinnerungen“.
- Tagesbriefing als **Faktenleiste** (4 Icons: Unterkunft, Fahrt, Aufgaben, Wetter) statt Textliste.
- „Angaben nicht geprüft“ und Quellenhinweise als ein Info-Icon mit Popover.

### 4.4 Unterkünfte
- **Kollektionsansicht:** 2-spaltiges Kartenraster (Desktop), 1-spaltig (Mobil). Karte: Foto 4:3 mit Status-Badge oben links (Bestätigt / Angefragt / Zu klären) und Nächte-Badge oben rechts; darunter Name (Inter 18/600), Ort · Zeitraum, **PaymentMeter** (Balken: bezahlt verifiziert / unverifiziert / offen) mit Beträgen, Fußzeile „3 Klärpunkte · Belege“.
- Detail als **Seite oder Side-Sheet** (Desktop) / **Bottom-Sheet** (Mobil) statt Akkordeon; Finanzblock als 2×2-Grid mit tabellarischen Ziffern.
- Filter als Segmented Control: „Alle · Zu klären · Teilbezahlt · Bezahlt“ (leere Filter ausgegraut, nicht entfernt).
- Finanzdaten bleiben **unverändert berechnet**; nur Darstellung. „Restbetrag unbekannt“ → „Offen: noch nicht bekannt“ mit Hinweis, was fehlt.

### 4.5 Buchungen
- Gruppierung nach **Station/Datum** (Zeitleiste) mit Typ-Icon statt Typ-Badge.
- Kompakte Zeile: Icon · Titel · Datum · Betrag · Status-Punkt; Details (Referenz, Anbieter, Notiz, Nachweis) im aufklappbaren Bereich. Wiederholte „unbekannt“-Felder werden zu **einer** Zeile „Fehlt: Referenz, Anbieter, Beleg“.
- Aktionen: ein Overflow-Menü (⋯) + ein sichtbarer Kontext-Button („Beleg hinzufügen“).

### 4.6 Reisetagebuch
- **Editorial-Feed:** Tagesgruppen mit großem Datum (Fraunces), Ortszeile, Eintragskarte mit Titelfoto 3:2 (oder Bildpaar), Fließtext 18 px in `prose`-Breite, Autor-Avatar, Sprachmemo als **Wellenform-Player** (Clay), Tier-Sichtungen des Tages als Mini-Chips.
- **Editor „Schreibmoment“:** Vollflächiger Modus, Titel als Fraunces-Placeholder („Was war das Besondere heute?“), Station/Datum vorausgefüllt aus heutigem Reisetag, Medienleiste unten fixiert (Foto · Video · Sprachmemo · Ort), Datenschutz-Optionen in einem „Sichtbarkeit“-Sheet.

### 4.7 Galerie & Erinnerungen
- **Galerie:** Justified Grid (Zeilenhöhe 220 px Desktop / 140 px Mobil) mit Gruppierung nach Tag + Station als Sticky-Header; Filter-Rail horizontal; Favoriten-Herz on hover/long-press; **Lightbox** vollflächig, Wischgesten, Metadaten-Leiste (Datum, Station, Autor), Sprachmemo-Wiedergabe im Bild.
- **Erinnerungsarchiv:** vertikale Zeitachse (Tag 1 … Tag 21) mit Stationsfoto als Kapitelkopf; Einträge, Sichtungen, Medien als gemischte Karten; Export bleibt erhalten.
- Bildqualität: AVIF/WebP, `sizes`-Attribut, LQIP-Blur-Platzhalter, `loading="lazy"` außer Hero.

### 4.8 KI-Reiseassistent
- Kein separater „Admin“-Bereich, sondern **kontextuell**: auf Dashboard („Heute für euch“), auf Station („Frag zu Sossusvlei“), im Tracker („Welches Tier war das?“ – nur mit Freigabe).
- Eigene Seite als ruhige Konversationsfläche (Prose-Breite) mit Schnellfragen als Rail; Quellen- und Aktualitätsstatus **ein** Badge pro Karte („Stand: unbekannt“), Detail im Popover.

### 4.9 Safari-Tracker
- **Artenkarten 1:1** mit Foto/Illustration, gesehen = Farbe, ungesehen = Duoton/gedimmt; Fortschritt „Big Five 0/5“ und „Arten 0/15“ als Ringe.
- Sichtungslog als Timeline mit Ort, Uhrzeit, Anzahl, Foto.

### 4.10 Ausgaben, Dokumente, Familie, Sync
- **Werkzeug-Seiten:** ruhig, tabellarische Ziffern, keine Fotos, klare Leerzustände mit einer Aktion.
- Ausgaben: Währungs-Tabs (NAD · BWP · EUR), Summen-Kacheln, Kategorie-Balken erst ab erster Ausgabe.
- Sicherheit: Notfallkontakte als **große Anruf-Karten** zuerst (offline), Tresor darunter mit Schloss-Icon und Statuszeile „verschlüsselt auf diesem Gerät“.
- Familie: Avatar-Karten mit Foto, Rolle, Farbe (Autorfarbe im Tagebuch); Einladen als Sekundäraktion.
- Sync: aus der Hauptnavigation in „Einstellungen → Offline & Sync“; Header-Indikator (Punkt grün/gelb/rot + Tooltip).

---

## 5. Bewegung & Mikrointeraktionen (P2)
- Hero: Ken-Burns 1,00 → 1,06 über 20 s, `prefers-reduced-motion` respektieren.
- Karten: Hover-Lift 2 px + Bildzoom 1,03 (200 ms, `ease-out`).
- Seitenwechsel: Fade 150 ms; Shared-Element-Übergang Stationskarte → Stationshero (View Transitions API, progressive enhancement).
- Checkbox-Abhaken: Strich + sanftes Ausblenden nach 600 ms.
- Sync: kein Banner; Header-Punkt pulsiert nur während aktiver Übertragung.

---

## 6. Messbare Qualitätsziele
- Lighthouse Accessibility ≥ 95, Performance mobil ≥ 85 (Hero-LCP ≤ 2,5 s auf 4G).
- Alle Text-/Hintergrund-Paare ≥ 4,5 : 1 (Fließtext) bzw. ≥ 3 : 1 (≥ 24 px).
- Dashboard mobil: Hero + nächste Unterkunft + Aufgaben im ersten 1,5 Bildschirmhöhen.
- Keine Technikbegriffe in Inhaltsseiten (Liste in Doc 07).

Detailkriterien: **07_ACCEPTANCE_CRITERIA.md**.
