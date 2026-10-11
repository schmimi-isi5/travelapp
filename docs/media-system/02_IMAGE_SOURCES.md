# 02 Bildquellen

## Wikimedia Commons (umgesetzt)
Offizielle MediaWiki-API `https://commons.wikimedia.org/w/api.php`: `generator=search` (nur Bitmap-Dateien, Namensraum Datei), `prop=imageinfo|coordinates`, `iiprop=url|size|mime|extmetadata`. Gelesen werden Lizenzname und -URL, Urheber, Credit, Nutzungsbedingungen, Einschränkungen, Kategorien, Beschreibung und die primären Koordinaten der Datei. Herunterladen: Vorschaubild mit 2560 px Breite (oder das Original, wenn kleiner) von `upload.wikimedia.org`; die App liefert nie von dort aus, es wird immer in den eigenen Speicher kopiert.

Etikette: eigener `User-Agent`, höchstens eine Anfrage alle 1,6 Sekunden, Wiederholung bei 429 und 5xx mit wachsender Wartezeit. Der erste echte Lauf traf einzelne Drosselungen (429); betroffene Suchbegriffe wurden protokolliert (`search_error`) und der Rest lief weiter.

Kein Scraping, keine Bildersuche über andere Dienste, kein Hotlinking.

## Pexels (nicht umgesetzt)
Der Auftrag nennt Pexels als optionalen Adapter. Er ist nicht integriert: Es liegt kein API-Schlüssel vor, und Pexels-Fotos tragen keine belastbaren Ortsmetadaten, die unser Ortsbeleg verlangt (ein Treffer für „Etosha“ beweist nicht, dass das Foto dort entstand). Die Pipeline ist anbieterneutral: Ein Anbieter muss `search(query, limit)` mit denselben Feldern und `download(url)` liefern (siehe `commons.mjs`). Ein Pexels-Adapter dürfte nur Bilder als `location_verified = false` (Regionsmotiv) liefern und müsste die API-Bedingungen (Attribution, Limits, keine Weitergabe als Konkurrenzdienst) einhalten.

## Bewusst nicht genutzt
Google Images, Social-Media-Bilder, Hotelportale und Buchungsplattformen (keine Lizenz zur Weiterverwendung), KI-generierte Bilder als vermeintliche Ortsfotos.

## Unterkünfte
Für die tatsächlich gebuchten Lodges und Campingplätze gibt es keine Bilder in der Bibliothek: Eine verlässlich lizenzierte, eindeutig zugeordnete Aufnahme der Unterkunft liegt nicht vor. Statt dessen zeigt die Unterkunftskarte ein klar als „Region“ beschriftetes Landschaftsmotiv (`StayRegionThumb`, Tooltip „Regionsmotiv, kein Foto der Unterkunft“).
