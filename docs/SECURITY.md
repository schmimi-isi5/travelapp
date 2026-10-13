# Sicherheit

Dieses Dokument beschreibt, was die Anwendung schützt, wo die Durchsetzung stattfindet und was bewusst nicht abgedeckt ist. Aussagen sind durch die genannten Tests belegt; Unverifiziertes ist als solches markiert.

## 1. Schutzziele
- Familiendaten (Reisepläne, Tagebuch, Medien) sind nur für aktive Mitglieder der eigenen Familie lesbar.
- Finanz- und Ausweisdaten sind nur für Owner und Adults zugänglich. Mitglieder (`member`) und Kinder (`child`) erhalten sie weder über die Oberfläche noch über die Datenbank-API.
- Private Tagebucheinträge und Entwürfe sehen nur ihre Autorinnen und Autoren.
- Registrierung ist nur mit gültiger Einladung möglich.
- Sensible Dokumente (Ausweis, Versicherung) liegen nur verschlüsselt auf dem Server.

## 2. Wo Rechte durchgesetzt werden
| Ebene | Mechanismus | Beleg |
|---|---|---|
| Datenbank | Row Level Security auf allen Tabellen, `security definer`-Hilfsfunktionen mit festem `search_path`, Trigger gegen familienübergreifende Fremdschlüssel, unveränderliche Schlüsselspalten | `supabase/tests/rls.test.ts` (PGlite), `tests/backend/auth-family.test.ts` (echtes Supabase) |
| Storage | private Buckets `media`, `documents`; Policies auf `storage.objects` nach Pfadpräfix `<family_id>/…`; Dokumente nur Owner/Adult; private Medien nur für Uploader | `tests/backend/storage.test.ts` (echtes Supabase Storage) |
| Server-Routen | Einladungsregistrierung prüft Token-Hash, Ablauf, Einmaligkeit; Löschen und Mailversand laufen unter dem JWT der aufrufenden Person | `tests/backend/*.test.ts`, `tests/integration/api.test.ts` |
| Oberfläche | Rollenprüfung im Repository und Ausblenden von Bereichen. **Nur Komfort**, nie die einzige Schranke | `tests/integration/sync.test.ts`, E2E |

## 3. Authentifizierung und Sitzungen
- Supabase Auth (GoTrue), E-Mail + Passwort, Mindestlänge 10 Zeichen, Refresh-Token-Rotation, JWT-Lebensdauer 1 Stunde.
- Öffentliche Registrierung ist abgeschaltet (`POST /auth/v1/signup` wird abgelehnt, getestet). Konten entstehen durch (a) `scripts/bootstrap-owner.mjs` für den ersten Owner, (b) die Einladungsregistrierung.
- Einladungen: 256-Bit-Zufallstoken, in der Datenbank nur als SHA-256-Hash; gültig 7 Tage; einmalig; E-Mail-Bindung (die annehmende Person muss die eingeladene Adresse haben). Abgelaufene, widerrufene oder bereits verwendete Token liefern dieselbe generische Antwort. Rate-Limit: 10 Registrierungsversuche je 10 Minuten und Adresse (in-memory, pro Instanz).
- Sitzung im Browser: supabase-js speichert die Sitzung in `localStorage`. Das ist für eine Offline-First-App nötig, bedeutet aber: gelingt Angreifern JavaScript-Ausführung (XSS), können sie das Token lesen. Gegenmaßnahmen: strikte CSP, keine Fremdskripte, React-Escaping, kein `dangerouslySetInnerHTML`.
- Abmelden löscht Token und die lokale Datenbank des Nutzers (inklusive Medien). Fremde Nutzerdatenbanken werden bei der nächsten Anmeldung entfernt. Ungesendete Änderungen blockieren das Abmelden, bis der Nutzer ausdrücklich bestätigt.
- Abgelaufene oder widerrufene Sitzung: Oberfläche sperrt, Änderungen bleiben in der Warteschlange, nach erneuter Anmeldung des **gleichen** Nutzers werden sie gesendet (`tests/backend/sync.test.ts`).
- Kein MFA, kein Konto-Sperren nach Fehlversuchen (nur die Rate-Limits des Auth-Dienstes). Siehe Einschränkungen.

