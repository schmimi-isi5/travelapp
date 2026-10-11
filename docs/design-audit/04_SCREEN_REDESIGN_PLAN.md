# 04 – Screen-Redesign-Plan

Pro Seite: konkrete Elemente, Ist → Soll, Priorität (P0/P1/P2), Aufwand (S ≤ 0,5 PT · M 1–2 PT · L 3+ PT). Verweise auf Screenshots in `screenshots/`. Komponenten siehe Doc 03.

**Globale Regel für alle Seiten:** Nur Darstellungsschicht ändern. Datenabfragen, Berechnungen, Offline-Queue, RLS, Formular-Submits bleiben unverändert.

---

## G – Globale Hülle (App-Shell)

| # | Element | Ist | Soll | Prio | Aufwand |
|---|---|---|---|---|---|
| G1 | Top-Navigation (Desktop) | 5 Links, Aktivzustand nur für diese 5 | entfernen; Header = Logo · Sync-Punkt · AvatarStack · Profilmenü | P0 | S |
| G2 | Sidebar | 14 gleichrangige Einträge | 4 Gruppen mit Überschrift (Doc 03 §7.3); Offline & Sync in Einstellungen; Breite 248 px; aktiver Eintrag teal-50 + 3 px Gold-Kante links | P0 | M |
| G3 | Sync-Banner „Synchronisiere …“ | blaues Vollbreiten-Banner auf jeder Seite | entfällt; Header-Punkt (grün = aktuell, gold pulsierend = überträgt, ochre = Warteschlange > 0, clay = Konflikt) + Tooltip; Banner nur bei Konflikt oder > 24 h offline | P0 | S |
| G4 | Rolle im Header | „owner“ | „Organisator:in“ (deutsche Rollennamen überall; Datenwerte unverändert, nur Label-Mapping) | P1 | S |
| G5 | Bottom-Nav mobil | Dashboard · Route · Unterkünfte · Tagebuch · Mehr | Heute · Route · ⊕ Erfassen · Erinnern · Mehr (Unterkünfte in „Route“-Tab als Segment und in „Mehr“) | P1 | M |
| G6 | Mehr-Menü mobil | „Abmelden“ als erstes Element | Gruppiert wie Sidebar; Abmelden ganz unten, Sekundärstil | P1 | S |
| G7 | Seitenkopf | H1 Inter 48/800 + Untertitel + Button wechselnd platziert | `PageHeader`-Komponente: Kapitel-Variante (Fraunces, optional Bild) / Werkzeug-Variante (Inter 650); Primäraktion immer rechts (Desktop) bzw. als FAB/Sticky-Button (Mobil) | P0 | M |
| G8 | Inhaltsbreiten | 768 / 896 / 1152 px ohne Regel | `content` / `prose` / `wide` (Doc 03 §4) | P1 | S |
| G9 | Webfonts | nicht geladen | Fraunces + Inter via `next/font` | P0 | S |
| G10 | Texte | Technikbegriffe (Liste Doc 07 §6) | Mikrotext-Pass; zentrale `labels.ts` für Status-/Rollen-/Quellen-Labels | P0 | M |

---

## 1. Dashboard `/` (desktop/01–03, tablet/01–02, mobile/01–04)

