# To-do nach der Abreise (Stand 12.10.2026)

Reihenfolge = Empfehlung. Kästchen abhaken, wenn erledigt. Alles hier ist **nicht** vor dem Abflug nötig, ausgenommen Abschnitt 1.

## 1. Sicherheit (zuerst, auch unterwegs möglich)
- [ ] **Coolify-Token rotieren** (stand mehrfach im Chat). Danach in Coolify prüfen, dass Resource A und B weiter deployen.
- [ ] **Service-Role-Key der Produktion rotieren** (stand im Chat). Betrifft Supabase-JWT-Secret und App-Umgebung; danach neu deployen. Achtung: ändert die Anon-Keys mit, App-Build-Argumente prüfen.
- [ ] **Pixabay-Schlüssel erneuern** (stand im Chat).
- [ ] **SMTP-Passwort (Strato)** und **Anthropic-Schlüssel** erneuern (standen früher im Chat).
- [ ] **Owner-Passwort** (schmidt.michael@mailbox.org) neu setzen.
- [ ] Offenen **Port 5432** schließen: stammt von einem anderen Supabase-Dienst `supabase-k13qgn51…` auf Hephaistos, nicht von dieser App.

## 2. Backup (offen seit Anfang)
- [ ] Öffentlichen Age-Schlüssel erzeugen: `! bash scripts/gen-backup-key.sh docker/reise-prod.age.key`.
- [ ] Externes Ziel wählen (Empfehlung: Backblaze B2, Hetzner Object Storage oder Strato HiDrive), Zugang eintragen.
- [ ] Branch `feat/coolify-backup` (lokal, nicht gepusht) prüfen, pushen, PR, mergen.
- [ ] Wiederherstellung einmal testen (`scripts/verify-restore`).

## 3. Reisedaten prüfen
- [ ] **Rückflugdatum** prüfen (Reiseende steht auf 3.11., unbestätigt).
- [ ] Unterkünfte/Buchungen mit Status „unklar“ durchgehen (Dashboard: „zu prüfen“) und Belege hinterlegen („Fehlende Belege“).
- [ ] Geräte-Test auf den iPhones (Installation, Offline, Foto-Upload, Teilen) und auf dem Android-Gerät.

## 4. Bilder (erledigt am 12.10.2026)
- [x] **Maun** aufgefüllt, **Erongo** bereinigt: Mineral, Flughafen-, Kirchen- und Küstenmotive (insgesamt 34 Fotos) außer Betrieb genommen (`disable.mjs`, reversibel), Lücken mit den neuen Filtern aufgefüllt. Einige Orte erreichen keine 10 Galeriebilder, weil Qualität vor Menge geht (Erongo, Teile von Rundu/Kasane).
- [x] Strengere Filter in der Importpipeline (`UNSUITABLE_MOTIF`, Stimmigkeitsprüfung für Stockfotos) und in der App (`isScenicMotif`), mit Tests.
- [ ] Unterkunftsfotos: **bewusst nicht automatisiert**. Sie brauchen je Foto die ausdrückliche Freigabe des Betreibers. Wer sie hat, legt sie als eigene Familienfotos (Galerie) ab.

## 5. Dashboard an das Plan-Design angleichen (erledigt am 12.10.2026, Branch `design/v3-plan-angleichung`, noch nicht gemergt)
Umbau auf Branch `design/v3-plan-angleichung`, erst nach der Reise ausrollen. Entscheidungen: Suchleiste wirklich an die Archivsuche anbinden, Glocke nur für Offline-/Sync-Konflikte, Profil mit Initialen (Foto später), Dashboard-Karte als eigene illustrierte SVG-Karte (echte Karte unter „Karte“), „Mitreisen“ unter „Familie“, „Erinnerungen“ unter „Galerie“.
- [x] **P1** Illustrierte Karte `src/components/trip-map-illustrated.tsx`: Umriss, Ländernamen als Wasserzeichen, gepunktete Route, Foto-Pins ohne überlappende Labels, fahrender Wagen an der aktuellen Station, Frankfurt ausgeblendet, ohne Fußnote.
- [x] **P2** Hero: Eyebrow mit Reisedaten, „Willkommen zu unserer Reise“, „Noch n Tage“ (während/nach der Reise „Tag x von y“), Zitat in Script-Schrift, Orts-Label, Datums-Umbruch beheben, Wüstenmotiv aus der Bibliothek.
- [x] **P3** Wetter-Kachel (Ort, Heute, Temperatur, Beschreibung, Sonnenauf-/-untergang; ohne Daten ausblenden); Tipps einklappbar unter „Mehr Tipps“; doppelte Punkte („..“) in `src/lib/tips/recommend.ts` beheben.
- [x] **P4** „Nächster Stopp“: Foto mit Overlay, Pfeil-Button, Plakette „Tag n“, drei Info-Zeilen (Anreise, Übernachtung mit Nächten, Highlights), Hinweis wenn Unterkunft fehlt.
- [x] **P5** Raster 5/5/3, 2/3+1/3, 1/3+2/3; Dreier-Kacheln entfernen; „Fehlende Belege“ als Badge in „Offene Aufgaben“ mit klar benannter Zahl (28 „unklarer Status“ und 30 „ohne Beleg“ sind verschiedene Zählungen); „Letzte Erinnerungen“ nur mit Medien.
- [x] **P6** Reiseimpressionen in weißer Card, 4 Kacheln mit Titel und Untertitel (Etosha, Sossusvlei, Okavango, Chobe), nur Landschaft/Tiere; „Regionsmotiv“ als Tooltip und auf der Bildnachweise-Seite.
- [x] **P7** Aufgaben: max. 4, Kategorie-Icon, Fälligkeit, Prioritätspunkt, „Nicht zugewiesen“ nur bei Relevanz, Eingabe einklappbar (`action-checklist.tsx`).
- [x] **P8** Familie: Avatare mit Name und Rolle, „+ Einladen“; Schnellzugriff mit Zählerzeilen, „Dokumente“ ergänzen.
- [x] **P9** Header: Suche, Profil-Dropdown mit „Abmelden“ und „Aktuell“; Sidebar: aktiver Eintrag gefüllt, Reihenfolge laut Design, „Route“ in „Reiseplan“ und „Karte“ teilen, „KI-Guide“ zu „Reiseführer“, Illustration mit Akazie unten.
- [x] Tests anpassen (`Tab-Leiste`, `featured-stop`, `open-count`, `booking-check`), Screenshots 1536/768/390 px gegen das Plan-Design, Konsole fehlerfrei, Offline-Test.