## 4. Geheimnisse
| Wert | Wo | Hinweis |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Build-Argument, im Browser sichtbar | öffentlich vorgesehen; schützt nichts allein |
| `SUPABASE_SERVICE_ROLE_KEY` | nur Laufzeit-Umgebung der App, nie Build-Argument/Image | umgeht RLS. Nur in `/api/invitations/register` und `/api/account/delete` genutzt |
| `JWT_SECRET`, `POSTGRES_PASSWORD`, `SMTP_PASS`, `KONTUROS_API_KEY` | nur Secrets des Coolify-Projekts | niemals im Repository; lokale Testwerte werden von `scripts/gen-secrets.mjs` erzeugt (`docker/stack.secrets`, gitignored) |
- Logs enthalten keine Passwörter, Token, Autorisierungs-Header oder E-Mail-Adressen (`src/lib/server/logger.ts` schwärzt Schlüssel, getestet). Die Audit-Tabelle `sync_mutations` speichert keine Inhalte.
- Rotation von JWT-Secret/Keys: siehe `docs/OPERATIONS.md`.

## 5. Medien und Dokumente
- Keine öffentlichen Buckets; Zugriff über signierte URLs mit 5 Minuten Gültigkeit (abgelaufene URLs werden abgelehnt, getestet).
- Pfade beginnen mit der Familien-ID, Policies prüfen das Präfix. Fremde Familien können weder signieren, herunterladen noch auflisten (getestet).
- Dateityp- und Größenprüfung doppelt: im Client (`media.ts`, `documents.ts`) und serverseitig durch die Bucket-Konfiguration (MIME-Liste, 100 MB Medien / 20 MB Dokumente; Überschreitung wird abgelehnt, getestet).
- Ausweis- und Versicherungsdokumente werden im Browser mit AES-256-GCM (PBKDF2-SHA-256, 250 000 Iterationen, zufälliges Salz und IV je Datei) verschlüsselt, bevor sie das Gerät verlassen. Die Passphrase wird weder gespeichert noch geloggt; ohne sie ist die Datei nicht lesbar (getestet inkl. Server-Download). Geht die Passphrase verloren, ist das Dokument unwiederbringlich verloren.
- Dateinamen werden bereinigt, Pfade enthalten eine UUID.

## 6. Transport und Header
- TLS endet an Coolify/Traefik; die App ist nur über HTTPS bereitzustellen (Anforderung an das Deployment, siehe `docs/DEPLOYMENT.md`).
- Antwort-Header der App: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, Content-Security-Policy (siehe `next.config.ts`; `unsafe-inline` für Skripte ist wegen Next.js nötig und eine bekannte Schwäche; `worker-src` erlaubt `blob:` für den Kartenrenderer MapLibre).
- CORS am Gateway (Kong) nur für die App-Herkunft.

## 6a. Follower-Links (Lesezugriff ohne Konto)
- Ein Follower-Link ist ein Geheimnis: 256-Bit-Token, in der Datenbank nur als SHA-256-Hash. Wer den Link hat, sieht die freigegebenen Inhalte; Weitergabe lässt sich nicht verhindern, nur beenden. Beenden wirkt sofort (Ansicht und Fotos antworten danach mit 404, getestet).
- Unbekannte, abgelaufene und beendete Links sind von außen nicht zu unterscheiden (404). Rate-Limits je IP: 240 Abrufe / 10 Min., 30 Fehlversuche / 10 Min., 1200 Bilder / 10 Min. (in-memory, pro Instanz).
- Follower greifen nie auf Supabase zu. Der App-Server liest mit dem Service-Role-Schlüssel nur Zeilen mit `shared_with_followers = true`, `visibility = 'family'` (Berichte: veröffentlicht), begrenzt auf 200 Berichte, 300 Fotos, 300 Sichtungen. `src/lib/follow/view.ts` wählt Felder explizit aus: nie Buchungen, Preise, Zahlungen, Dokumente, Unterkunftsadressen, GPS-Standort von Einträgen, Familienprofile (nur Vornamen der Autoren).
- Freigabe ist eine Entscheidung von owner/adult (Datenbank-Trigger), standardmäßig aus, nicht für private Einträge oder Entwürfe.
- Künftige Stationen sind unsichtbar (nur bis zum heutigen Tag, Zeitzone UTC+2), damit der Link nicht verrät, wann niemand zu Hause ist.
- Fotos werden vor der Auslieferung neu kodiert: keine EXIF- und GPS-Daten, maximal 1600 px; höchstens 2 gleichzeitige Umwandlungen (Speicher des Containers, Limit 512 MB). Das Original bleibt im privaten Bucket.
- Antworten tragen `Cache-Control: private, no-store` (Daten) und `X-Robots-Tag: noindex`; die Seite setzt `noindex` und `referrer: no-referrer`.
- Der Klartext-Link liegt nur im `localStorage` des erstellenden Geräts (`nb-follow-token:<id>`) und wird beim Abmelden gelöscht.
- Restrisiko: Der Token steht im URL-Pfad und damit in Zugriffsprotokollen des Reverse-Proxys (Coolify/Traefik). Protokolle nicht weitergeben; im Zweifel Link beenden und neu erstellen.