| # | Element | Ist | Soll | Prio | Aufwand |
|---|---|---|---|---|---|
| D1 | Hero | SVG „sky-city“ (Stadtsilhouette), 400 px, H1 „Abreise in 2 Tagen“ | `PhotoHero` mit Foto der **nächsten Naturstation** vor Abreise (Sossusvlei) bzw. der **aktuellen Station** unterwegs; 62 vh Desktop / 72 vh mobil (4:5); Eyebrow „NÄCHSTER HALT · 15. OKT“ (gold-200), Titel Fraunces display-xl, Untertitel „Noch 2 Tage – dann geht’s los nach Windhoek.“ | P0 | M |
| D2 | Hero-Aktionen | 2 Buttons gestapelt (mobil) | Primär „Tagesbriefing“ (gold), Sekundär „Route“ (on-photo-outline), nebeneinander auch mobil (je 50 %) | P1 | S |
| D3 | Familie | fehlt | `AvatarStack` im Hero unten rechts (Fotos aus Profilen, Initialen-Fallback in Autorfarbe) → Link Familie | P1 | S |
| D4 | KPI-Karten | „Abreise 13. Okt“, „Reiseziele“, „29 zu prüfen“ | entfernen „Abreise“ + „Reiseziele“; „29 zu prüfen“ → `StatCard` „Buchungen bestätigt 0/29“ mit Ring → Link Buchungen (gefiltert) | P0 | S |
| D5 | Nächste Unterkunft | fehlt | `MediaCard` 4:3: Foto, Name, Zeitraum, Nächte, StatusDot, „2 Dinge klären“ | P0 | M |
| D6 | Offene Aufgaben | 8 Einträge + Inline-Formular, Leerraum | max. 5 Einträge, sortiert nach Datum; „Alle 8 anzeigen“; Formular hinter „+ Aufgabe“ (aufklappend); Zuweisung als Avatar statt Text „Nicht zugewiesen“ | P1 | S |
| D7 | Fehlende Belege | eigene Karte | in Aufgaben integrieren als zusammengefasste Aufgabe „30 Belege fehlen“ | P1 | S |
| D8 | Wetter | „Nicht verfügbar: kein Wetterdienst verbunden.“ | Karte ausblenden, wenn keine Daten | P0 | S |
| D9 | Offline-Status, Datenherkunft | eigene Karten | entfernen (→ Header-Punkt, Einstellungen) | P0 | S |
| D10 | KI-Tagesempfehlung | fehlt | Karte „Heute für euch“ – nur sichtbar, wenn KI freigegeben; sonst kuratierte Tipps der Station mit `SourceInfo` | P1 | M |
| D11 | Route-Überblick | fehlt | `StationRail` (14 Miniaturen 3:2, aktuelle hervorgehoben) | P1 | M |
| D12 | Letzte Erinnerungen | Text „Noch keine Medien.“ | Vorfreude-Empty-State (Doc 03 §7.8) bzw. 6 neueste Fotos als Collage | P1 | S |
| D13 | „Unser Reisebegleiter“-Raster | 14 Kacheln | Desktop entfernen; mobil ersetzt durch Mehr-Tab | P0 | S |
| D14 | Raster | 2/3 + 1/3, gleiche Gewichte | Desktop 12 Sp.: Hero 12 · Unterkunft 7 + KI/Stat 5 · Aufgaben 7 + Erinnerungen 5 · Rail 12 | P1 | M |

Zielhöhe mobil: Hero + Unterkunft + Aufgaben innerhalb von 1,5 Bildschirmhöhen; Gesamtseite ≤ 2 400 px (Ist 3 582 px).

---

## 2. Route `/route` (desktop/04–06, tablet/03, mobile/05–06)

