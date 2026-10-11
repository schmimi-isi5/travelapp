# 05 – Asset-Plan

## 1. Bestandsaufnahme (verifiziert im Browser)

| Asset | Typ | Auflösung | Bewertung |
|---|---|---|---|
| `/icons/icon.svg` | Logo/App-Icon (Berg + Sonne im Teal-Kreis) | Vektor, 150×150 | ✅ thematisch passend, gut skalierbar. Wirkt in 36 px etwas detailarm; Wortmarke fehlt (nur Systemschrift). |
| Hero „sky-city“ | Inline-SVG: Verlauf, Kreis, Hügel, **Rechtecke (Stadt)** | Vektor | ❌ falsches Motiv für Afrika-Dashboard; Kreis wirkt auf Mobil als graue Scheibe; überlagerter Teal-Verlauf macht es flach. |
| Stations-Illustrationen | Inline-SVG, 5 Varianten (Stadt, Dünen, Ozean, Savanne mit Akazie/Nashorn, Fluss) | Vektor, 3:2-Ausschnitt | ⚠️ stimmige Farbwelt (Gold/Clay/Teal), aber **zu wenige Varianten** (8 Stationen teilen „Savanne“), keine Ortsspezifik, Stadt-Variante für Windhoek wie für Frankfurt. Als **Offline-Fallback** behalten und verfeinern. |
| Icons | Lucide (inline SVG) | Vektor | ✅ einheitlich; weiter nutzen. |
| Fotografie | – | – | ❌ **nicht vorhanden** (0 Rasterbilder in allen geprüften Ansichten). |
| Tierdarstellungen | – | – | ❌ nicht vorhanden (Tracker nur Text). |
| Avatare | Initialen-Kreise (Braun) | – | ⚠️ funktional; Profilfotos fehlen. |
| Unterkunftsbilder | – | – | ❌ nicht vorhanden. |

**Fehlend gesamt:** ≈ 14 Stations-Heros, 13 Unterkunftsbilder, 15 Tierbilder, 2–3 Dashboard-Heros (Desktop/Mobil-Zuschnitt), 4 Empty-State-Motive, 1 Social/OG-Bild, Profilbilder der Familie.

## 2. Technische Rahmenbedingungen
- **CSP** erlaubt Bilder nur von `'self'`, `data:`, `blob:` und `https://api.reise.schmeckseler.de`. → Alle Fotos **selbst hosten** (`/public/images/…` für kuratierte Assets, Supabase Storage für Nutzerfotos). Keine Hotlinks zu Unsplash/Pexels/Lodges.
- Auslieferung über `next/image` (AVIF → WebP → JPEG), `sizes` je Format (Doc 03 §6), Blur-Placeholder (`blurDataURL` beim Import generieren).
- **Offline:** Stations-Heros in drei Breiten (640/1280/2560) in den Service-Worker-Precache aufnehmen, max. ≈ 6 MB gesamt; ansonsten SVG-Fallback.
- Jedes Asset erhält einen Eintrag in `public/images/ASSETS.json` (Datei, Motiv, Quelle-URL, Urheber, Lizenz, Datum, Nachweis-Screenshot/Download-Beleg, Fokuspunkt, Alt-Text).

## 3. Legale Bezugsquellen (Prüfpflicht je Bild)

| Quelle | Lizenz (Stand laut Anbieter, vor Nutzung erneut prüfen) | Hinweise |
|---|---|---|
| **Eigene Fotos der Familie** | eigene Rechte | **Bevorzugt.** Ab Reisebeginn automatisch bestes Foto je Station als Hero vorschlagen (manuell bestätigen). Personen nur mit Einverständnis; Kinder nicht in Follower-Ansicht ohne Freigabe. |
| Unsplash | Unsplash License | Kommerziell/privat nutzbar, keine Namensnennung nötig (aber empfohlen); keine Personen-/Markenrechte enthalten → Menschen/Lodge-Logos meiden. |
| Pexels | Pexels License | wie Unsplash; Downloadbeleg ablegen. |
| Wikimedia Commons | je Datei unterschiedlich (CC BY, CC BY-SA, PD) | Namensnennung + Lizenzhinweis Pflicht; BY-SA nur, wenn Weitergabe unter gleicher Lizenz akzeptabel → für Kartenkacheln/Galerie meiden, für Stationsbilder mit Credits-Overlay möglich. |
| Lizenzierte Stockfotos (z. B. Adobe Stock, Getty) | kostenpflichtige Standardlizenz | Nur bei Bedarf für Lücken (z. B. Nyime, Hakusembe). Lizenzbeleg archivieren. |
| Unterkünfte selbst (Pressebereich) | **nur mit schriftlicher Erlaubnis** | Viele Lodges stellen Pressefotos bereit; Nutzung in privater App per E-Mail anfragen. Ohne Erlaubnis **nicht** verwenden – Fallback: Landschaftsfoto der Region. |
| Eigene Illustrationen (SVG) | eigene Rechte | Fallback-Set erweitern (7 Landschaftsklassen, 15 Tier-Silhouetten). |
| Tourismusbehörden (Namibia Tourism Board, Botswana Tourism) | Mediathek-Bedingungen variieren | Nur nach Prüfung der Bedingungen; nicht als gegeben annehmen. |

