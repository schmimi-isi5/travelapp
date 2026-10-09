# Betrieb

Stand: 2026-10-09. Alle Befehle und Messwerte stammen aus lokalen Läufen (Docker Desktop VM, 12 CPUs, 8 GB). Nicht verifiziert ist alles, was Coolify selbst betrifft; es ist markiert. Einrichtung: `docs/DEPLOYMENT.md`.

## Architektur

```
  Browser (PWA)
     |  https://reise.<domain>                 https://api.reise.<domain>
     v                                           v
 +-----------+   SUPABASE_INTERNAL_URL    +--------------------------------------------+
 |  app      |--------------------------->|  kong :8000  (einziger Eingang, DB-less)   |
 |  Next.js  |   (http://kong:8000)       |  /auth/v1 -> auth :9999   key-auth + CORS  |
 |  :3000    |                            |  /rest/v1 -> rest :3000   key-auth + CORS  |
 +-----------+                            |  /storage/v1 -> storage :5000              |
       |  (Netz "backend", isoliert)      |     (nur /object/sign/ ohne Key)           |
       +--------------------------------> +---------+----------+----------+-----------+
                                                    |          |          |
                                              +-----v--+  +----v---+  +---v------+
                                              |  auth  |  |  rest  |  | storage  |--- volume storage-data
                                              +----+---+  +----+---+  +----+-----+
                                                   \          |          /
                                                    +----v----v--------v+
                                                    |  db (Postgres 15)  |--- volume db-data, db-config
                                                    +----^---------------+
   migrate (One-Shot) -------------------------------------+     backup (cron) -> /backups (+ optional S3)
   meta + studio (Profil "admin", nicht exponiert)
```

Postgres hat in der Produktions-Compose keinen Host-Port. Lokal (`compose.local.yml`) nur `127.0.0.1:54329`.

## Ressourcen

Gemessen mit `scripts/measure-resources.sh` am 2026-10-09 (Apple Silicon, Docker-VM 12 CPUs / 8 GB, arm64-Images): Leerlauf und Last (200 PostgREST-Requests mit Nutzer-JWT, 10 parallel, 20 Logins, 6 Uploads à 2 MB inkl. Download). Absolute Werte hängen von Host, Architektur und Datenmenge ab; auf dem Zielserver (amd64) erneut messen.

| Container | Leerlauf MiB | Spitze MiB | Limit (`deploy.resources`) |
|---|---:|---:|---:|
| db | 69 | 84 | 512M |
| auth | 26 | 29 | 128M |
| rest | 120 | 139 (187 nach breiter Testlast) | 384M |
| storage | 76 | 82 | 384M |
| kong | 130 | 132 (234 nach breiter Testlast) | 384M |
| app | 49 | 51 | 256M |
| mailpit (nur lokal) | 17 | 17 | 64M |
| meta / studio (`admin`, einmal im Leerlauf gemessen) | 120 / 205 | nicht unter Last gemessen | 256M / 512M |
| migrate, backup | nicht gemessen | | 128M / 256M (geschätzt) |

Limits liegen bei rund 1,5 bis 2x der Spitze, aufgerundet; `db` höher, weil `shared_buffers` (128 MB) mit der Datenmenge belegt wird. Kong lief ohne Einschränkung mit 370 MiB (12 Worker); `KONG_NGINX_WORKER_PROCESSES=2` senkt das auf etwa 130 MiB. Summe aller Limits (ohne admin/lokal) nach der Anhebung: ca. 2,2 GB.

**Postgres** (kleine Familien-App, einstellige Nutzerzahl): `max_connections=60`, `shared_buffers=128MB`, `effective_cache_size=384MB`, `work_mem=4MB`, `maintenance_work_mem=64MB`. Verbindungsbudget: PostgREST 5 + GoTrue 5 + Storage 8 + meta 3 + migrate 1 + backup 2 + manuell 5 = 29, nutzbar 57 (60 minus 3 reserviert). Beobachtetes Maximum unter Last: 11-12. PostgREST: `db-max-rows` 1000, Pool 5.

