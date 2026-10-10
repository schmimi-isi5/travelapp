# Deployment (Coolify, selbst gehostetes Supabase)

Stand: 2026-10-09. Alles unten Beschriebene zu Images, Compose und Skripten wurde lokal gegen den Stack `travelapp-local` geprüft. **Nicht verifiziert** (kein Coolify verfügbar): die konkreten Coolify-UI-Schritte, Coolify-Verhalten bei One-Shot-Containern (`migrate`) und das Zusammenführen zweier Compose-Dateien. Diese Stellen sind markiert.

## Überblick

| Ressource | Quelle | Domain | Port |
|---|---|---|---|
| A: Supabase | Docker Compose `docker/supabase/compose.yml` (+ `compose.backup.yml`) | `api.reise.<domain>` | Kong `8000` |
| B: App | Dockerfile (Repo-Root) | `reise.<domain>` | `3000` |

Nur Kong und die App sind öffentlich. Postgres, GoTrue, PostgREST, Storage, Studio/Meta haben **keine** Host-Ports (die Basis-Compose veröffentlicht nichts). Studio/Meta gibt es nur mit Profil `admin` und ohne Domain.

## Image-Versionen (alle per `docker pull` verifiziert)

| Dienst | Image | Grund |
|---|---|---|
| Postgres | `supabase/postgres:15.19.0.004` | Supabase-Image mit Rollen, Erweiterungen und Init-Skripten; 15er Linie (langjährig getestet) |
| Auth | `supabase/gotrue:v2.197.0` | neueste Nicht-RC-Version zum Zeitpunkt |
| REST | `postgrest/postgrest:v14.18` | 14er Linie wie Supabase; `--ready`-Healthcheck |
| Storage | `supabase/storage-api:v1.80.2` | stabil (v1.81.0 war frisch) |
| Gateway | `kong:3.9.3` | DB-less, Plugins `cors`, `key-auth`, `acl` |
| Admin (optional) | `supabase/studio:2026.10.05-sha-94b8b06`, `supabase/postgres-meta:v0.100.0` | Profil `admin` |
| Lokal | `axllent/mailpit:v1.31.4` | nur `compose.local.yml` |
| App-Build/Runtime | `node:22.23.3-alpine3.24` (+ `tini`) | Node 22 LTS |
| Backup-Tools | `postgres:15.19-alpine3.24` + age, rclone, supercronic | `pg_dump` muss zur Server-Major (15) passen |

Aktualisierung: Tag ändern, lokal `scripts/stack.sh up` und `scripts/verify-restore.sh` laufen lassen, erst dann deployen.

## Variablen

**Build-Args der App (öffentlich, werden ins Client-Bundle eingebaut; Änderung = neuer Build):**
`NEXT_PUBLIC_APP_MODE` (`supabase`), `NEXT_PUBLIC_SUPABASE_URL` (`https://api.reise.<domain>`), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (`https://reise.<domain>`).
Die Supabase-URL bestimmt auch die Content-Security-Policy (`next.config.ts`), sie muss zur Build-Zeit gesetzt sein. In Coolify die Variablen als "Build Variable" markieren.

**Karte:** Das Dockerfile lädt beim Build einen OpenStreetMap-Auszug (Protomaps, ca. 58 MB) nach `data/map/` und legt ihn ins Image; die `pmtiles`-CLI wird per SHA-256 geprüft. Optionale Build-Args: `MAP_BUILD` (z. B. `20261009`, Standard: neuester Stand) und `PMTILES_VERSION`. Schlägt der Download fehl, bricht der Build nicht ab, die App zeigt dann die schematische Karte (Build-Log nach `WARNING: map tiles not built` durchsuchen). Eine eigene Datei lässt sich über `MAP_TILES_FILE` (Runtime-Variable, Pfad zur `.pmtiles`-Datei) einbinden, etwa als Coolify-Volume. Aktualisierung: Image neu bauen oder `scripts/build-map-assets.sh` lokal ausführen.

**Runtime-Variablen der App (nie im Image):** `SUPABASE_SERVICE_ROLE_KEY` (Secret), `SUPABASE_INTERNAL_URL`, `AI_PROVIDER`, `KONTUROS_BASE_URL`, `KONTUROS_API_KEY` (Secret), `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` (`SMTP_PASS` Secret; ohne `SMTP_HOST`+`SMTP_FROM` ist der Einladungs-Mailversand der App aus, der Link lässt sich dann manuell weitergeben), `REGISTER_RATE_LIMIT` (optional, Standard 10 Registrierungsversuche je Adresse und 10 Minuten; nur für Tests erhöhen). Verifiziert: `docker history` des Images enthält keine Schlüssel.

