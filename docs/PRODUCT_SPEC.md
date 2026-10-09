# Product Spec V1 — Namibia & Botswana

**Produkt:** Privater, familienorientierter Reiseassistent. **Sprache:** Deutsch. **Reise:** Namibia/Botswana, Abflug laut Planung am 13.10.2026. Exakte Route/Buchungen sind anhand freigegebener Originaldokumente zu importieren; in diesem Paket enthaltene Demo-Stationen sind weder bestätigte Buchungen noch eine vollständige Route.

## Personas & Zugriffe
Owner (Verwaltung, Erwachsene, Rechnungen/Dokumente), Adult (gemeinsame Planung, Zahlungen, Dokumente je Berechtigung), Member (Beiträge/Medien/Planung, keine standardmäßigen Finanz-/Ausweisdaten), Child (sicherer Familienmodus, Beiträge, Sichtungen, frei gegebene Medien; keine finanziellen oder sensiblen Inhalte). Login, Einladungscode/Einladungslink, Einladung widerrufen, Mitglieder entfernen. Demo mit 5 synthetischen Profilen ohne reale Namen.

## Hauptnavigation
Dashboard | Route | Unterkünfte | Tagebuch | Galerie | Mehr (Buchungen, KI-Guide, Safari-Tracker, Ausgaben, Sicherheit, Familie, Erinnerungen, Einstellungen). Desktop: Topnavigation + Seitennavigation. Mobil: 5 Tabs und Mehr-Menü.

## Kernflüsse
1. Dashboard: heute/kommender Tag, aktuelle/nächste Station, letzte Medien, offene Aufgaben, fehlende Buchungsbelege, Offline-Status, Datenherkunft; Wetter nur mit verbundenem Dienst, sonst `nicht verfügbar`.
2. Route: Stationen nach Datum, Karte mit Pins, Detailseite mit Checklisten, Sehenswürdigkeiten, geplanten Aktivitäten, Unterkunft, Kontakten, Fahrtstrecke. Quelle/Aktualisierungsstand für Highlights; unbekannte Daten sichtbar.
3. Hotels: Name, Ort, Nächte, Check-in/out, Buchungsstatus `unknown|requested|reserved|confirmed|cancelled`, Preis `quoted/confirmed`, Währung, Beleg, Bruttobetrag, Anzahlungen, Restbetrag, Fälligkeit, Buchungsreferenz und Checkliste. Zahlungszustand aus bestätigten Zahlungen berechnen und `unverified` gesondert kennzeichnen. Dateien privat speichern. Filter: offen, teilbezahlt, bezahlt, Klärbedarf.
4. Buchungen: `hotel|flight|car|activity|park|other`, vergleichbare Status, Erinnerungen, Anhänge, Kontakt, Frist; Verknüpfung zur Station.
5. Journal: Text/Audio/Video/Fotos pro Verfasser, mit Datum und optional Station; Entwürfe, Sichtbarkeit `family|private`, Bearbeitung nur eigener Beiträge/mit Rollenberechtigung; automatisierte Zusammenfassung mit Opt-in.
6. Medien: Upload mit Fortschritt, Vorschaubild, EXIF-Verarbeitung optional, Erstellungsdatum, Alben, Favoriten, Vollbild, Download und Export; kein automatisches öffentliches Teilen.
7. KI-Guide: kuratierte ortsgebundene Tipps, Offline-Fallback, Promptfragen, Tagestextentwürfe und Transkription wenn Provider vorhanden; zwingend deutliche Labels für Quelle/Verfügbarkeit; Quellenverlinkung soweit vorhanden.
8. Safari-Tracker: Artenliste, Sichtung mit Uhrzeit, Station, Beobachter, Anzahl optional, Bild, Notiz; gemeinsame Liste, chronologisches Log, persönliche Favoriten.
9. Offline: lokaler Cache für Route, Buchungen, Notfallkontakte, selektierte Medien; Mutationsqueue, Sync-Indikator, Konfliktbildschirm, Limits; keine Zusage für vollständige Kartenkacheln ohne Offline-Kartenanbieter.
10. Sicherheit: Notfallkontakte lokal, optionale Standortfreigabe, Reisedokumente verschlüsselt/privat und vor Kinderrollen geschützt; Pannen-Checkliste; Grenz- und Versicherungshinweise mit Quellen-/Prüfdatum. Keine medizinischen Ratschläge als verbindliche Anweisungen.
11. Ausgaben: Transaktionen und Budgetkategorien; original currency + FX records; Summen pro Währung, Teilzahlungspfade und Export.
12. Archiv: Filter nach Station/Datum/Person/Art, Volltextsuche über Texte, Medien-/Datenexport in portablem Format, zeitunabhängiger Zugriff.

## Pflicht-Feldstatus
Bei allen Fremdinfos: `source_type = imported_document | user_verified | user_entered | editorial | ai_generated | demo`; `verified_at`, `source_reference`, `confidence` optional. Kein Wechsel von Demo zu Echtmodus ohne bewusstes Import-/Freigabeereignis.

## Nicht in V1
Live-Buchungen, Zahlungsinitiierung, Hintergrund-Standorttracking, automatischer Reisepass-Upload an KI, vollwertiges Turn-by-turn-Navigationssystem, garantierte Offline-Karten aller Regionen, gedruckte Fotobücher. Sauber als spätere Erweiterung modellieren.