| # | Element | Ist | Soll | Prio | Aufwand |
|---|---|---|---|---|---|
| R1 | Karte – Ausschnitt | zeigt Flugstrecke/„Gabun“, keine Marker | `fitBounds` nur über Stationen in NA/BW; Flugsegment gestrichelt optional einblendbar; Marker = nummerierte Kreise teal-800, aktiv gold; Route als durchgezogene clay-500-Linie | P0 | M |
| R2 | Karte – Layout | rechte Spalte, 375 px hoch, Text darunter | Desktop: sticky rechte Spalte, Höhe `calc(100vh – Header – 32)`; Offline-Hinweis als kleines Wolken-Icon mit Popover; „Entfernen“ in Einstellungen | P0 | M |
| R3 | Mobil Liste/Karte | Karte unter 14 Stationen | `SegmentedControl` „Liste · Karte“; Kartenmodus mit Stations-Carousel unten | P1 | M |
| R4 | Stationskarte | SVG-Thumbnail 144 px, Titel truncate, Pfeil | `MediaCard` horizontal (Desktop: Bild 3:2 280 px links), vertikal (mobil: Bild oben); Eyebrow „TAG 3–4 · 15.–17. OKT“, Titel Fraunces h2, Highlights-Chips, FactBar (Unterkunft · offene Aufgaben · Aktivitäten) | P0 | M |
| R5 | Fahrtsegment | „ca. ? km · ca. unbekannt (Quelle unbekannt)“ | `RouteSegment`: Linie + Auto-Icon + „330 km · ~4 h 30“; unbekannte Werte weglassen („Fahrzeit noch offen“ nur einmal, dezent); Quelle im Info-Popover | P0 | S |
| R6 | Anreise-Station | wie Naturstation dargestellt | eigene kompakte „Anreise“-Karte (Flugzeug-Icon, Flugnummer falls vorhanden) | P1 | S |
| R7 | Überlauf mobil | **Verdacht**: Liste breiter als Viewport | Grid `grid-cols-1` + `min-w-0` auf Spalten; MapLibre `resize()` bei Container-Resize | P0 | S |
| R8 | Kopf | H1 + langer Disclaimer | Kapitel-Header mit Zusammenfassung „14 Stationen · 21 Tage · ≈ 3 200 km“ (nur aus vorhandenen Daten summiert, bei Lücken „mind.“) | P1 | S |

---

## 3. Stationsdetail `/route/[id]` (desktop/07–08, mobile/07)

| # | Element | Ist | Soll | Prio | Aufwand |
|---|---|---|---|---|---|
| S1 | Hero | Dünen-SVG 230 px, Titel darunter | `PhotoHero` 16:9 / 44 vh, Titel im Bild, Eyebrow „STATION 3 VON 14 · NAMIBIA“, Datum | P0 | M |
| S2 | „Angaben nicht geprüft“ | Badge | `SourceInfo`-Icon neben Titel | P1 | S |
| S3 | Tagesbriefing | Textliste 5 Zeilen | `FactBar`: 🛏 Sossus Oasis · 🚙 330 km ~4 h 30 · ☐ 1 offen · ✦ 2 Aktivitäten (+ Wetter nur wenn vorhanden) | P0 | S |
| S4 | Fahrtstrecke | eigene Karte, „Quelle: user_entered“, „Min..“ | in FactBar integriert; Quelle „selbst eingetragen“ im Popover; Tippfehler beheben | P0 | S |
| S5 | Sehenswürdigkeiten | Chips + Disclaimer | Highlights als 2–3 Bildkacheln (falls Assets) oder Chips; Disclaimer ins Popover | P1 | M |
| S6 | Unterkunft | Textlink + Liste mit „unknown“ | eingebettete `StayCard` (kompakt) + Aktivitätenliste mit StatusDot (deutsch) | P0 | S |
| S7 | Kontakte | Karte mit einem Link | in SubNav/Footer „Notfallkontakte“ verschieben | P2 | S |
| S8 | Navigation | „← Route“ | zusätzlich Vor/Zurück zur Nachbarstation (Mini-Karten unten) | P2 | S |

---

## 4. Unterkünfte `/stays` (desktop/09–12, tablet/04, mobile/08–09)

