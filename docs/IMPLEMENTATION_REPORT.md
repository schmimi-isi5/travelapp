# Implementierungs- und Abnahmebericht (Produktivvorbereitung)

Stand: 2026-10-09 · Branch `feat/v1-travel-companion` · **nichts committet, nichts gepusht, nichts deployt** (die Freigabe dafür liegt beim Auftraggeber).
Auftrag: V1 für den Betrieb auf Coolify mit selbst gehostetem Supabase vorbereiten (Arbeitspakete A–K). Konturos bleibt zurückgestellt (`AI_PROVIDER=disabled`), der Import der echten Reiseplanung folgt später.

## A. Implementierte Komponenten

| Paket | Ergebnis |
|---|---|
| A Container | `Dockerfile` (3 Stufen, `node:22.23.3-alpine3.24`, `output: standalone`, Benutzer 10001, read-only Root-Dateisystem, tini, Healthcheck `/api/health`), `.dockerignore`. Image 325 MB, Leerlauf 50 MiB RAM, `docker stop` in 0,13 s mit Exit 0. `NEXT_PUBLIC_*` nur als Build-Args, Geheimnisse nur zur Laufzeit (Image-Historie enthält keine Schlüssel). Strukturierte JSON-Logs der Server-Routen (`src/lib/server/logger.ts`, schwärzt Geheimnisse). |
| B Supabase | `docker/supabase/compose.yml`: Postgres 15, Kong, GoTrue, PostgREST, Storage (Versionen gepinnt, siehe `docs/DEPLOYMENT.md`); Studio/Meta nur im Profil `admin` und nie exponiert; kein Postgres-Hostport; isoliertes Netz, benannte Volumes, Healthchecks, Neustartregeln, Log-Rotation, Ressourcenlimits aus Messungen. Migrationsjob mit Advisory-Lock, Prüfsummen und Wartelogik auf `auth`/`storage`. Neue Migrationen **0004** (App-Spalten, Dokumentklasse, Artenkatalog, Views mit `version`) und **0005** (Bucket-MIME für verschlüsselte Dokumente). |
| C Auth/Familie | Anmeldung, Abmeldung, Passwort-Reset (SMTP), Einladung-only-Registrierung (öffentliche Registrierung abgeschaltet; Konto wird serverseitig nur für gültige Einladung angelegt), Einladungsannahme über `accept_invitation`, Familiengründung über `create_family`, Erst-Owner per `scripts/bootstrap-owner.mjs`, geschützte Routen (`AuthGate`), Rollenwechsel/Entfernen durch den Owner, Einladungsmail per SMTP oder manueller Link. |
| D Datenzugriff | `SupabaseRemote` hinter derselben Adapter-Schnittstelle wie der Demo-Server: Versionsprüfung, idempotente Mutationen (`sync_mutations`), Seiten-Pull, Views für Mitglieder/Kinder, Spalten-Mapper mit Tests. Supabase-Modus startet mit leerer Familie; Demo-Daten gelangen nie dorthin. |
| E Medien/Dokumente | Upload in private Buckets, Anzeige über 300-s-Signed-URLs, Typ-/Größenprüfung clientseitig und im Bucket, Dateiname-Bereinigung, Datei vor Datenbankzeile, Offline-Upload-Warteschlange (200 MB), fehlgeschlagene Uploads halten nur ihre Zeile zurück, Ausweis/Versicherung bleiben AES-256-GCM-verschlüsselt (Server sieht nur Chiffretext, lokale Kopie wird nach Upload entfernt). Fallback für Browser ohne Blob-Speicherung in IndexedDB. |
| F Offline-Sync | Auto-Sync kurz nach Änderungen, bei Reconnect, Fokus und alle 60 s; Konflikte sichtbar (Serverablehnungen mit Grund), Tagebuch append-first, abgelaufene Sitzung ⇒ Warteschlange bleibt, nach Neuanmeldung gesendet; Abmelden löscht die lokale Datenbank des Nutzers (mit Warnung bei ungesendeten Änderungen), fremde Nutzerdatenbanken werden entfernt; Kaltstart ohne Netz mit gespeicherter Sitzung; Service Worker precacht alle Seiten samt Skripten. |
| G Zwölf Module | Alle weiterhin funktionsfähig im Demo- und im Supabase-Modus (Details in den Tests unten). Allgemeine Reisehinweise sind als redaktionelle, nicht verifizierte Texte gebündelt. |
| H Backup | `docker/backup/` + `compose.backup.yml`: `pg_dump -Fc` + Globals + Storage-Volume + Konfiguration, mit `age` verschlüsselt, SHA-256-Manifest, Aufbewahrung 7/4/6, Sperrdatei, JSON-Logs, optional S3; Restore in neue Datenbank, Überschreiben nur mit `RESTORE_CONFIRM_OVERWRITE`. |
| I Tests | siehe B. |
| J Design | Bestehende Gestaltung unverändert übernommen; neue Anmelde-/Einladungs-/Einrichtungsseiten im gleichen Stil; Screenshots aktualisiert. |
| L Mitreisen (Follower) | Privater Link ohne Konto: Stationen bis heute, nur freigegebene Berichte, Fotos (ohne EXIF/GPS) und Tiersichtungen, Widerruf, Ablaufdatum, Verwaltung unter `/followers`, Demo-Vorschau `/f/demo`. Migration 0006, DECISIONS 32, SECURITY 6a. Stufe 2 offen: Grüße/Kommentare, E-Mail-Benachrichtigung, PIN. |
| K Doku | `OPERATIONS.md`, `SUPABASE.md`, `DEPLOYMENT.md`, `SECURITY.md`, `DECISIONS.md` (18–30), `AI_INTEGRATION.md`, README, CLAUDE.md. |