## 6b. KI-Route
- `/api/ai/generate` verlangt im Produktivmodus eine gültige Anmeldung (401 sonst) und die ausdrückliche Einwilligung im Request; Kontingente je Nutzer und gesamt (429). Der API-Schlüssel des Anbieters liegt nur in der Server-Umgebung. Fehlerprotokolle enthalten den HTTP-Status, nie den Antworttext.
- An den Anbieter gehen nur die gewählten Texte, nie Dokumente, Ausweise oder Zahlungsdaten. Die Kontingente sind in-memory je Instanz; das Ausgabenlimit beim Anbieter ist die harte Grenze.

## 6c. Bildbibliothek (Ortsfotos)
- Öffentliche Referenzfotos (`destination-media`, `destination_images`) sind getrennt von den privaten Familienmedien. Angemeldete Nutzer lesen nur freigegebene Zeilen; geschrieben wird ausschließlich vom Import mit dem Service-Role-Schlüssel (Tabelle und Bucket, kein Client-Schreibrecht, getestet).
- `approved` ist per Constraint nur mit geprüfter Lizenz möglich. Die Auslieferung erfolgt über `/media/destination/…` mit strengem Pfadmuster (`<ort>/<hash12>-<rolle>-<variante>.webp`), kein Hotlinking zu Wikimedia, Abgleich der Pfade verhindert Zugriff auf andere Buckets oder Verzeichnisse.
- An Wikimedia gehen nur Suchbegriffe aus Ortsnamen, keine personenbezogenen Daten. Der Import läuft nur auf einem vertrauenswürdigen Rechner, nicht im Browser und nicht über eine öffentliche Route.

## 6d. Wetter-Route
- `/api/weather` ist ein schmaler Proxy zu Open-Meteo und antwortet im Produktivmodus nur angemeldeten Nutzern (sonst 401, sonst wäre der Server ein offener Proxy), mit Rate-Limit je Nutzer (240 pro Stunde), strenger Eingabeprüfung (Koordinaten, Datum, höchstens 21 Tage) und Cache. An Open-Meteo gehen nur gerundete Koordinaten der Station und Datumsangaben, keine Nutzerdaten.

## 6e. Teilen-Ziel, Profilfoto, Follower-Bilder
- `/share-target` (Android „Teilen mit …“) nimmt auf dem Server nichts an: Die Dateien nimmt der Service Worker im Browser entgegen und parkt sie im Gerätecache, bis die angemeldete App sie importiert. Der Posteingang wird nach dem Import und beim Abmelden geleert. Nur Bilder, Videos und Audio werden übernommen.
- Das Profilfoto ist ein kleines JPEG in `profiles.avatar_data` (Prüfregel in der Datenbank: JPEG-Data-URL, höchstens 60 KB). Gelesen wird es nur von der Person selbst und von Familienmitgliedern, geändert nur von der Person selbst (RLS-Test in `supabase/tests/rls.test.ts`, Sync-Test in `tests/backend/sync.test.ts`).
- Die Follower-Ansicht liefert Ortsfotos nur für bereits erreichte Stationen und nie Familienfotos über diesen Weg; die Bibliotheksbilder sind öffentliche Referenzbilder.