| # | Element | Ist | Soll | Prio | Aufwand |
|---|---|---|---|---|---|
| U1 | Liste | Akkordeon, kein Bild | Raster `StayCard` (Desktop 2 Sp., Tablet 2 Sp., Mobil 1 Sp.), Foto 4:3 | P0 | M |
| U2 | Status-Badge | 13× „unbekannt“ | StatusDot im Bild-Overlay; Kopfzeile „13 Unterkünfte · 0 bestätigt · 13 zu klären“ | P0 | S |
| U3 | Filter | 5 Chips, 4 mit 0 | `SegmentedControl` Alle · Zu klären · In Arbeit · Bestätigt (0-Optionen gedimmt) | P1 | S |
| U4 | Detail | Akkordeon mit 4 „unbekannt“-Feldern | `Sheet` mit SubNav (Überblick · Zahlungen · Belege · Checkliste); Felder „unbekannt“ → `MissingInfo` | P0 | M |
| U5 | Finanzblock | 4 Spalten / mobil 4 Zeilen | `PaymentMeter` + 2×2-Grid, tabellarische Ziffern, Beträge rechtsbündig; Werte und Berechnung **unverändert** | P0 | M |
| U6 | Notiz | „Planpreis 62,42 € pro Nacht × 2 (aus der Excel …)“ | als „Planwert“-Zeile im Finanzblock mit Herkunft im Popover | P1 | S |
| U7 | Pluralisierung | „1 Nächte“ | `Intl.PluralRules` / Hilfsfunktion `nights(n)` | P0 | S |
| U8 | Aktionen | Bearbeiten / Löschen inline | Overflow-Menü ⋯; Löschen nur mit Dialog | P1 | S |
| U9 | Klärbedarf | Badges-Reihe | Checkliste „Zu klären (3)“ mit direkter Aktion je Punkt | P1 | S |

---

## 5. Buchungen `/bookings` (desktop/16–17, mobile/10)

| # | Element | Ist | Soll | Prio | Aufwand |
|---|---|---|---|---|---|
| B1 | Struktur | flache Kartenliste | nach Station/Datum gruppierte Timeline mit Stationskopf (Miniaturbild) | P1 | M |
| B2 | Karte | Typ- + Status-Badge, 5 Textzeilen | Zeile: Typ-Icon · Titel · Datum · Betrag (tabular) · StatusDot; aufklappbar | P0 | M |
| B3 | Wiederholungen | „Referenz: unbekannt · Anbieter: unbekannt“, „Kein Nachweis hinterlegt“ | `MissingInfo`: „Fehlt: Referenz · Anbieter · Nachweis“ | P0 | S |
| B4 | Aktionen | 4 Buttons (Nachweis, Exportieren, Bearbeiten, Löschen) | 1 Kontextbutton + ⋯-Menü | P1 | S |
| B5 | Filter | 7 Chips, umbrechend | `FilterRail` horizontal | P1 | S |
| B6 | Summen | fehlen | Kopf-StatCards je Währung „Geplant · Bezahlt · Offen“ (nur Anzeige vorhandener Summen; keine neue Berechnungslogik – falls Summen nicht existieren, P2 und Freigabe einholen) | P2 | M |

---

## 6. Reisetagebuch `/journal` (desktop/13–14, mobile/13)

| # | Element | Ist | Soll | Prio | Aufwand |
|---|---|---|---|---|---|
| J1 | Leerzustand | gestrichelter Kasten | Vorfreude-Empty-State mit Windhoek-/Sossusvlei-Bild, „Euer erstes Kapitel beginnt am 13. Oktober.“, Button „Ersten Eintrag schreiben“ | P1 | S |
| J2 | Feed | (nicht prüfbar – leer) | Tagesgruppen, Datum Fraunces, `JournalCard` (Foto 3:2, Titel h2, Text body-l in prose-Breite, Autor-Avatar, Sprachmemo-Player) | P0 | L |
| J3 | Filter | Chip „Alle“ + Vollbreiten-Select | eine `FilterRail`: Alle · pro Familienmitglied · Station (Combobox) | P1 | S |
| J4 | Editor | Formular | „Schreibmoment“: Titel-Feld Fraunces 32 ohne Rahmen, Datum/Station vorausgefüllt als Chips, Textarea autogrow ohne Rahmen, Medienleiste sticky unten, Sichtbarkeit/Follower/EXIF in einem Sheet „Optionen“ | P1 | M |
| J5 | Sprachmemo | Clay-Button + Hinweistexte | Aufnahme-Sheet mit Wellenform und Timer; Transkriptionshinweis nur wenn relevant | P1 | M |
| J6 | FAB mobil | Mikrofon-FAB (gut) | beibehalten; Long-Press → Foto/Text | P2 | S |