**Nachmessung unter breiter Testlast (2026-10-09, derselbe Host):** nach den Backend- und Browser-Tests (mehrere hundert API-Aufrufe, Uploads, Logins) lagen `kong` bei 234 MiB, `rest` bei 187 MiB, `storage` bei 96 MiB, `db` bei 96 MiB, `auth` bei 22 MiB, `app` bei 51 MiB. Ein 95-MB-Upload in den Storage lief ohne OOM durch (`storage` 98 MiB beobachtet). Wegen der knappen Reserve wurden die Limits angehoben: `kong`, `rest`, `storage` auf 384M, `auth` auf 128M (Bcrypt-Spitzen beim Login); `db` bleibt bei 512M, `app` bei 256M. Auf dem Zielserver mit `scripts/measure-resources.sh` erneut messen.

## Logs und Monitoring

* Alle Dienste: `json-file` mit `max-size 10m`, `max-file 3` (Rotation durch Docker, höchstens 30 MB je Dienst).
* Anzeigen: `docker compose logs --tail=200 <dienst>`; lokal `scripts/stack.sh logs [dienst]`. In Coolify im Log-Tab der Resource.
* Migrate und Backup schreiben JSON-Zeilen (`ts`, `level`, `component`, `message`, plus Felder), Fehler haben `level":"error"` und Exit-Code != 0.
* Healthchecks: db `pg_isready`, auth `/health`, rest `postgrest --ready`, storage `/status`, kong `kong health`, app `GET /api/health`. Readiness der App inkl. Auth: `GET /api/health?deep=1`.
* Externes Monitoring (empfohlen, nicht eingerichtet): Uptime-Check auf `https://reise.<domain>/api/health?deep=1` und `https://api.reise.<domain>/auth/v1/health` (mit `apikey`-Header). Backup-Alarm: Verzeichnis `/backups` auf neueste Datei < 26 h prüfen (nicht eingerichtet).

## Backups

Dienst `backup` (`docker/supabase/compose.backup.yml`, Image aus `docker/backup`): täglich 02:30 (`BACKUP_SCHEDULE`, Cron-Syntax, `TZ`), Inhalt je Lauf: Storage-Dateien (`storage.tar.gz`, vor der DB gesichert), `pg_dump -Fc`, `pg_dumpall --globals-only` (Rollen), Liste der angewendeten Migrationen, nicht geheime Konfiguration (Compose, `kong.yml`, Skripte, Migrationen; nie `stack.secrets`), `MANIFEST.sha256`. Alles wird als ein Archiv mit `age` an `BACKUP_AGE_RECIPIENT` verschlüsselt: `travelapp-<UTC>.tar.age` plus `.sha256` der verschlüsselten Datei. Sperre per Lockdatei, Exit != 0 bei jedem Fehler, Teildateien werden entfernt.

Hinweis: Das Archiv enthält Passwort-Hashes der Rollen (`globals.sql`) und alle Nutzerdaten; der private Schlüssel ist das Geheimnis. Nicht enthalten: `.env`/Coolify-Variablen (Secrets separat sichern!), Volume `db-config` (pgsodium-Schlüssel, wird nicht genutzt).

Aufbewahrung (`BACKUP_KEEP_DAILY=7`, `BACKUP_KEEP_WEEKLY=4`, `BACKUP_KEEP_MONTHLY=6`): je Tag/ISO-Woche/Monat bleibt die neueste Datei. Logik getestet mit synthetischen Dateinamen.

Ziele: lokales Verzeichnis (named volume `backup-data` oder Host-Pfad über `BACKUP_HOST_DIR`; lokal `docker/backups/`, gitignored). Optional S3-kompatibel per rclone, standardmäßig aus: `BACKUP_S3_ENABLED=true`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_PREFIX`, `BACKUP_S3_REGION`, `BACKUP_S3_PROVIDER`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` (**Upload und Remote-Retention nicht gegen einen echten S3-Dienst getestet**). Ein Backup auf demselben Server ist kein Schutz vor Serververlust: S3 oder Offsite-Kopie einrichten.

Schlüssel: `scripts/gen-backup-key.sh` (gibt nur den öffentlichen Schlüssel aus, schreibt den privaten nach `docker/travelapp-backup.age.key`, 0600, gitignored). Privaten Schlüssel offline sichern (Passwortmanager/Tresor), nie auf den Server.

Manuell: `docker compose exec backup backup.sh`.

## Restore

