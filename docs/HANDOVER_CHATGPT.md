# Handover (Stand 2026-10-09, aktualisiert nach der Produktivvorbereitung)

Selbsterklärende Übergabe ohne Zugriff auf die bisherigen Claude-Sitzungen. Verbindlicher Stand und Zahlen: `docs/IMPLEMENTATION_REPORT.md`.

## 1. Worum es geht
Familien-Reise-PWA (Deutsch) „Namibia & Botswana – Unsere Reise“ mit zwölf Modulen (Route, Unterkünfte mit Zahlungsstatus, Buchungen, Tagebuch/Medien, KI-Hinweise, Safari-Tracker, Offline-Sync, Dokumenten-Tresor, Ausgaben je Währung, Familie/Rechte, Archiv/Export, Design-System). Repo `/Users/ki-admin/Projects/travelapp`, Branch `feat/v1-travel-companion`. **Nichts ist committet/gepusht/deployt.**

## 2. Verbindliche Vorgaben
- Kein Commit, Push, PR, Merge oder Deployment ohne ausdrückliche Freigabe des Auftraggebers.
- Betrieb: Coolify, Supabase selbst gehostet in eigenen Containern (Teil des Repos).
- Zurückgestellt: Konturos-KI (`AI_PROVIDER=disabled`), Import der echten Reiseplanung (`Namibia.pdf`).
- Projektregeln in `.claude/rules/`; Datei-Berechtigungen verbieten Lesen/Schreiben von `.env*` (daher ist `.env.example` nicht aktualisiert, Variablen stehen in README und `docs/DEPLOYMENT.md`). Secrets lokal in `docker/stack.secrets` (gitignored).
- Fachregeln: Geld in Minor Units je Währung; `unknown` ist ein Status; keine erfundenen Echtdaten; Konflikte nie still überschreiben; Kinder/Mitglieder ohne Finanz-/Ausweisdaten (per RLS), KI-Ausgaben immer gelabelt.

## 3. Architektur in Kürze
- Next.js 15 (App Router), React 19, TypeScript strict, Tailwind 4, Dexie (IndexedDB), supabase-js.
- **Alle Schreibzugriffe** über `src/lib/db/repo.ts` → lokale IndexedDB + Mutationsqueue → `src/lib/offline/sync.ts` → `RemoteAdapter`: `DemoRemote` (zweite IndexedDB als Server) oder `SupabaseRemote` (Postgres/Storage). Spalten-Mapping: `src/lib/offline/supabase-mapper.ts`.
- Modi: `NEXT_PUBLIC_APP_MODE=demo|supabase` (zur Buildzeit). Demo startet ohne Schlüssel; Supabase-Modus startet mit leerer Familie.
- Auth: Supabase Auth, Registrierung nur per Einladung (`/api/invitations/register`, Service-Role serverseitig), Erst-Owner per `scripts/bootstrap-owner.mjs`; `AuthGate`; Abmelden löscht die lokale DB.
- Datenbank: Migrationen `supabase/migrations/0001–0005`, RLS auf allen Tabellen, Views `stays_overview`/`bookings_overview` für Mitglieder/Kinder, private Buckets `media`/`documents`.
- Docker: `Dockerfile`, `docker/supabase/compose*.yml`, `docker/compose.app*.yml`, `docker/backup/`, `scripts/stack.sh`.

## 4. Befehle
```bash
npm run lint && npm run typecheck && npm test            # 151 Tests inkl. RLS (PGlite)
npm run build && npm run test:e2e                         # Demo-Browsertests (Chromium, WebKit, mobil)
npm run stack:up && npm run test:backend                  # echtes Supabase in Docker (41 Tests)
bash scripts/stack.sh app-up && npm run test:e2e:supabase # App-Container + Stack im Browser (14 Tests)
bash scripts/verify-restore.sh                            # isolierter Backup/Restore-Test
npm run screenshots | npm run screenshots:supabase
```
Lokale Ports (nur 127.0.0.1): API 18000, App 18080, Mailpit 18025/11025, Postgres 54329. Port 3000/3001 sind auf dem Rechner des Nutzers belegt.

## 5. Stand und Lücken
Alles Verifizierte, alle Zahlen und die vollständige Lückenliste stehen im Bericht. Wichtigste offene Punkte: nicht auf Coolify getestet; GitHub-Actions-Workflow ungetestet; Firefox startet lokal nicht; kein Pentest/MFA; PostCSS-Advisory in Next 15; Reiseplan-Import und Konturos offen.

## 6. Nächste Schritte
Siehe Abschnitt H des Berichts: Commits/PR (Freigabe nötig) → CI → Domains/SMTP/Backup/Secrets → Coolify-Deployment mit Smoke-Test und Restore-Drill → Geräte-Test → Reiseplan-Import.

## 7. Fallstricke
- Neue Migrationen als neue Datei anlegen; bereits angewendete nie ändern (Prüfsumme).
- `NEXT_PUBLIC_*` sind Buildzeit-Variablen (Docker Build-Args, in Coolify als „Build Variable“).
- supabase-js sendet nach Netzfehlern `x-retry-count`; Kong muss ihn per CORS erlauben (erledigt in `docker/supabase/kong.yml`).
- Playwright: nach Klicks auf sichtbare Ergebnisse warten, bevor navigiert wird (IndexedDB-Schreibvorgänge); `getByLabel('Rolle')` trifft per Teilstring auch „Rolle von …“ (`exact: true` verwenden).
- Next.js erlaubt keine zusätzlichen Exporte aus `page.tsx`.
- `FileList` vor dem Zurücksetzen des Inputs kopieren.