---

## 7. Galerie `/gallery` (desktop/15, tablet/05)

| # | Element | Ist | Soll | Prio | Aufwand |
|---|---|---|---|---|---|
| GA1 | Raster | (nicht prüfbar – leer) | Justified Grid nach Tag/Station gruppiert, sticky Gruppenkopf | P0 | L |
| GA2 | Lightbox | (nicht prüfbar) | `Lightbox` (Doc 03 §7.7) inkl. Tastatur/Swipe, Favorit, Audio | P0 | M |
| GA3 | Filter | 2 Pill-Gruppen | `FilterRail`: Alben-Combobox · Fotos · Videos · Audio · ♥ | P1 | S |
| GA4 | Leerzustand | Kasten | Collage aus Platzhalter-Landschaften (eigene Assets) + Upload | P1 | S |
| GA5 | Performance | – | `next/image` mit `sizes`, AVIF/WebP, Blur-Placeholder, Virtualisierung ab 200 Medien | P1 | M |

---

## 8. KI-Guide `/guide` (desktop/18–19, mobile/11)

| # | Element | Ist | Soll | Prio | Aufwand |
|---|---|---|---|---|---|
| K1 | Badges | 3 pro Karte + Warnbox | ein `SourceInfo` pro Karte; Warnbox → einzeiliger Hinweis unter der Suche | P0 | S |
| K2 | Eingabe mobil | Feld ~160 px, Placeholder abgeschnitten | Feld volle Breite, Senden als Icon-Button im Feld | P0 | S |
| K3 | Schnellfragen | Chip-Wolke | `FilterRail` horizontal | P1 | S |
| K4 | Kontext | eigenständige Seite | zusätzlich „Frag zu dieser Station“ auf Stationsdetail; „Heute für euch“ auf Dashboard | P1 | M |
| K5 | Karten | Text, Unterstrichener Quelllink | Karten mit Kategorie-Icon, Titel h3, 3 Zeilen, „Quelle“ als Ghost-Link | P1 | S |

---

## 9. Safari-Tracker `/sightings` (desktop/20, mobile/12)

| # | Element | Ist | Soll | Prio | Aufwand |
|---|---|---|---|---|---|
| T1 | Artenliste | 15 Textchips mit Zähler + Herz | `SpeciesTile`-Raster 1:1 (Desktop 5 Sp., mobil 3 Sp.), gesehen farbig + Zähler, ungesehen gedimmt | P0 | M |
| T2 | Fortschritt | Text „0 von 15 Arten“ | `ProgressRing` „Big Five 0/5“ + „Arten 0/15“ | P1 | S |
| T3 | Sichtungslog | Leerzustand | Timeline mit Foto, Ort, Uhrzeit, Anzahl, Autor | P1 | M |
| T4 | Erfassen | Button + Formular | Bottom-Sheet: Art antippen → Anzahl → optional Foto; < 10 s | P1 | M |

---

## 10. Ausgaben `/expenses` (desktop/21)

| # | Element | Ist | Soll | Prio | Aufwand |
|---|---|---|---|---|---|
| A1 | Leerzustände | 3-fach + leere „Kategorien“-Karte | ein Werkzeug-Empty-State; Kategorien/Konsolidierung erst ab erster Ausgabe | P0 | S |
| A2 | Struktur | Karten untereinander | Währungs-Tabs (NAD · BWP · EUR), Summenkacheln, Liste mit tabellarischen Ziffern | P1 | M |
| A3 | Diagramm | – | Kategorie-Balken (horizontal, Palette gold/teal/clay/savanna) – reine Anzeige vorhandener Summen | P2 | M |
| A4 | Aktionen | CSV links, Erfassen rechts daneben | Erfassen = Primär (mobil FAB), CSV = Ghost im ⋯-Menü | P1 | S |