Standard ist sicher: ohne Vorgabe wird in eine **neue** Datenbank `restore_<zeitstempel>` wiederhergestellt; eine nicht leere Zieldatenbank (auch die laufende `postgres`) wird verweigert, außer `RESTORE_CONFIRM_OVERWRITE=<exakter Datenbankname>` ist gesetzt. Prüfungen vor dem Einspielen: SHA-256 der verschlüsselten Datei, Entschlüsselung, SHA-256-Manifest der Inhalte.

**A) Inspektion / Teil-Rettung** (berührt Produktion nicht): 
```bash
docker compose --profile restore run --rm --no-deps -v /pfad/zu/x.age.key:/key:ro restore /backups/travelapp-<ts>.tar.age
# legt Datenbank restore_<ts> an; danach z.B. per psql abfragen
```

**B) Totalverlust (neuer Server)**:
1. Secrets wiederherstellen (insbesondere `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`); bei geänderten Schlüsseln siehe Rotation.
2. Nur die Datenbank starten: `docker compose up -d --wait db`. Backup-Datei in das Backup-Volume/-Verzeichnis kopieren.
3. Einspielen (das frische `postgres` enthält Tabellen aus dem Image-Init, daher Bestätigung nötig):
```bash
RESTORE_TARGET_DB=postgres RESTORE_CONFIRM_OVERWRITE=postgres RESTORE_STORAGE_DIR=/var/lib/storage \
docker compose --profile restore run --rm --no-deps -v /pfad/zu/x.age.key:/key:ro restore /backups/travelapp-<ts>.tar.age
```
4. Restliche Dienste starten (`docker compose up -d`); `migrate` muss `applied=0` melden (bzw. nur neuere Migrationen anwenden).
5. Smoke-Test (DEPLOYMENT.md).

Bewiesen durch `scripts/verify-restore.sh` (Projekt `travelapp-restoretest`, Ergebnis siehe unten): Stack hochfahren, Migrationen 0001 bis 0005 anwenden, Fixtures (Familie, Reise, Unterkunft, Zahlung, Tagebucheintrag, Nutzer, ein Storage-Objekt) laden, Backup, **alle Volumes löschen**, frischen Stack nur mit DB starten, Restore, Rest starten, `migrate` (applied=0), Zeilenzahlen, SHA-256 des Objekts und Login des Nutzers vergleichen, alles abbauen. Der Test fasst nur Ressourcen des Projekts `travelapp-restoretest` an.

Letzter Lauf (2026-10-09, lokal): **bestanden**; Zeilen vorher/nachher `1|1|1|1|1|1|1|5` (Familien, Reisen, Unterkünfte, Zahlungen, Tagebuch, auth.users, storage.objects, Migrationen), Objekt-SHA-256 identisch, Login HTTP 200, keine Reste (`docker ps -a`, `docker volume ls`).

### Restore-Drill (quartalsweise)
- [ ] Neuestes Backup auf Alter (< 26 h) und Größe prüfen
- [ ] Privaten Schlüssel aus dem Tresor holen (Schlüssel funktioniert?)
- [ ] `scripts/verify-restore.sh` lokal oder Restore Variante A auf Testsystem
- [ ] Zeilenzahlen und ein Foto/Dokument stichprobenartig öffnen
- [ ] Dauer notieren (RTO), Abweichungen und Korrekturen hier eintragen
- [ ] Offsite-Kopie (S3) lesbar und aktuell

## Rotation von Secrets

**POSTGRES_PASSWORD** (nicht gegen Coolify getestet): Zuerst im laufenden DB-Container die Rollen umstellen (lokaler Socket braucht kein Passwort): `docker compose exec db psql -U supabase_admin -d postgres -c "ALTER ROLE authenticator PASSWORD '<neu>'"` für `authenticator`, `supabase_auth_admin`, `supabase_storage_admin`, `postgres`, `supabase_admin`. Dann die Variable ändern und die Resource neu deployen (alle Dienste neu erzeugen; `migrate` gleicht die Passwörter zusätzlich ab). Backup-Dienst nutzt dieselbe Variable.

