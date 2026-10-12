# 02 Bildquellen

## Wikimedia Commons (umgesetzt)
Offizielle MediaWiki-API `https://commons.wikimedia.org/w/api.php`: `generator=search` (nur Bitmap-Dateien, Namensraum Datei), `prop=imageinfo|coordinates`, `iiprop=url|size|mime|extmetadata`. Gelesen werden Lizenzname und -URL, Urheber, Credit, Nutzungsbedingungen, Einschränkungen, Kategorien, Beschreibung und die primären Koordinaten der Datei. Herunterladen: Vorschaubild mit 2560 px Breite (oder das Original, wenn kleiner) von `upload.wikimedia.org`; die App liefert nie von dort aus, es wird immer in den eigenen Speicher kopiert.

Etikette: eigener `User-Agent`, höchstens eine Anfrage alle 1,6 Sekunden, Wiederholung bei 429 und 5xx mit wachsender Wartezeit. Der erste echte Lauf traf einzelne Drosselungen (429); betroffene Suchbegriffe wurden protokolliert (`search_error`) und der Rest lief weiter.

Kein Scraping, keine Bildersuche über andere Dienste, kein Hotlinking.

## Pixabay (umgesetzt, optional)
Offizielle API `https://pixabay.com/api/`, nur aktiv, wenn `PIXABAY_API_KEY` in der Umgebung des Importlaufs gesetzt ist (der Schlüssel wird nie gespeichert oder ausgegeben, nur Umgebungsvariable). Stockfotos unter der Pixabay Content License (freie Nutzung, Veränderung erlaubt, keine Namensnennung nötig; Urheber und Link stehen trotzdem auf der Seite Bildnachweise). Gesucht wird `image_type=photo`, waagerecht, mindestens 1200 px, `safesearch`, nach Beliebtheit; KI-generierte Bilder (Tags „AI generated“ o. ä.) werden verworfen. Geliefert wird `largeImageURL` mit 1280 px: gilt als Breite 1280 und reicht daher nie für ein Hero-Bild, nur für Karte und Galerie. Die Dateien werden in den eigenen Speicher kopiert (kein Hotlinking). Höchstens eine Anfrage pro Sekunde (Limit der API: 100 pro Minute).

Pixabay liefert keine Koordinaten, daher ist jedes Pixabay-Foto ein **Regionsmotiv** (`location_verified = false`). Zulässig ist es nur, wenn (a) die Tags den Ort nennen, oder (b) die Tags nur das Land nennen **und** das Motiv zum Ort passt (`regionMotifFits`: kein Meer im Busch, keine Dünen am Fluss, keine Safaritiere in der Stadt, keine Gebäude oder Nahaufnahmen). Fall (b) hat `location_basis = country_tag_plausible_motif` und steht so im Prüfvermerk.

## Motivfilter
Vor der Bewertung werden Dateien verworfen, deren Titel oder Kategorien auf Flughäfen und Flugzeuge, Kirchen und andere Einzelgebäude, Bahnhöfe, Straßenszenen, Mineralien und Nahaufnahmen oder Unterkünfte (Lodge, Hotel, Camp, Resort) hinweisen (`UNSUITABLE_MOTIF` in `scripts/destination-images/lib.mjs`, Ablehnungsgrund `motif_unsuitable`). Die App filtert zusätzlich beim Anzeigen (`isScenicMotif`). Bereits gespeicherte, ungeeignete Fotos nimmt `scripts/destination-images/disable.mjs <plan.json>` reversibel außer Betrieb (`approved = false`, mit Vermerk).

## Bewusst nicht genutzt
Google Images, Social-Media-Bilder, Hotelportale und Buchungsplattformen (keine Lizenz zur Weiterverwendung), KI-generierte Bilder als vermeintliche Ortsfotos.

## Unterkünfte
Für die tatsächlich gebuchten Lodges und Campingplätze gibt es keine Bilder in der Bibliothek: Eine verlässlich lizenzierte, eindeutig zugeordnete Aufnahme der Unterkunft liegt nicht vor. Statt dessen zeigt die Unterkunftskarte ein klar als „Region“ beschriftetes Landschaftsmotiv (`StayRegionThumb`, Tooltip „Regionsmotiv, kein Foto der Unterkunft“).
