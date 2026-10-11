# 06 Designintegration

## Komponenten (`src/components/destination-image.tsx`)
| Komponente | Zweck |
|---|---|
| `ResponsiveTravelImage` | `<img>` mit `srcset` (Hero 800/1200/1920 w, Karte 320/800 w, Galerie 320/1200 w), `sizes`, Breite/Höhe (stabiles Layout), Alt-Text aus der Bibliothek, `loading="lazy"`; Hero mit `fetchpriority="high"` |
| `ImageAttribution` | Urheber, Lizenz, Link zur Quelle; „Regionsmotiv:“ bei nicht belegtem Ort |
| `DestinationHero` | Vollflächiger Hintergrund einer Station mit Verlauf (Textlesbarkeit), Nachweis unten im Fluss (keine Überdeckung von Knöpfen); ohne Foto die Illustration |
| `StopCover` | Titelbild der Stationskarte (Foto oder Illustration), „Regionsmotiv“-Marke |
| `StayRegionThumb` | kleines, beschriftetes Regionsmotiv an der Unterkunftskarte |

Die Komponenten holen Bild und Metadaten über `useStopImages(stop)`; kein Ort ist in Seiten kodiert.

## Wo es sichtbar ist
- **Dashboard:** großes Hero der aktuellen oder nächsten Station (`DestinationHero`).
- **Route:** Stationskarten mit Foto, Fahrstrecken wie zuvor.
- **Station:** Hero, danach „Bilder aus <Ort>“ (bis zu drei, je mit Nachweis).
- **Unterkünfte:** Regionsmotiv an jeder Karte.
- Die Follower-Ansicht und die Galerie der Familienfotos bleiben unverändert (Familienfotos sind getrennt).

## Designsprache
Overlays in Deep Teal (`from-deep via-deep/55 to-deep/10`), Nachweis in Weiß auf dem Verlauf, Serifenüberschrift (Fraunces) für „Abreise in 2 Tagen“, Safari Gold für die Hauptaktion. Bildausschnitt per Zuschnitt auf den Bereich mit der meisten Aufmerksamkeit (sharp `attention`).

## Fallbacks
Ohne Bibliothek (Demo-Modus, nicht angemeldet, keine freigegebenen Bilder) oder bei Fehlern erscheinen die vorhandenen SVG-Illustrationen. Der Demo-Modus bleibt bewusst bei den Illustrationen. Die Tests erzwingen: Entzug der Freigabe führt ohne Code-Änderung zur Illustration.

## Performance
Gemessene Dateigrößen der erzeugten WebP-Varianten (52 Bilder): Hero Desktop Ø 282 KB, Tablet 116 KB, Mobil 69 KB; Karte Ø 63 KB, Vorschau 11 KB; Galerie voll Ø 114 KB, Vorschau 10 KB; Summe aller Varianten 9,1 MB. Ein Telefon lädt für die Startseite eine Hero-Datei (ca. 70 KB) statt 2 MB Originale. Bilder sind unveränderlich (Pfad enthält den Inhalts-Hash) und mit `Cache-Control: public, max-age=31536000, immutable` ausgeliefert. AVIF ist nicht erzeugt (siehe 08).

## Offline
- Service Worker: Anfragen an `/media/destination/` werden aus dem eigenen Cache `nb-images-v1` bedient (Cache zuerst, dann Netz); der Cache bleibt bei Shell-Updates erhalten.
- Beim Start online lädt die App die Bibliotheksliste (Zwischenspeicher im Gerät) und fordert im Leerlauf die wichtigen Varianten einmal an: Hero für die Bildschirmgröße, Stationskarten samt Vorschau, Galerie-Vorschauen (höchstens 80 Dateien, auf einem Telefon rund 1,8 MB, auf dem Desktop rund 3,9 MB bei 11 Orten).
- Browsertest: Nach dem Vorwärmen lädt die Routenseite im Offline-Modus die Titelbilder aus dem Cache.
- Nicht vorab geladen: große Galerie-Varianten (nur nach Aufruf).