**JWT_SECRET** (invalidiert alle Sitzungen und beide Schlüssel):
1. Backup ziehen.
2. Neues Secret und neue `ANON_KEY`/`SERVICE_ROLE_KEY` erzeugen (`node scripts/gen-secrets.mjs --out /tmp/neu.secrets ...`, Werte in Coolify übernehmen, Datei löschen). Vorsicht: das Skript erzeugt auch ein neues `POSTGRES_PASSWORD`, das dort nicht übernommen werden darf, wenn die Datenbank nicht ebenfalls rotiert wird.
3. Resource A mit den neuen Werten deployen (auth, rest, storage, kong).
4. Resource B: `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Build-Arg) und `SUPABASE_SERVICE_ROLE_KEY` setzen und **neu bauen** (der anon-Key steckt im Client-Bundle).
5. Alle Nutzer müssen sich neu anmelden; Service Worker/Offline-Warteschlange der Clients nach dem Update prüfen.
6. Smoke-Test.

**SMTP-Passwort, Konturos-Key:** Variable ändern, betroffene Resource neu starten (kein Rebuild).
**Backup-Schlüssel:** neues Paar erzeugen, `BACKUP_AGE_RECIPIENT` ändern; alte Backups bleiben nur mit dem alten privaten Schlüssel lesbar, also aufbewahren.

## Fehlersuche

| Symptom | Ursache / Maßnahme |
|---|---|
| `auth` startet nicht, "password authentication failed for user supabase_auth_admin" | Rollenpasswort passt nicht zu `POSTGRES_PASSWORD` (Volume mit altem Passwort). `migrate` ausführen oder Rollen per `ALTER ROLE` angleichen; `db-roles.sql` läuft nur bei leerem Volume. |
| `migrate`: Timeout "waiting for auth.users / storage.buckets / storage.objects.owner_id" | `auth` oder `storage` hat sein Schema noch nicht angelegt: deren Logs prüfen (häufig Passwortfehler oder DB nicht erreichbar). Wartezeit `MIGRATE_WAIT_SECONDS` (180). |
| `migrate`: `checksum_mismatch` | Eine angewendete Migrationsdatei wurde verändert. Datei zurücksetzen und Änderung als neue Migration anlegen. |
| `migrate` hängt / "lock timeout" | Ein anderer Lauf hält den Advisory Lock (120 s Wartezeit, dann Abbruch). Laufende `migrate`-Container beenden; Sperre endet mit der Sitzung. |
| 401 `No API key found` von Kong | `apikey`-Header fehlt. Ausnahmen ohne Key: `/auth/v1/verify`, `/storage/v1/object/sign/`. |
| CORS-Fehler im Browser | `CORS_ORIGIN` muss exakt die App-Origin sein (Schema, Host, Port, ohne Slash am Ende). Kong sendet nur diese Origin zurück. |
| "invalid JWT" / 401 trotz Key | `ANON_KEY`/`SERVICE_ROLE_KEY` wurden nicht mit dem aktuellen `JWT_SECRET` signiert, oder die App wurde nach Rotation nicht neu gebaut (Build-Arg). |
| Anmeldung scheitert, Registrierung "signup_disabled" (422) | gewollt: Konten nur über Admin-API/Bootstrap-Skript. Passwort mindestens 10 Zeichen. |
| Hochladen schlägt mit 403/`row-level security` fehl | Nutzer ist nicht aktives Familienmitglied oder Pfad beginnt nicht mit `<family_id>/` (Policies aus Migration 0003). |
| Upload > 100 MB abgelehnt | Bucket-Limit `media` 100 MB, `documents` 20 MB, global `FILE_SIZE_LIMIT` 100 MB. |
| PostgREST kennt neue Tabelle nicht | `NOTIFY pgrst, 'reload schema'` (macht `migrate` am Ende) oder `rest` neu starten. |
| Kong "unhealthy" nach Start | Platzhalter in `kong.yml` nicht ersetzt (`ANON_KEY` etc. fehlen): Logs von `kong`. |
| Container wird OOM-gekillt | Limit in `compose.yml` anheben und `scripts/measure-resources.sh` erneut laufen lassen. |

## Verifizierte Grenzen

Nicht geprüft: Verhalten in Coolify (UI, Compose-Overlay, One-Shot-Container), S3-Upload der Backups, Mailversand mit einem echten SMTP-Dienst (lokal nur Mailpit-Port erreichbar), amd64-Hardware, Postgres-Major-Upgrade, Last mit vielen gleichzeitigen Nutzern, Studio unter Last.