## 6. Weitere Design-Phasen (V3, Phase 3) (erledigt am 12.10.2026)
- [x] Module im V3-Stil: Alle Module nutzen die gemeinsamen Bausteine (Überschriften in Fraunces, Karten, Chips, neue Kopfzeile und Seitenleiste); Reiseplan und Karte sind getrennt, Familie und Galerie verlinken Mitreisen und Erinnerungen. Es gibt keinen Modul-Einzelumbau darüber hinaus.
- [x] Einheitliche Zustände: `StateBlock` (laden, leer, Fehler, offline, Konflikt, kein Zugriff, Foto fehlt, unbekannt), im Design-System gezeigt und bei Ausgaben eingesetzt. Weitere Seiten können `StateBlock` statt eigener Leertexte nutzen.
- [x] Barrierefreiheit: axe-Tests für Dashboard, Karte, Design-System und die neuen Supabase-Seiten laufen grün.

## 7. Funktionen (erledigt am 12.10.2026)
- [x] Mitglieder-Profilfotos (Migration 0008, `profiles.avatar_data`, RLS-Test, Sync-Test). **Vor dem Deploy läuft Migration 0008 auf der Produktion.**
- [x] Benachrichtigungen aus Fristen, überfälligen Aufgaben und Sync-Konflikten (lokal abgeleitet, Glocke im Header). Später möglich: Push-Nachrichten.
- [x] Android `share_target` (Service Worker, Posteingang, Import in die Galerie; Test mit Chromium).
- [x] Follower-Ansicht mit Ortsfotos und Bildnachweisen (nur erreichte Stationen).
- [x] Wetter bei Ausfall: Das Gerät behält die letzte Antwort (als „älter“ markiert), Wiederanlauf getestet (`tests/unit/weather-client.test.ts`). Beobachtung mit dem Owner-Konto über Tage bleibt Aufgabe der Reise.

## 8. Aufräumen
- [ ] Datei `src/lib/db/.ids.ts.swp` löschen (Editor-Überbleibsel).
- [ ] Importberichte `docs/media-system/import-report-prod-2026-10-11.json` und `…-12.json` committen oder löschen.
- [ ] Alte Branches lokal löschen (`feat/station-recommendations`, `feat/more-images-pixabay`, `fix/backend-image-test`, `design/v3-dashboard`).
- [ ] Prozessregel: Merge nur nach geprüfter CI. (Bei PR #12 wurde mit rotem Backend-Job gemergt, in PR #13 behoben.)

## 9. KI-Hilfen und Planung (umgesetzt am 12.10.2026)
- [x] Tagesbriefing mit Wetter, Tageslicht, späterster Abfahrt, Unterkunft, Aktivitäten, Aufgaben; KI-Tagesvorschau auf Knopfdruck.
- [x] Reise-Check im Reiseplan (Lücken, Überschneidungen, lange Fahrtage, unbestätigte Buchungen) mit KI-„Nächste Schritte“; Hinweis im Dashboard.
- [x] Reiseführer mit Kontext (Datum, Station, Unterkunftsart, Wetter, Gruppengröße; keine Namen).
- [x] Tagebuch: Entwurf aus dem Tag, Titelvorschlag; Archiv: Reise-Rückblick.
- [x] Safari-Tracker: typische Tiere je Ort als Schnellauswahl und als Tipp, Artvorschlag aus der Notiz.
- [x] Ausgaben: Belegfoto lesen lassen (mit Bestätigung je Foto), Referenzkurs laden.
- [ ] **Nicht umgesetzt, braucht deine Entscheidung:** Tierart aus dem Foto (Datenschutz), Routing für echte Fahrzeiten (Anbieter und Schlüssel). Begründung in `docs/DECISIONS.md` 46.
- [x] Sprachmemos als Text (Abschrift, Glätten, Übernahme in den Eintrag) und Einträge löschen sind gebaut. **Zum Einschalten fehlt ein Dienst:** `TRANSCRIBE_PROVIDER=openai` und `TRANSCRIBE_API_KEY` (OpenAI oder ein kompatibler Dienst wie Groq) in Coolify setzen und die App neu deployen (`docs/AI_INTEGRATION.md`).
- [ ] Kosten im Blick behalten: Kontingent 30 KI-Anfragen pro Stunde und 100 pro Tag je Person, Belege 20 pro Stunde und 60 pro Tag; Ausgabenlimit bei Anthropic setzen.