## 6f. KI-Hilfen, Belegerkennung, Kursdienst
- Alle KI-Routen teilen sich Anmeldung, Einwilligung (`consent: true`) und Kontingent (`src/lib/server/ai-guard.ts`). Texte gehen nur auf Knopfdruck und nur die sichtbaren Fakten; die Prompts behandeln `<daten>` nie als Anweisung.
- `/api/ai/receipt` ist der einzige Weg für ein Foto zum Dienst: nur JPEG (Signatur wird geprüft), höchstens etwa 2 MB, mit Bestätigung je Foto im Browser, eigenem Kontingent (20 pro Stunde, 60 pro Tag), ohne Speicherung und mit `Cache-Control: no-store`. Das Foto wird vorher am Gerät neu kodiert (kein EXIF, kein GPS).
- `/api/ai/transcribe` ist der einzige Weg für **Ton** zu einem Dienst: nur Audioformate der Handys, höchstens 10 MB, Bestätigung je Aufnahme im Browser, Anmeldung, Einwilligung, eigenes Kontingent (20 pro Stunde, 60 pro Tag), keine Speicherung, keine Aufnahme und kein Text in Logs. Ohne `TRANSCRIBE_PROVIDER` antwortet die Route mit 503.
- `/api/fx` ist wie `/api/weather` kein offener Proxy: Anmeldung, strenge Prüfung der Währungscodes, Zwischenspeicher, 60 Anfragen pro Stunde.

## 6g. E-Mail-Vorlagen
- Die Dateien in `/mail-templates/` sind öffentlich abrufbar (der Auth-Dienst holt sie ohne Anmeldung), enthalten aber nur Layout, Texte und Platzhalter, keine Daten. Werte in der App-Mail (Namen, Links) werden HTML-maskiert, die Mail enthält weder Skripte noch externe Stylesheets. Links in der Einladungsmail tragen den Einladungs-Token, der nur ein Mal und 7 Tage gilt.

## 7. Datenschutz
- Datensparsam: Standort nur einmalig und mit Einwilligung, EXIF-Datum nur mit Opt-in (Standortdaten aus Fotos werden nie gelesen), keine Hintergrundverfolgung, kein Tracking, keine Drittanbieter-Skripte.
- KI ist aus (`AI_PROVIDER=disabled`); ohne ausdrückliche Einwilligung wird nichts an einen KI-Dienst gesendet.
- Löschung: Owner können die gesamte Familie unwiderruflich löschen (`delete_family_data` + Entfernen aller Storage-Objekte, getestet); Export als JSON/CSV/ZIP für Portabilität.
- Einladungs-E-Mail-Adressen liegen bis zur Annahme in `invitations` (danach bleiben sie dort erhalten, bis die Familie gelöscht wird).

## 8. Abhängigkeiten
Stand `npm audit --omit=dev`: 2 Meldungen (1 moderat, 1 hoch), beide betreffen das in Next.js 15 gebündelte PostCSS. Es liegt auch im Laufzeit-Image (`node_modules/next/node_modules/postcss`, geprüft), wird dort aber nicht benutzt; die App verarbeitet weder zur Laufzeit noch beim Build fremdes CSS. Eine Behebung erfordert Next.js 16 (Major-Update) und wurde bewusst nicht durchgeführt (keine Breaking Changes). Die CI-Prüfung bricht daher erst bei `critical` ab. Nach dem nächsten Next-Update erneut prüfen. Docker-Images der Supabase-Komponenten sind gepinnt; ein Schwachstellen-Scan der Images wurde nicht durchgeführt.

## 9. Bekannte Einschränkungen
- Kein MFA, keine Kontosperre, keine Passwort-Breach-Prüfung.
- Rate-Limit in-memory und pro Instanz; bei mehreren App-Instanzen vervielfacht sich das Limit.
- Sitzungstoken in `localStorage` (siehe oben); keine serverseitigen Cookies.
- CSP erlaubt `unsafe-inline` für Skripte und Styles.
- Die lokale Kopie der Daten (IndexedDB) ist nicht verschlüsselt (Ausnahme: sensible Dokumente). Wer ein entsperrtes Gerät besitzt, kann sie lesen; Geräte sperren.
- Kein Penetrationstest, keine Last- oder Missbrauchstests, keine Prüfung gegen eine öffentlich erreichbare Instanz.
- Löschen entfernt Daten aus der Live-Datenbank; bereits erstellte Backups enthalten sie bis zum Ablauf der Aufbewahrungsfrist (siehe `docs/OPERATIONS.md`).
- Follower-Links: Weitergabe eines Links ist nicht kontrollierbar, es gibt keine PIN und keine Zugriffsprotokolle pro Person (nur Zähler und letzter Abruf je Link).

