# 03 Lizenzhandhabung

## Freigabe-Schranke (`classifyLicense`, getestet)
Akzeptiert werden nur: **CC0**, **Public Domain/PDM** und **CC BY / CC BY-SA** (Versionen 2.0 bis 4.0 und länderspezifische Ports). Abgelehnt werden NC, ND, GFDL, Fair Use, „copyrighted“, „all rights reserved“, unbekannte und nicht erkannte Lizenznamen.

Der Lizenzname allein genügt nicht:
- Bei CC BY/BY-SA muss der Urheber bekannt sein (sonst lässt sich die Namensnennung nicht erfüllen): `attribution_author_missing`.
- Dateien mit Einschränkungen (Feld „Restrictions“, z. B. Markenrechte) werden abgelehnt: `file_has_restrictions`.
- Maps, Logos, Flaggen, Personen-/Porträtkategorien, Poster und Nicht-Bitmap-Formate werden ausgeschlossen.

Im Zweifel nicht freigeben: Das Bild wird verworfen, die Rolle bleibt leer, die App zeigt die Illustration.

## Nachweis (revisionsfähig)
Je Zeile: Anbieter, Datei-ID (Titel), Seiten-URL, Urheber, Lizenztyp, Lizenz-URL, `license_checked_at`, `content_hash` (SHA-256 der Quelldatei), Prüfhinweis. Der vollständige Lauf steht im Bericht `import-report-<Datum>.json` (je Ort: Suchbegriffe, Kandidatenzahl, Ablehnungsgründe, gewählte Dateien mit Lizenz und Ortsstatus).

## Namensnennung und Bearbeitung
Jedes angezeigte Foto trägt `ImageAttribution`: „Foto: Urheber / Wikimedia Commons / Lizenz (verkleinert und zugeschnitten)“ mit Link zur Quelle. Die Varianten sind Bearbeitungen (Größe, Zuschnitt, WebP, Metadaten entfernt) und als solche gekennzeichnet. Bei CC BY-SA gilt die Lizenz für die Bearbeitung weiter (ShareAlike); die App ist ein privates Familienprojekt, die Hinweise stehen an jedem Foto. Die Bearbeitungsgrenzen der Commons-Lizenzen (keine Verfälschung, keine Behauptung einer Unterstützung durch den Urheber) werden eingehalten: es wird nichts retuschiert oder hinzugefügt.

## Ortsbeleg
Einziger akzeptierter Beleg: Koordinaten der Datei innerhalb des Radius des Ortes (Stadt 30 km, Park/Gebirge/Wüste 100 km). Dateien mit Koordinaten außerhalb werden verworfen (`location_mismatch`). Dateien ohne Koordinaten dürfen nur dann als **Regionsmotiv** dienen, wenn Titel oder Kategorie den Ort nennen; sie sind `location_verified = false` und in der App sichtbar so beschriftet („Regionsmotiv“). Ein Ortsname in der Suche beweist nichts.

## Annahmen und Grenzen
- Die Lizenzangaben stammen von Commons-Metadaten; eine unabhängige juristische Prüfung hat nicht stattgefunden. Bei Zweifeln an einem Foto reicht `approved = false` (das Foto verschwindet ohne Code- oder Deploy-Änderung).
- Personen auf Fotos werden nur über Kategorien und Titel gefiltert, nicht über Bilderkennung.
- Lizenzen können sich auf Commons ändern. Bestehende Bibliothekszeilen werden nicht automatisch neu geprüft (siehe 08_OPEN_ISSUES.md); `--force` sucht nur nach fehlenden Rollen weiter.