**Supabase-Compose (Resource A):**

| Variable | Art | Hinweis |
|---|---|---|
| `POSTGRES_PASSWORD` | Secret | wird beim ersten Start in die Dienstrollen geschrieben, `migrate` gleicht bei Änderung ab |
| `JWT_SECRET` | Secret | mind. 48 Zufallsbytes |
| `ANON_KEY`, `SERVICE_ROLE_KEY` | Secret / öffentlich (anon) | HS256-JWTs, mit `JWT_SECRET` signiert (`node scripts/gen-secrets.mjs` erzeugt sie) |
| `API_EXTERNAL_URL` | Konfig | `https://api.reise.<domain>` |
| `SITE_URL`, `CORS_ORIGIN` | Konfig | App-Origin `https://reise.<domain>` (CORS: Komma-Liste möglich) |
| `ADDITIONAL_REDIRECT_URLS` | Konfig | Redirect-Allowlist (Komma-getrennt) |
| `SMTP_HOST/PORT/USER/PASS/ADMIN_EMAIL/SENDER_NAME` | Secret (`SMTP_PASS`) | GoTrue-Mailversand |
| `JWT_EXPIRY` | Konfig | Default 3600 |
| `BACKUP_*` | siehe OPERATIONS.md | nur Backup-Dienst |

Schlüssel für Coolify erzeugen: `node scripts/gen-secrets.mjs --out /tmp/x.secrets --site-url https://reise.<domain> --api-url https://api.reise.<domain>`, Werte in Coolify übernehmen, Datei löschen. Das Skript gibt keine Werte aus. `docker/stack.secrets` ist gitignored und nur für lokale Tests.

## Schritt für Schritt (Coolify)

1. Projekt und Environment (z. B. `reise` / `production`) anlegen.
2. **Resource A**: "Docker Compose" aus dem Git-Repo, Compose-Datei `docker/supabase/compose.yml`. Relative Bind-Mounts (`kong.yml`, `migrate.sh`, `../../supabase/migrations`) setzen voraus, dass das Repo geklont wird (nicht verifiziert in Coolify). Variablen aus der Tabelle setzen. Domain `https://api.reise.<domain>` dem Service `kong` mit Port `8000` zuweisen. Keine Domain für andere Dienste.
3. Backup (optional, empfohlen): `compose.backup.yml` ist ein Overlay. Coolify kennt pro Resource eine Compose-Datei; Optionen: (a) Custom Start Command `docker compose -f docker/supabase/compose.yml -f docker/supabase/compose.backup.yml up -d --build` (nicht verifiziert), (b) den Service `backup` samt Volume `backup-data` in die Compose kopieren. Vorher `scripts/gen-backup-key.sh` lokal ausführen, nur den öffentlichen Schlüssel als `BACKUP_AGE_RECIPIENT` setzen, privaten Schlüssel außerhalb des Servers sichern.
4. Persistente Volumes (im Compose als named volumes): `db-data`, `db-config`, `storage-data`, `backup-data`. Nicht löschen. In Coolify "Persistent Storage" prüfen.
5. **Deploy-Reihenfolge**: Resource A deployen. Compose startet `db` -> `auth`/`rest` -> `storage` -> `kong` und danach den Job `migrate` (wartet auf `auth.users`, `storage.buckets`, `storage.objects`, wendet `supabase/migrations/*.sql` an, aktuell 0001 bis 0005). Prüfen: `migrate` beendet mit Exit 0 (Logs: `done applied=N skipped=M`). Coolify-Verhalten bei beendeten Containern ist nicht verifiziert; schlägt die Statusanzeige an, den Job per Terminal nachziehen (siehe unten).
6. **Resource B**: "Dockerfile", Repo-Root, Port `3000`, Domain `https://reise.<domain>`. Build-Args und Runtime-Variablen setzen. Healthcheck ist im Image (`GET /api/health`, nur Liveness). `/api/health?deep=1` ist die Readiness-Prüfung (für externes Monitoring, nicht für den Container-Healthcheck).
7. Erst-Owner anlegen (öffentliche Registrierung ist abgeschaltet). Das Skript liegt **nicht** im App-Image; es läuft von einem vertrauenswürdigen Rechner mit Repo-Checkout und `npm ci` und braucht Netzzugriff auf die API-Domain:
   ```bash
   SUPABASE_URL=https://api.reise.<domain> SUPABASE_ANON_KEY=<ANON_KEY> SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> \
   BOOTSTRAP_PASSWORD='<mind. 10 Zeichen>' node scripts/bootstrap-owner.mjs --email owner@example.org --family "Familie Beispiel"
   ```
   Das Passwort wird nur aus der Umgebung gelesen und nie ausgegeben; den Service-Role-Key danach aus der Shell-Historie entfernen. Der Owner meldet sich danach in der App an und legt die Reise an; weitere Personen lädt er über „Familie“ ein.
