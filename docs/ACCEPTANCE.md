# Akzeptanzkriterien / Test-Matrix

## Durchgängige E2E-Szenarien
- [ ] Demo startet ohne API-Schlüssel, Responsive UI mit realistischer Bildsprache, ohne Behauptung echter Buchungen.
- [ ] Route öffnet Karte/Liste und Stationsdetails; Tagesbriefing zeigt korrekte nächste Station und offene Aufgaben.
- [ ] Hotel anlegen, Preis/Beleg/Status hinterlegen, zwei Teilzahlungen hinzufügen: Restbetrag korrekt; nicht verifizierte Zahlung bleibt separat. Kein EUR-Summieren mit BWP/NAD ohne FX.
- [ ] Offenen Hotelpunkt anlegen, Person zuweisen, erledigen; Dashboard aktualisiert.
- [ ] Flug/Mietwagen/Aktivität anlegen und an Station hängen, Nachweis hinzufügen, exportieren.
- [ ] Familienmitglied meldet sich an (Supabase Integrationstest), veröffentlicht Journal mit 2 Fotos + Audio; andere autorisierte Person kann lesen.
- [ ] Kinderprofil kann weder Rechnungen, Ausweisdokumente noch versteckte APIs lesen; RLS-Test mit zwei Familien.
- [ ] Sichtung von Elefant eintragen, Filter nach Art/Station, Bild zuordnen.
- [ ] Offline: Netz aus, Journal erstellen und Hotel-Aufgabe aktualisieren, Queue sichtbar, nach Netz an synchronisieren, Daten erhalten.
- [ ] Zwei Geräte ändern dieselbe Buchung offline: Konflikt sichtbar, keine stille Überschreibung.
- [ ] KI ohne Provider zeigt offline kuratierte Empfehlungen; keine fiktiven Live-Informationen. Mit Stub-Provider: nachvollziehbarer KI-Entwurf mit Label.
- [ ] Sicherheitskontakte ohne Netz verfügbar; sensible Dokumente bleiben rollenbeschränkt.
- [ ] Archiv durchsuchen, JSON/CSV + ZIP exportieren, importfähiges Manifest vollständig.
- [ ] PWA installierbar, Lighthouse accessibility/PWA kontrollieren, 390/768/1440 Pixel Screenshots erstellen.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run test:e2e` erfolgreich. Falls externer Dienst fehlt, ausschließlich dessen Integration als `not_configured` melden.

## Qualität
WCAG AA soweit messbar, Fokusindikatoren, Locale de-DE, Intl.NumberFormat für Währungen, datensparsame Defaults, Upload-Limits, Fehlerzustände und Skeletons; Security-RLS und Upload-Tests sind Blocker.