## B. Testergebnisse (letzter Lauf, alle gegen den aktuellen Stand)

| Prüfung | Ergebnis |
|---|---|
| `npm run lint` / `npm run typecheck` | sauber (`supabase/tests` ist vom Typecheck ausgenommen) |
| `npm test` | **177 bestanden** (Unit, Integration mit fake-indexeddb, 65 RLS/Migrationen in PGlite) |
| `npm run build` | erfolgreich |
| `npm run test:backend` (echter lokaler Supabase-Stack) | **50 bestanden** (inkl. 8 Follower-Link-Tests und 1 Sync-Test zur Freigabe), 5 bewusst übersprungen (`not_configured`-Zweige, falls kein Stack läuft). Dateien: auth-family 13, storage 10, sync 10, mail 2, gateway 6. Dreimal hintereinander stabil. |
| `npm run test:e2e:supabase` (App-Container + Stack) | **15 bestanden** (14 Chromium inkl. Follower-Ablauf, 1 iPhone-WebKit) |
| `npm run test:e2e` Demo-Modus | **107 bestanden**, 1 übersprungen (Offline-Karten-Test in WebKit): Chromium inkl. Karten-, Follower- und axe-Tests, WebKit, Pixel 7, iPhone 14 |
| `scripts/verify-restore.sh` | bestanden (vom Infra-Agent und von mir erneut ausgeführt): Zeilenzahlen, SHA-256 eines Storage-Objekts und Login nach Totalverlust identisch |
| Lighthouse 12 | Demo-Startseite: Barrierefreiheit 100, Best Practices 100, SEO 91. Anmeldeseite im Container: 100 / 96 / 100 (die 96: Chrome meldet einen CSP-Hinweis im Issues-Panel, vermutlich `unsafe-inline`, nicht weiter untersucht) |
| Docker | Container healthy, Benutzer 10001, `docker stop` 0,13 s Exit 0, Speicherbedarf siehe `docs/OPERATIONS.md` |

**Nicht ausführbar / nicht ausgeführt**
- **Firefox:** startet auf diesem Rechner nicht („Could not find profile folder“, Playwright-Firefox 157 unter macOS 27); kein App-Fehler, aber auch kein Firefox-Testnachweis.
- **GitHub-Actions-Workflow** (`.github/workflows/ci.yml`) wurde geschrieben, aber nie ausgeführt.
- Coolify selbst, echte SMTP-Anbieter, S3-Backupziel, amd64-Hardware.

**Beim Testen gefundene und behobene Fehler (Auswahl):** CORS-Header `x-retry-count` fehlte am Gateway (blockierte Wiederholungsanfragen im Browser nach Netzausfall); Mitglieder/Kinder sahen keine Unterkünfte/Buchungen (Views ohne `created_at`); abgelaufene Sitzung wurde als Rechteverweigerung gewertet; veraltete Sitzung beim Nachladen der Mitgliedschaft (Einladungsannahme landete auf „Einrichtung“); fehlender Hinweisladezustand beim ersten Start; Offline-Kaltstart wartete ~15 s auf Netzwerk-Retries; Precache fand Chunks in Routengruppen `(main)` nicht; Kong/REST-Limits zu knapp (angehoben); HTML-Mail unescaped.

