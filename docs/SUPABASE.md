# Supabase setup

## Migrations
Apply in order (Supabase CLI `supabase db push` / `supabase db reset`, or SQL editor):

1. `supabase/migrations/0001_foundation.sql` (foundation, untouched)
2. `supabase/migrations/0002_domain_and_rls.sql` (contract alignment, all domain tables, triggers, RLS, RPCs, grants)
3. `supabase/migrations/0003_storage.sql` (private buckets `media` 100 MB and `documents` 20 MB, `storage.objects` policies; no-op if the `storage` schema is missing)
4. `supabase/migrations/0004_app_alignment.sql` (columns the app writes, document class `confirmation`, optional scientific species name, global species catalogue, overview views with `version`)
5. `supabase/migrations/0005_documents_ciphertext.sql` (documents bucket accepts `application/octet-stream` for client-side encrypted files)
6. `supabase/migrations/0006_follower_links.sql` (opt-in flag `shared_with_followers` on journal entries, photos and sightings with an adult-only trigger, table `follower_links` with RPCs to create/revoke/count visits)

In the self-hosted stack the one-shot `migrate` job applies all files in order, records name and SHA-256 in `public.schema_migrations`, and refuses to continue when an applied file changed (`docs/DEPLOYMENT.md`). Migrations 0003 and later need the `storage` schema, which the Storage API creates on first start; the job waits for it.

Note: Supabase projects have a global upload cap (plan dependent, e.g. 50 MB on free); the bucket limit cannot exceed it.

## Environment
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client), `SUPABASE_SERVICE_ROLE_KEY` (server only, bypasses RLS; never ship to the browser). See `docs/ARCHITECTURE.md`.

## Role model
`owner` (= `families.owner_user_id`, exactly one per family), `adult`, `member`, `child`. Helpers: `family_role(fid)`, `is_active_family_member(fid)`, `is_adult_family_member(fid)`.

| Area | owner/adult | member | child |
|---|---|---|---|
| trips, stops, routes, tips, emergency contacts, action items | read + write | read | read |
| stays, bookings, payments, expenses, fx_rates, documents | read + write | none | none |
| `stays_overview`, `bookings_overview` (views without price/reference/notes) | read | read | read |
| journal, media, sightings | read all non-private; edit family-visible rows of others | read non-private; create/edit own | same as member |
| `visibility = 'private'` journal/media, journal drafts | author/uploader only (also adults cannot read others') | own only | own only |
| family_members | read | read | read |
| invitations | read + write | none | none |

Only the owner changes `family_members`; nobody can set role `owner` through the table. `families.owner_user_id` cannot be changed by clients (service role only). Families are created via RPC `create_family(name)`, invitations accepted via `accept_invitation(raw_token)`. Invitations store only `token_hash = sha256(raw token)` (hex); compute it server side with `hash_invitation_token()` or Node `crypto`. Cross-family foreign keys are rejected by the `check_family_refs` trigger (e.g. payment to another family's stay). `version`/`updated_at` are bumped by trigger; clients cannot set them. `created_by` is stamped from `auth.uid()`.

GDPR: `delete_family_data(fid)` (owner only) deletes the family and everything cascading from it and returns `{family_id, storage_paths}`. The caller must delete those objects via the Storage API (direct SQL deletes on `storage.objects` are not supported by Supabase).

## Tests
`npx vitest run supabase/tests` runs `supabase/tests/rls.test.ts` against in-memory Postgres (PGlite) with a shim for `auth.users`, `auth.uid()`, the roles `anon/authenticated/service_role` and a stub `storage` schema. It applies the three migrations and, as role `authenticated` with a JWT-sub setting, asserts: cross-family read/update/delete/insert isolation for every table, role matrices for finance/documents, journal/media privacy, no self-promotion, cross-family FK rejection, invitation hashing and acceptance, sync idempotency, version triggers, storage policies (against the stub), and `delete_family_data` permissions and cascade. The assertions were mutation-checked (removing a policy/trigger makes them fail).

Not proven: real Supabase Auth flows (JWT verification, `auth.uid()` from real tokens, email confirmation), the real Storage API (upload limits, mime enforcement, signed URLs, `storage.objects` ownership and the real `owner_id` population), PostgREST behaviour (column grants, RPC exposure), performance and query plans, `service_role` bypass, Realtime, concurrency/race conditions, and the default Supabase privilege setup (the shim mimics it). Run the migrations against a staging project and repeat a smoke test with two real users before production.


## Anbindung der App (Stand Produktivbetrieb)

Die App spricht im Supabase-Modus ausschließlich über `SupabaseRemote` (`src/lib/offline/remote-supabase.ts`) mit der Datenbank; das Tabellen-/Spaltenmapping steht in `src/lib/offline/supabase-mapper.ts`.

- **Schreiben:** pro Mutation ein Eintrag in `sync_mutations` (eindeutig je `family_id, device_id, mutation_id`, ohne Inhalte), danach `insert` bzw. `update … where id = ? and version = <Basisversion>`. Kein Treffer: Konflikt (Serverzeile hat andere Version) oder Ablehnung (Zeile existiert in gleicher Version, RLS hat sie verweigert).
- **Lesen:** seitenweise (1000 Zeilen), Mitglieder/Kinder lesen `stays_overview` und `bookings_overview` statt der Tabellen.
- **Mitglieder:** `family_members` + `profiles` werden zu einer Entität `members` zusammengeführt; Rollenänderung nur Owner, Anzeigename nur die Person selbst.
- **Einladungen:** Zeile mit `token_hash`; die Annahme läuft über `accept_invitation` mit dem JWT der Person; das Konto selbst legt `/api/invitations/register` (Service-Role) an. Erste Familie: `create_family`.
- **Dateien:** Upload nach `media` bzw. `documents` mit Pfad `<family_id>/…`; Anzeige über `createSignedUrl` (300 s). Reihenfolge: Datei vor Zeile.

### Nachweis gegen echtes Supabase
`npm run test:backend` (Stack mit `scripts/stack.sh up`) führt `tests/backend/*.test.ts` gegen die Container aus: Registrierung nur per Einladung, Anmeldung/Abmeldung (Refresh-Token wird widerrufen), Rollenmatrix, familienübergreifende Isolation (Lesen, Schreiben, Fremdschlüssel), private Journal-Einträge, Storage (Signed URLs inkl. Ablauf, fremde Familie, Dokumenten-Bucket nur Owner/Adult, MIME- und Größenlimit, Öffentlich-Zugriff verweigert), Sync-Engine (offline, Konflikt, Wiederaufnahme, abgelaufene Sitzung, Zahlungsstatus, Export), E-Mail (Auth-SMTP, Einladungsmail), Gateway (CORS, API-Key-Pflicht). `npm run test:e2e:supabase` prüft dieselben Abläufe im Browser gegen den App-Container. Die PGlite-Tests (`supabase/tests`) bleiben als schneller Regressionstest für die SQL-Policies.

### Weiterhin nicht verifiziert
Coolify selbst (Compose-Overlay, Verhalten bei beendeten One-Shot-Containern), echte SMTP-Anbieter, S3-Backup-Ziele, amd64-Hardware, Postgres-Major-Upgrades, Last und Nebenläufigkeit über wenige Nutzer hinaus, Studio.