**Es wurden keine Bildrechte geprüft oder erworben.** Die Tabelle beschreibt Bezugswege, keine erteilten Rechte.

## 4. Asset-Liste

Auflösung = Master-Datei; Auslieferung in Breiten-Varianten durch `next/image`.

### 4.1 Hero & Kapitelbilder

| ID | Motiv | Verwendung | Format | Master | Stil | Prio | Quelle |
|---|---|---|---|---|---|---|---|
| H-01 | Sossusvlei: rote Dünen (Big Daddy/Dune 45) bei Sonnenaufgang, Grat diagonal, Schattenseite tief | Dashboard-Hero vor Abreise, Station 03 | 21:9 + 4:5 | 3200×1371 / 1350×1688 | Golden Hour, warme Schatten, kein Mensch oder sehr klein | **P0** | Unsplash/Pexels; nach Reise eigenes Foto |
| H-02 | Deadvlei: tote Kameldornbäume vor orangefarbener Düne | Station 03 Alternative, Tagebuch-Empty-State | 16:9 | 3200×1800 | grafisch, hoher Kontrast | P1 | Unsplash/Pexels |
| H-03 | Windhoek: Christuskirche oder Hochland-Panorama | Station 02 | 3:2 / 16:9 | 2400×1600 | Abendlicht | P1 | Unsplash/Commons |
| H-04 | Swakopmund: Atlantik, Jetty, Nebel über Dünen | Station 04 | 3:2 / 16:9 | 2400×1600 | kühl-blau, ruhig | **P0** | Unsplash/Pexels |
| H-05 | Erongo-Gebirge: Granitblöcke im Abendlicht | Stationen 05/06 | 3:2 / 16:9 | 2400×1600 | rötlicher Granit, weiter Himmel | P1 | Unsplash/Commons |
| H-06 | Etosha: Salzpfanne mit Zebras/Springböcken, flirrend | Station 07 | 3:2 / 16:9 | 2400×1600 | hell, weiß-ocker | **P0** | Unsplash/Pexels |
| H-07 | Etosha Wasserloch: Elefanten bei Dämmerung | Station 08, Tracker-Hero | 3:2 / 16:9 | 2400×1600 | Dämmerung, Silhouetten | **P0** | Unsplash/Pexels |
| H-08 | Kavango/Okavango-Fluss bei Rundu: Fluss, Mokoro, Schilf | Station 09 | 3:2 | 2400×1600 | grün-blau, Abendlicht | P1 | Commons/Stock |
| H-09 | Divundu/Popa Falls oder Bwabwata: Flusslandschaft | Station 10 | 3:2 | 2400×1600 | üppig grün | P1 | Commons/Stock |
| H-10 | Chobe: Elefanten am Fluss, Boot im Vordergrund | Stationen 11/12 | 3:2 / 16:9 | 2400×1600 | Sunset über Wasser | **P0** | Unsplash/Pexels |
| H-11 | Victoria Falls (Aktivität Kasane) | Buchungs-/Aktivitätskarte | 4:3 | 1600×1200 | Gischt, Regenbogen | P2 | Unsplash |
| H-12 | Makgadikgadi/Nata: Salzpfanne mit Flamingos | Station 13 | 3:2 | 2400×1600 | pastell, weit | P1 | Commons/Stock |
| H-13 | Okavango-Delta aus der Luft (Maun) | Station 14, Archiv-Abschluss | 3:2 / 16:9 | 2400×1600 | Vogelperspektive, Wasserarme | **P0** | Unsplash/Pexels |
| H-14 | Damaraland: Welwitschia oder Wüstenelefanten | Highlight-Kachel, Empty States | 3:2 | 2400×1600 | karg, ocker | P2 | Unsplash/Commons |
| H-15 | Flugzeugflügel über Wolken bei Sonnenuntergang | Station 01 Anreise | 3:2 | 2400×1600 | warm, ruhig | P1 | Unsplash/Pexels |

### 4.2 Unterkünfte (je 4:3, Master 1600×1200)