---

## 11. Sicherheit & Dokumente `/safety` (desktop/22–23)

| # | Element | Ist | Soll | Prio | Aufwand |
|---|---|---|---|---|---|
| SI1 | Reihenfolge | Warnbox, Standort, Pannen-Liste, Hinweise, Tresor | 1. Notfallkontakte (große Anruf-Karten, offline-Badge), 2. Pannen-Checkliste, 3. Tresor, 4. Hinweise (eingeklappt) | P0 | S |
| SI2 | Platzhalter-Nummern | gelbe Box | Status „Kritisch“ direkt an jedem Platzhalter-Kontakt + Aufgabe auf Dashboard | P0 | S |
| SI3 | Tresor | Select + Passwortfeld + Button in einer Zeile | Karte mit Schloss-Icon, Status „Verschlüsselt auf diesem Gerät“, Upload-Flow als Sheet (Art → Passphrase → Datei). **Kryptografie unverändert.** | P1 | M |
| SI4 | Dokumentliste | Leerzeile | Liste mit Dokumenttyp-Icon, Ablaufdatum (falls vorhanden), Schloss | P1 | S |

---

## 12. Familie `/family` & Mitreisen `/followers` (desktop/24–25)

| # | Element | Ist | Soll | Prio | Aufwand |
|---|---|---|---|---|---|
| F1 | Untertitel | „…per Row-Level-Security durchgesetzt“ | „Jede Person sieht nur, was ihre Rolle erlaubt.“ | P0 | S |
| F2 | Mitglieder | Textzeile + Initialen | Avatar-Karten (Foto, Name, Rolle, Autorfarbe) | P1 | M |
| F3 | Rollen | Textblock | Vergleichstabelle Rolle × Bereich mit Häkchen | P2 | S |
| F4 | Mitreisen-Formular | Felder ungleich hoch, Hilfetext unter Feld drückt Layout | Felder in einer Grid-Zeile mit Hilfetexten unterhalb gemeinsam; Vorschau „So sieht Oma die Reise“ (statisches Mock der Follower-Ansicht) | P1 | M |

---

## 13. Erinnerungsarchiv `/archive` (desktop/26–27)

| # | Element | Ist | Soll | Prio | Aufwand |
|---|---|---|---|---|---|
| E1 | Liste | 31 gleichförmige Textkarten, unterstrichene Titel | Zeitachse nach Tag mit Stationsfoto als Kapitelkopf; Karten nach Typ (Eintrag, Sichtung, Medium, Station, Buchung) mit Icon; Titel nicht unterstrichen | P1 | M |
| E2 | Suche/Filter | 2 Selects + 2 Datumsfelder + 6 Chips | Suchfeld prominent; Filter in „Filter“-Sheet; aktive Filter als entfernbare Chips | P1 | S |
| E3 | Buchungen im Archiv | dominieren (Planwerte) | Typ „Buchung“ standardmäßig ausgeblendet; Fokus auf Erinnerungen | P1 | S |
| E4 | Rückblick | – | „Heute vor einem Jahr“ / Reise-Jahresrückblick (nach der Reise) | P2 | L |

---

## 14. Offline & Sync, Einstellungen (desktop/28)

| # | Element | Ist | Soll | Prio | Aufwand |
|---|---|---|---|---|---|
| O1 | Navigation | eigener Hauptpunkt | Unterseite von Einstellungen | P1 | S |
| O2 | Texte | „Server: Supabase“, „running“, „members · geändert“ | „Verbunden“, „Synchronisierung läuft“, „Mitglieder geändert“ (Label-Mapping) | P0 | S |
| O3 | „Offline simulieren“ | gleichrangiger Button | in „Erweitert“ einklappen | P2 | S |
| O4 | Einstellungen | Karten untereinander | gruppierte Liste (iOS-Settings-Muster) | P2 | M |