8. SMTP: GoTrue braucht einen echten SMTP-Server für Einladungs- und Reset-Mails; ohne SMTP schlagen diese fehl. Absender-Domain mit SPF/DKIM versehen.

## Migrationen erneut ausführen

Der Job ist idempotent. Bei Deploys läuft er mit. Manuell: im Terminal des Compose-Projekts `docker compose run --rm --no-deps migrate`. Lokal: `scripts/stack.sh migrate`. Ändert sich die Prüfsumme einer bereits angewendeten Datei, bricht der Lauf bewusst ab (Exit 1, Event `checksum_mismatch`): angewendete Dateien nie ändern, eine neue Migration anlegen.

## Smoke-Test nach dem Deploy

```bash
API=https://api.reise.<domain>; ANON=<ANON_KEY>
curl -s -o /dev/null -w '%{http_code}\n' $API/auth/v1/health -H "apikey: $ANON"          # 200
curl -s -o /dev/null -w '%{http_code}\n' $API/auth/v1/health                              # 401 (kein Key)
curl -s -o /dev/null -w '%{http_code}\n' "$API/rest/v1/payments?select=*" -H "apikey: $ANON"  # 401 (kein Zugriff fuer anon)
curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/auth/v1/signup -H "apikey: $ANON" -H 'content-type: application/json' -d '{"email":"x@example.com","password":"zehnzeichen1"}'  # 422 signup_disabled
curl -s https://reise.<domain>/api/health ; curl -s 'https://reise.<domain>/api/health?deep=1'
```
Danach mit dem Owner anmelden, eine Reise anlegen, ein Foto hochladen, per zweitem Konto prüfen, dass fremde Familien nichts sehen.

## Rollback

* App: in Coolify das vorherige Image/den vorherigen Commit erneut deployen (die `NEXT_PUBLIC_*`-Werte sind im Image fixiert). Datenbankmigrationen sind nicht rückwärts kompatibel garantiert: bei Schemaänderungen vor dem Deploy ein Backup ziehen (`docker compose exec backup backup.sh`).
* Daten: Restore-Prozedur in `docs/OPERATIONS.md` ("Restore"). Sie wurde lokal vollständig bewiesen (`scripts/verify-restore.sh`).

## Upgrade der Supabase-Images

1. Neue Tags auswählen (nur exakte Versionen, nie `latest`), in `docker/supabase/compose.yml` ändern, Release Notes lesen (GoTrue und Storage führen eigene DB-Migrationen aus).
2. Lokal: `scripts/stack.sh reset && scripts/stack.sh up`, dann `scripts/verify-restore.sh`.
3. Produktiv: frisches Backup ziehen, deployen, Smoke-Test.
4. Postgres-Major-Upgrade (15 -> 17) ist **kein** Tag-Wechsel: Dump/Restore in eine neue Instanz, nicht verifiziert, nicht Teil dieses Setups.

## Lokaler Test des Gesamtstacks

```bash
scripts/stack.sh secrets   # erzeugt docker/stack.secrets (gitignored), idempotent
scripts/stack.sh up        # Supabase, wartet auf healthy + Migrationen
scripts/stack.sh app-up    # zusaetzlich die App aus dem Dockerfile
scripts/stack.sh down | reset | status | logs [dienst] | migrate
```
Ports (nur 127.0.0.1): API/Kong `18000`, App `18080`, Mailpit-UI `18025`, Mailpit-SMTP `11025`, Postgres `54329`, Studio (Profil `admin`) `18323`.