| ID | Unterkunft | Primär | Fallback | Prio |
|---|---|---|---|---|
| L-01 | Arebbusch Travel Lodge (Windhoek) | Pressefoto mit Erlaubnis | H-03 | P1 |
| L-02 | Sossus Oasis Campsite | Pressefoto mit Erlaubnis | H-01 Ausschnitt | P1 |
| L-03 | Dream Beach Villa (Swakopmund) | Vermieterfoto mit Erlaubnis / eigenes Foto | H-04 | P1 |
| L-04 | Madisa Campsite (Erongo) | Pressefoto mit Erlaubnis | H-05 | P1 |
| L-05 | Sasa Safari Camp | Pressefoto mit Erlaubnis | H-05 | P1 |
| L-06 | Etosha Trading Post Campsite | Pressefoto mit Erlaubnis | H-06 | P1 |
| L-07 | Onguma Tamboti Campsite | Pressefoto mit Erlaubnis | H-07 | P1 |
| L-08 | Hakusembe Tented Camp (Rundu) | Pressefoto mit Erlaubnis | H-08 | P1 |
| L-09 | Nyime Safari Lodge Campsite (Divundu) | Pressefoto mit Erlaubnis | H-09 | P1 |
| L-10 | Ihaha Camping (Chobe) | Pressefoto/Parkverwaltung mit Erlaubnis | H-10 | P1 |
| L-11 | Tlou Safari Lodge (Kasane) | Pressefoto mit Erlaubnis | H-10 | P1 |
| L-12 | Nata Lodge Campingplatz | Pressefoto mit Erlaubnis | H-12 | P1 |
| L-13 | Island Lodge (Maun) | Pressefoto mit Erlaubnis | H-13 | P1 |

Regel: Solange kein Unterkunftsfoto freigegeben ist, zeigt `StayCard` das Regionsfoto mit kleinem Label „Region“ – keine falsche Suggestion, es sei die Unterkunft.

### 4.3 Tiere – Safari-Tracker (1:1, Master 1200×1200)

| ID | Art | Prio | Stil |
|---|---|---|---|
| A-01…A-05 | Büffel, Elefant, Leopard, Löwe, Spitzmaulnashorn (Big Five) | **P0** | Porträt, Augenhöhe, ruhiger Hintergrund, gleiche Lichtstimmung |
| A-06…A-15 | Flusspferd, Gepard, Giraffe, Kudu, Nilkrokodil, Oryx, Springbock, Tüpfelhyäne, Warzenschwein, Zebra | P1 | dto. |
| A-S | 15 Tier-Silhouetten (SVG, eigene) | **P0** | einheitliche Linie, für „ungesehen“-Zustand und Offline |

Quelle: Unsplash/Pexels; nach der Reise eigene Sichtungsfotos als Ersatz anbieten.

### 4.4 Empty States & Sonstiges

| ID | Motiv | Verwendung | Format | Prio | Quelle |
|---|---|---|---|---|---|
| E-01 | Notizbuch/Kamera auf Safari-Fahrzeug-Motorhaube (ohne Marken) | Tagebuch leer | 3:2 | P1 | Unsplash/Pexels |
| E-02 | Fernglas vor Savanne | Tracker leer | 3:2 | P1 | Unsplash/Pexels |
| E-03 | Collage-Platzhalter aus H-01/H-06/H-10 | Galerie leer | 3:2 | P1 | eigene Montage aus lizenzierten Assets |
| E-04 | Lagerfeuer unter Sternenhimmel | Erinnerungsarchiv, Abend-Modus | 16:9 | P2 | Unsplash/Pexels |
| SV-01 | Safari-Fahrzeug (4×4 mit Dachzelt) auf Schotterpiste | Route-Kopf, Fahrtsegmente (Illustration), Pannen-Checkliste | 3:2 + SVG-Icon | P1 | Foto: Unsplash/Pexels; Icon: eigen |
| OG-01 | Sossusvlei + Wortmarke | OG-/Follower-Link-Vorschau | 1200×630 | P2 | eigene Montage |
| LOGO-01 | Wortmarke „Namibia & Botswana“ in Fraunces | Header, Login, OG | SVG | P1 | eigen |
| AV | Profilfotos Familie | Avatare | 1:1, 512×512 | P1 | eigene, Upload in Familie |

## 5. Stilrichtlinien für Bildauswahl
- **Licht:** Golden Hour oder Blaue Stunde; Mittagslicht nur für Salzpfannen.
- **Farbe:** warme Erdtöne, Teal im Himmel/Wasser; keine übersättigten HDR-Bilder.
- **Komposition:** Horizont im unteren oder oberen Drittel, ruhige Fläche für Text (Hero: obere oder untere 35 % frei), Tiere mit Blickrichtung ins Bild.
- **Konsistenz:** einheitliches Color Grading (leichte Wärme +5, Kontrast −5, Schwarztöne angehoben), über ein gemeinsames LUT oder `sharp`-Pipeline.
- **Ethik:** keine Fotos von Personen aus lokalen Gemeinschaften ohne Einwilligung; keine gefütterten/gezähmten Tiere.

## 6. Zeitplan
1. **Vor Abreise (12.10.):** H-01, H-04, H-06, H-07, H-10, H-13, A-01…A-05, A-S – reicht für sichtbaren Sprung (Dashboard, Route, Tracker).
2. **Während der Reise:** eigene Fotos ersetzen schrittweise Stock (Hero-Vorschlag „Bestes Foto des Tages“).
3. **Nach der Reise:** Unterkunftsbilder nur noch aus eigenen Fotos; Stock-Assets entfernen, wo eigene vorhanden.
