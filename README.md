# Namibia & Botswana – Unsere Reise. Unsere Geschichte.

Familien-Reise-PWA (Deutsch) für eine Namibia-/Botswana-Reise: Route, Unterkünfte mit Zahlungsstatus, Buchungen, Tagebuch mit Medien und Sprachmemos, KI-Hinweise, Safari-Tracker, Offline-Sync, Dokumenten-Tresor, Ausgaben je Währung, Familienrechte und ein exportierbares Erinnerungsarchiv.

**Stand:** V1 läuft im Demo-Modus (keine Schlüssel) und im Produktivmodus mit selbst gehostetem Supabase in Docker (Anmeldung, Familien, Rechte per RLS, private Medien, Sync, Backups). Deployment auf Coolify ist vorbereitet, aber nicht ausgeführt. Details und bekannte Lücken: [`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md).

## Schnellstart

```bash
npm install
npx playwright install chromium   # nur für E2E/Screenshots
npm run dev                        # http://localhost:3000, Demo-Modus, keine Schlüssel nötig
```

Alle Daten im Demo-Modus sind fiktiv und liegen nur in deinem Browser (IndexedDB). Einstellungen → „Demo zurücksetzen“ lädt sie neu, „Alle lokalen Daten löschen“ entfernt sie.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run lint` / `npm run typecheck` | ESLint, `tsc --noEmit` |
| `npm test` | Vitest: Unit, Integration (fake-indexeddb), RLS-Tests gegen PGlite |
| `npm run build && npm run test:e2e` | Produktions-Build, Playwright (Chromium, inkl. axe-Barrierefreiheit) |
| `npm run screenshots` | Screenshots bei 390/768/1440 px nach `docs/screenshots/` (nach Build) |
| `npm run stack:up` | lokaler Supabase-Stack in Docker (Gateway :18000, Mailpit :18025); `stack:down`, `stack:reset`, `stack:status` |
| `bash scripts/stack.sh app-up` | zusätzlich die App als Docker-Container (:18080) |
| `npm run test:backend` | Integrationstests gegen den echten Stack (RLS, Storage, Sync, Mail, Gateway) |
| `npm run test:e2e:supabase` | Browser-Tests (Chromium, iPhone-WebKit) gegen App-Container + Stack |
| `npm run screenshots:supabase` | Screenshots des Produktivmodus nach `docs/screenshots/supabase/` |
| `scripts/build-map-assets.sh` | Kartendaten (OSM-Auszug Namibia/Botswana, ca. 58 MB) nach `data/map/` und Kartenschriften erzeugen; braucht die `pmtiles`-CLI. Ohne Datei zeigt die App die schematische Karte |
| `bash scripts/verify-restore.sh` | isolierter Backup-/Restore-Test |

## Konfiguration

Alle Variablen stehen in `.env.example`. Ohne Werte läuft die App im Demo-Modus.
Zusätzlich zu den dort aufgeführten Variablen (die Datei lässt sich mit den Projekt-Berechtigungen nicht automatisch ändern) gelten: `SUPABASE_INTERNAL_URL` (Gateway aus dem Docker-Netz), `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` (Einladungsmails der App), `REGISTER_RATE_LIMIT` (optional) und `KONTUROS_COMPLETIONS_PATH` (bewusst ohne Default, siehe [`docs/AI_INTEGRATION.md`](docs/AI_INTEGRATION.md)). Für den Docker-Betrieb erzeugt `scripts/gen-secrets.mjs` die Werte (`docker/stack.secrets`, gitignored); alle Variablen mit Bedeutung stehen in `docs/DEPLOYMENT.md`.

| Variable | Bedeutung |
|---|---|
| `NEXT_PUBLIC_APP_MODE` | `demo` (Standard) oder `supabase`. Fehlen Zugangsdaten, fällt die App sichtbar auf Demo zurück |
| `AI_PROVIDER` | `disabled` (Standard), `konturos`, `stub` (nur Tests) |
| `MAP_TILES_FILE` | Optional (Runtime), Pfad zur Kartendatei; Standard `data/map/namibia-botswana.pmtiles`. Erzeugen mit `scripts/build-map-assets.sh` (braucht die `pmtiles`-CLI) |

Geheimnisse (`SUPABASE_SERVICE_ROLE_KEY`, `KONTUROS_API_KEY`) gehören nur in die Server-Umgebung.

## Dokumentation

- [`docs/DECISIONS.md`](docs/DECISIONS.md) technische Entscheidungen
- [`docs/SUPABASE.md`](docs/SUPABASE.md) Schema, RLS, was die Tests beweisen und was nicht
- [`docs/AI_INTEGRATION.md`](docs/AI_INTEGRATION.md) KI-Adapter und Datenschutz
- [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md), [`ARCHITECTURE`](docs/ARCHITECTURE.md), [`DATA_CONTRACT`](docs/DATA_CONTRACT.md), [`DESIGN_SPEC`](docs/DESIGN_SPEC.md), [`ACCEPTANCE`](docs/ACCEPTANCE.md), [`IMPORT_POLICY`](docs/IMPORT_POLICY.md) Spezifikation
- Engineering-Regeln des Teams: `.claude/rules/`

## Deployment

Vorbereitet für Coolify (zwei Ressourcen: Supabase-Compose und App-Dockerfile), siehe [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/OPERATIONS.md`](docs/OPERATIONS.md) und [`docs/SECURITY.md`](docs/SECURITY.md). Es wurde nichts deployt; eine Produktivfreigabe erfolgt ausschließlich durch den Auftraggeber.