## 6h. Postfach (Mails der Reiseanbieter)

- **Zugang:** Der Besitzer richtet das Postfach in der App ein (Seite Postfach) oder setzt Server-Variablen (`MAILBOX_IMAP_*`); in der App gespeicherte Angaben gehen vor. Das Passwort liegt nur **verschlüsselt** in `mailbox_settings` (AES-256-GCM, Schlüssel aus `MAILBOX_SECRET_KEY` oder abgeleitet vom Service-Role-Key; ändert sich dieser, ist das Passwort neu einzugeben). Die Tabelle ist für keine Client-Rolle lesbar oder schreibbar; die Routen liefern nie das Passwort zurück, nur ob eines gespeichert ist. Nie im Browser, nie im Image, nie im Log (Fehler werden nur als Code geloggt, Servertexte können den Benutzernamen enthalten). Der Ordner wird schreibgeschützt geöffnet.
- **Verbindung:** immer verschlüsselt (SSL/TLS oder erzwungenes STARTTLS), Zertifikate werden geprüft. Der Servername muss ein öffentlicher Rechnername sein (keine IP-Adresse, keine Namen wie `kong` oder `db`, keine Auflösung auf private, Loopback- oder Link-Local-Adressen), damit die App nicht als Brücke ins interne Netz dient. Einrichten, Testen und Entfernen darf nur der Besitzer, mit eigenem Kontingent. Nur für lokale Tests gibt es `MAILBOX_ALLOW_PRIVATE_HOSTS` und `MAILBOX_ALLOW_PLAINTEXT`; sie dürfen in der Produktion nie gesetzt sein.
- **Wer darf:** Abruf, Liste, Zuordnen und Bestätigen nur Erwachsene der Familie (Prüfung in den Routen und per RLS auf `mail_ingest` und `mail_sync_state`; Mitglieder, Kinder und andere Familien sehen nichts). Geschrieben wird nur serverseitig mit dem Service-Role-Key; Clients haben keinen Schreibzugriff auf die Tabellen. Der zeitgesteuerte Abruf nutzt `MAILBOX_SYNC_SECRET` (mindestens 16 Zeichen, zeitkonstanter Vergleich) und nur bei genau einer Familie.
- **Ablage:** Der Mailtext wird als Datei (`text/plain`) im privaten Bucket `documents` abgelegt (Zugriff nur Erwachsene) und als Dokument der Art `correspondence` an Unterkunft oder Buchung gehängt. Anhänge werden nicht gespeichert, nur ihre Namen stehen im Kopf der Datei.
- **Vorschläge, keine Buchungen:** Zahlungen, Fristen und Buchungsnummern aus Mails sind Vorschläge mit wörtlichem Zitat. Eingetragen werden sie erst nach Klick eines Erwachsenen, über die normalen Schreibwege (`repo.ts`), Zahlungen immer als „nicht verifiziert“ mit der Mail als Beleg.
- **KI-Auswertung:** Nur der Mailtext (höchstens 12.000 Zeichen, ohne Anhänge) geht serverseitig an den KI-Dienst, abschaltbar mit `MAILBOX_AI=off`. Die Mail steht in Datenmarkern und gilt als Daten, nicht als Anweisung. Jedes KI-Ergebnis wird gegen den Mailtext geprüft: das Zitat muss wörtlich vorkommen, Beträge müssen im Zitat stehen, Nummern in der Mail. Der Rest wird verworfen, das schützt vor erfundenen Werten und vor Mails, die das Modell umlenken wollen.
- **Zuordnung:** Eindeutig oder gar nicht (Buchungsnummer, Kontaktadresse, Domain außer bei freien Mail-Anbietern, Name im Betreff). Bei Mehrdeutigkeit bleibt die Mail unzugeordnet und eine Person ordnet sie zu.