## C. Sicherheitsstatus
Belegt gegen **echtes** Supabase (`tests/backend`, `tests/e2e-supabase`):
- Öffentliche Registrierung wird abgelehnt; Registrierung nur mit gültigem, offenem, unabgelaufenem Einladungstoken; abgelaufene/widerrufene/unbekannte Token erhalten dieselbe Antwort; Einmaligkeit; E-Mail-Bindung (fremder Nutzer kann Einladung nicht übernehmen); Rate-Limit (429).
- Abmelden widerruft das Refresh-Token; falsches Passwort wird abgewiesen.
- Rollenmatrix per RLS: `member` und `child` lesen weder Stays, Zahlungen, Ausgaben, Dokumente, Wechselkurse noch Einladungen (auch nicht per REST mit eigenem Token); Overview-Views enthalten keine Preis-/Referenzfelder; Schreibversuche scheitern; nur der Owner ändert Rollen; keine Selbst-Beförderung; Entfernte Mitglieder verlieren sofort den Zugriff.
- Familienübergreifende Isolation: Lesen, Ändern, Löschen, Einfügen und Fremdschlüssel auf Daten einer anderen Familie scheitern für alle vier Rollen.
- Private Tagebucheinträge und Entwürfe nur für Autoren; private Medien für Erwachsene nicht signierbar.
- Storage: nicht öffentlich lesbar, Signed URLs laufen ab, fremde Familien können weder signieren, herunterladen noch auflisten, Upload in fremde Präfixe und fehlerhafte Pfade scheitern, ausführbare Dateitypen und >20 MB im Dokumenten-Bucket werden abgelehnt, Dokumenten-Bucket nur für Owner/Adult, Chiffretext wird akzeptiert und enthält keinen Klartext.
- Familienlöschung (DSGVO) nur durch den Owner, entfernt Datenbankzeilen und alle Storage-Objekte.
- Gateway: Pflicht-API-Key, CORS nur für die App-Herkunft, interne Dienste nicht öffentlich.
- Security-Header inkl. CSP an der App.

Nicht abgedeckt: Penetrationstest, MFA, Kontosperre, Last-/Missbrauchstests, Image-Schwachstellenscan. Dependency-Audit: 2 Meldungen zum in Next 15 gebündelten PostCSS (hoch/moderat), Behebung nur über Next 16 (Major), bewusst nicht durchgeführt. Details in `docs/SECURITY.md`.

## D. Infrastrukturstatus
**Lokal getestet (arm64, Docker Desktop):** komplette Kette Secrets erzeugen → Stack starten → Migrationen (idempotent, Prüfsummenschutz) → App-Container → Backend- und Browser-Tests → Backup → Totalverlust → Restore. Compose-Dateien: `docker/supabase/compose.yml` (+ `compose.local.yml`, `compose.backup.yml`), `docker/compose.app.yml` (+ `compose.app.local.yml`).
**Für Coolify vorbereitet, nicht dort getestet:** zwei Ressourcen (Compose + Dockerfile), Domains, Build- vs. Laufzeitvariablen, Persistenz, Smoke-Test, Rollback, Upgrade (`docs/DEPLOYMENT.md`). Unbekannt ist, wie Coolify den beendeten `migrate`-Container und relative Bind-Mounts behandelt.

## E. Offene Konfiguration (vom Auftraggeber benötigt)
- **Domains:** App (z. B. `reise.<domain>`) und API (z. B. `api.reise.<domain>`); beide müssen HTTPS haben.
- **Neue Secrets für Produktion:** `node scripts/gen-secrets.mjs --out … --site-url … --api-url …` erzeugt JWT-Secret, Anon-/Service-Key, Postgres-Passwort; in Coolify eintragen.
- **SMTP:** für Auth-Mails (Reset) in der Supabase-Compose **und** optional für Einladungsmails der App (`SMTP_HOST/PORT/SECURE/USER/PASS/FROM`); Absenderdomain mit SPF/DKIM.
- **Backup:** Backup-Schlüssel (`scripts/gen-backup-key.sh`, privaten Schlüssel extern sichern), Aufbewahrung, optional S3-Ziel.
- **Erst-Owner:** E-Mail, Passwort, Familienname für `scripts/bootstrap-owner.mjs`.
- **Servergröße:** Zielserver (amd64?) erneut mit `scripts/measure-resources.sh` messen; derzeitige Summe der Limits ≈ 2,2 GB.
- **`.env.example`** konnte wegen der Projekt-Berechtigungen nicht aktualisiert werden; fehlende Variablen stehen im README und in `docs/DEPLOYMENT.md`.

