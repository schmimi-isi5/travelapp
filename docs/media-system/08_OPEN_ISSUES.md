# 08 Offene Punkte und Einschränkungen

## Bilder und Rechte
- **Erongo** hat keinen Hero und nur ein Karten-/Galeriebild (Regionsmotiv). Es fehlen qualitativ passende, verortete Fotos in Commons; die Illustration ist dort die ehrlichere Lösung.
- **Hero-Qualität ist heuristisch:** Bewertung nach Größe, Format, Titel, Kategorien und Ortsbeleg; kein Ästhetik- oder Bilderkennungsmodell. Einzelne Hero-Motive (z. B. Windhoek: Parlamentsgebäude als Regionsmotiv, Nata: Vogelfoto im Bird-Sanctuary-Ort) sind vertretbar, aber nicht „Premium-Safari“. Austausch über `approved = false` und erneuten Lauf.
- **Personenbilder** werden nur über Kategorien und Titel gefiltert.
- **Lizenzen:** Aus den Commons-Metadaten abgeleitet, keine unabhängige juristische Prüfung. Bestehende Zeilen werden nicht automatisch neu geprüft (kein Re-Check-Lauf).
- **Unterkünfte:** keine Fotos der gebuchten Lodges; nur beschriftete Regionsmotive. Offizielle Pressebilder müssten mit dokumentierter Freigabe des Betreibers kommen.
- **Aktivitäten:** keine eigene Bildkomponente (`ActivityImageCard`); Aktivitäten sind Buchungsposten ohne Ortsdaten.
- **Pexels** nicht angebunden (kein Schlüssel, keine belastbaren Ortsmetadaten).

## Technik
- **Produktion:** Migration 0007, der Import und die Nachbereinigung (24 ungeeignete Fotos außer Betrieb, `disable.mjs`) laufen auf der Produktion. Neue Orte: Import gegen die API-Domain (siehe 04).
- **AVIF** wird nicht erzeugt (nur WebP); Einsparung wäre gering gegenüber dem Aufwand für Browserweichen.
- **Verknüpfung über Koordinaten:** Stationen ohne Koordinaten und ohne passenden Ortsschlüssel bekommen kein Foto.
- **Cache:** Der Bildcache hat kein eigenes Größenlimit außer dem Vorwärm-Limit (80 Dateien). Geleerte Browserdaten leeren ihn.
- **Dashboard-Hero vor der Reise:** Zeigt das Foto der ersten Station mit Foto (Windhoek), nicht der Abflug.
- **Rate-Limits:** Commons drosselt gelegentlich (429); betroffene Suchbegriffe fehlen dann im Lauf. Ein zweiter Lauf füllt Lücken.
- **Follower-Ansicht** zeigt Ortsfotos erreichter Stationen mit Bildnachweisen (seit 12.10.2026).
- Die Designreferenzen `docs/design-references/` existieren nicht im Repository; es wurde nach `docs/design-audit/` und `CLAUDE.design.md` gestaltet.