## F. Screenshots
`docs/screenshots/{390,768,1440}/` (Demo-Modus, 19 Ansichten je Breite, inkl. Kindprofil) und `docs/screenshots/supabase/{390,768,1440}/` (Produktivmodus: Anmeldung, Einladung, Einrichtung, leere Zustände, Familie mit Einladung, Route mit Station, Mitgliedersicht, Mehr-Menü). Erzeugt mit `npm run screenshots` bzw. `npm run screenshots:supabase`. Die Produktivmodus-Aufnahmen zeigen Testkonten der lokalen Testumgebung (fiktive Adressen `…@example.test`).

## G. Bekannte Einschränkungen
- Kein Test auf Coolify, in GitHub Actions, in Firefox, auf amd64.
- Sitzungstoken liegt in `localStorage` (nötig für Offline-First); CSP erlaubt `unsafe-inline`; Rate-Limit nur pro Instanz im Speicher; kein MFA.
- Uploads sind nicht fortsetzbar (Abbruch startet die Datei neu), Fortschrittsanzeige stufenweise, keine Thumbnails.
- Erster Start auf einem neuen Gerät braucht Internet (Hydrierung); Seiten, die offline erstmals geöffnet werden, funktionieren, weil alle Hauptseiten vorab gecacht werden, dynamische Detailseiten (`/route/<id>`) erst nach dem ersten Besuch.
- Eine Person gehört in der Oberfläche genau einer Familie an; die Datenbank erlaubt mehrere, die App wählt die erste aktive.
- Einladungs-Mailadressen bleiben bis zur Familienlöschung gespeichert; Backups enthalten gelöschte Daten bis zum Ablauf der Aufbewahrung.
- Backend-Tests hinterlassen Testdaten im lokalen Stack (`scripts/stack.sh reset` räumt auf).
- Karte: OpenStreetMap-Kacheln bis Zoom 12 (Pisten und Wasserlöcher teils unvollständig), keine POI-Symbole, keine Navigation, keine Transkription, keine Budget-Limits, kein Live-Wetter, kein Import der echten Reiseplanung, Konturos nicht aktiv.
- Allgemeine Reisehinweise sind nicht verifiziert (Aktualität/Quellen vor Reisebeginn prüfen).
- Lighthouse „Best Practices 96“ auf der Anmeldeseite: CSP-Hinweis in Chrome, Ursache nicht abschließend geklärt.

## H. Freigabevorbereitung (konkrete Schritte)
1. Änderungen prüfen und committen (Conventional Commits, kleine thematische Commits, z. B. Migrationen, Adapter, Auth, Docker, Doku) und Pull Request erstellen. *Erfordert Ihre Freigabe.*
2. GitHub-Actions-Workflow einmal laufen lassen und Fehler beheben.
3. Domains, SMTP, Backup-Ziel und Secrets festlegen (Abschnitt E), Produktions-Secrets neu erzeugen.
4. In Coolify: Resource A (Supabase-Compose) deployen, `migrate`-Lauf prüfen, Resource B (App) deployen, Smoke-Test nach `docs/DEPLOYMENT.md`.
5. Erst-Owner anlegen, Reise einrichten, Familienmitglieder einladen; Rechte mit einem Kind- und einem Mitgliedskonto auf der echten Instanz gegenprüfen.
6. Backup einrichten und **einen Restore-Drill auf der Zielumgebung** durchführen (`docs/OPERATIONS.md`).
7. Auf einem echten iPhone und Android-Gerät installieren (PWA), Offline- und Upload-Verhalten prüfen.
8. Reiseplanung nachliefern und importieren (separates Arbeitspaket, `docs/IMPORT_POLICY.md`); bis dahin keine Echtbuchungsdaten behaupten.
9. Next.js-Major-Update einplanen (PostCSS-Hinweise), Images regelmäßig aktualisieren und scannen.
10. Produktivfreigabe durch den Auftraggeber.
