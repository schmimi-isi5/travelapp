<!-- Shared engineering conventions live in .claude/rules/ — see README for the layout. -->

## Project Overview

- **Project Name**: Namibia & Botswana – Unsere Reise. Unsere Geschichte.
- **Description**: Familien-Reise-PWA (Deutsch) mit zwölf V1-Modulen: Reiseplanung, Unterkünfte, Buchungen, Tagebuch & Medien, KI-Hinweise, Safari-Tracker, Offline-First/Sync, Sicherheit & Dokumenten-Tresor, Ausgaben, Familie & Rechte, Erinnerungsarchiv, Design-System.
- **Spezifikation**: `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DATA_CONTRACT.md`, `docs/DESIGN_SPEC.md`, `docs/ACCEPTANCE.md`, `docs/IMPORT_POLICY.md`. Ursprünglicher Auftrag: `docs/HANDOFF_BRIEF.md`. Technische Entscheidungen: `docs/DECISIONS.md`. Stand der Umsetzung: `docs/IMPLEMENTATION_REPORT.md`.

## Tech Stack

- **Language**: TypeScript (strict, `noUncheckedIndexedAccess`)
- **Framework**: Next.js 15 App Router, React 19, Tailwind CSS 4, Lucide, Zod 4
- **Database**: Demo-Modus: IndexedDB (Dexie) plus simulierter Server. Produktiv: selbst gehostetes Supabase (Postgres 15, Auth, PostgREST, Storage, Kong) in Docker, Migrationen 0001–0014 in `supabase/migrations`, RLS auf allen Tabellen.
- **Infrastructure**: PWA (Service Worker `public/sw.js`), Docker (`Dockerfile`, `docker/`), Coolify-Deployment (`docs/DEPLOYMENT.md`), KI über serverseitigen `AiProvider` (Konturos zurückgestellt, `AI_PROVIDER=disabled`).

## Project Structure

```
src/app/f/[token]       Öffentliche Follower-Ansicht (ohne Konto, nur Lesen)
src/app/(main)/**       Seiten (Dashboard, route, stays, bookings, journal, gallery, guide, sightings, expenses, safety, family, archive, offline, settings, more)
src/app/api/**          Server-Routen (ai/status, ai/generate, health, account/delete, invitations/*, map/tiles, follow/*)
src/components/**       AppShell, Navigation, UI-Primitive, SVG-Illustrationen, Karte (MapLibre + SVG-Ersatz)
src/features/**         Fachkomponenten je Modul
src/lib/domain/**       Zod-Schemas, Geldlogik (Minor Units), Rollenpolicy, Tagesbriefing
src/lib/follow/**       Was Follower sehen dürfen (view.ts, einzige Entscheidungsstelle)
src/lib/domain/day-plan.ts   Tagesbriefing aus den Daten (Anreise, Tageslicht, Unterkunft, Wetter, Fristen)
src/lib/domain/trip-check.ts Regelbasierte Planprüfung (Reise-Check)
src/lib/domain/notifications.ts  Benachrichtigungen (Fristen, überfällige Aufgaben, Sync-Konflikte) aus den Gerätedaten, kein Push
src/lib/map/**          Layout der illustrierten Dashboard-Karte (Pins, Beschriftungen)
src/lib/share-inbox.ts  Android "Teilen mit …": Dateien im Posteingang (Cache) bis zum Import in die Galerie
src/lib/mail/templates.mjs  Alle E-Mails (App und Auth-Dienst) in einem HTML-Layout; scripts/build-mail-templates.mjs erzeugt public/mail-templates
src/lib/server/mailbox/**  Postfach: IMAP-Quelle (nur lesend), Zuordnung, Mustererkennung, Ablage; API unter src/app/api/mailbox/**, Seite /mailbox
src/lib/tips/**         Regelbasierte Empfehlungen je Station (Wetter, Unterkunftsart, Ort)
src/lib/weather/**      Wetterdaten je Station (Client, Zwischenspeicher); Server: src/lib/server/weather.ts
src/lib/media/**        Bildbibliothek der Reiseziele (Zuordnung Station → Foto, Laden, Vorwärmen)
scripts/destination-images/  Importpipeline für lizenzierte Ortsfotos (siehe docs/media-system/)
src/lib/db/**           Dexie, Repository (CRUD + Mutationsqueue), Medien, Dokumente, Seed
src/lib/offline/**      Netzstatus, Sync-Engine, Remote-Adapter (Demo, Supabase), Spalten-Mapper
src/lib/auth|server/**  Einladungstoken, Passwortregeln; Logger, Mailer, Rate-Limit, Supabase-Admin (nur Server)
src/lib/ai/**           AiProvider, Fallback, Client
supabase/**             Migrationen, Seed, RLS-Tests (PGlite)
tests/{unit,integration,backend,e2e,e2e-supabase,screens,screens-supabase}
docker/                 Supabase-Compose, App-Compose, Backup-Tooling; scripts/ (stack.sh, gen-secrets, bootstrap-owner, verify-restore)
```

## Essential Commands

- **Install dependencies**: `npm install` (einmalig `npx playwright install chromium`)
- **Run locally**: `npm run dev` (Demo-Modus, keine Schlüssel nötig)
- **Run tests**: `npm run test` (Vitest, inkl. RLS-Tests), `npm run test:e2e` (Playwright Demo-Modus, vorher `npm run build`), `npm run stack:up` + `npm run test:backend` (echtes Supabase), `bash scripts/stack.sh app-up` + `npm run test:e2e:supabase`
- **Lint / Typecheck**: `npm run lint`, `npm run typecheck`
- **Build**: `npm run build`
- **Screenshots**: `npm run screenshots` (nach Build, schreibt nach `docs/screenshots/`)
- **Stack lokal**: `scripts/stack.sh secrets|up|app-up|down|reset|status|logs|migrate` (Secrets in `docker/stack.secrets`, nie committen)
- **Deploy**: Coolify, siehe `docs/DEPLOYMENT.md`; nichts deployen ohne ausdrückliche Freigabe.

## Project-Specific Conventions

- Geld ausschließlich als ganzzahlige Minor Units plus ISO-4217-Währung. Summen immer je Währung; konsolidierte Summen nur mit dokumentiertem Kurs (Quelle, Stand).
- `unknown` ist ein eigener Status. Nie `paid=false` oder erfundene Referenznummern, Preise und Zahlungsstatus im Echtmodus. Restbetrag nur bei bestätigtem Preis in gleicher Währung, nicht verifizierte Zahlungen zählen nicht.
- Alle Schreibzugriffe laufen über `src/lib/db/repo.ts` (Validierung, Rollenprüfung, Mutationsqueue). Kein direktes Dexie-`put` in UI-Code.
- Migrationen: bereits angewendete Dateien nie ändern (der Runner prüft die Prüfsumme), neue Datei anlegen. Neue Tabellen immer mit RLS und Test in `supabase/tests` und `tests/backend`.
- Der Service-Role-Key wird nur in `src/lib/server/**` und Server-Routen verwendet, nie im Client oder in Build-Args.
- Rollen (owner/adult/member/child) werden im Backend per RLS erzwungen, `src/lib/domain/policy.ts` spiegelt sie clientseitig. Kinder/Mitglieder sehen keine Finanz- und Ausweisdaten; Ausnahme: Unterlagen, die Erwachsene ausdrücklich für die Familie freigeben (`documents.access_level = 'family'`, z. B. Bordkarten), nur lesend.
- Follower-Links: **Fotos sind standardmäßig sichtbar** (Familienfotos, nie private), außer sie sind ausgeblendet (`hidden_from_followers`, Entscheidung des Auftraggebers am 2026-10-18); **Berichte und Tiersichtungen nur per Opt-in je Eintrag** (`shared_with_followers`, nur owner/adult), Follower nie direkt an die Datenbank, Sichtbarkeit nur über `src/lib/follow/view.ts`; Fotos nur neu kodiert ohne EXIF/GPS.
- Ortsfotos: Quellenzeilen nicht unter den Fotos, sondern gesammelt auf `/settings/credits` (Lizenzpflicht); nur über die Bibliothek (`destination_images`), nie ein Bildpfad im Seitencode; nur Bilder mit geprüfter Lizenz; ohne Ortsbeleg immer als „Regionsmotiv“ beschriftet; keine Unterkunftsfotos ohne Freigabe.
- Postfach-Passwort: nur verschlüsselt in `mailbox_settings`, nie in Antworten, Logs oder Tests im Klartext; Servernamen nur öffentlich, Verbindung nur verschlüsselt.
- Postfach: Mails nur lesen (nie ändern, nie senden), Anhänge nicht speichern; Zahlungen, Fristen und Nummern aus Mails sind Vorschläge mit Zitat und werden erst nach Klick eines Erwachsenen eingetragen (Zahlungen „nicht verifiziert“); KI sieht nur den Mailtext und jedes Ergebnis wird am Text geprüft.
- KI: Fakten entstehen regelbasiert, die KI formuliert nur und läuft nur auf Knopfdruck über `requestAi`; Fotos gehen nur über `/api/ai/receipt` und nur nach Bestätigung je Foto.
- Sprachmemos: Aufnahmen gehen nur nach Bestätigung je Aufnahme an `/api/ai/transcribe`; die Abschrift ist immer bearbeitbar und wird nie ohne Knopfdruck gespeichert.
- Profilfoto: nur als kleines JPEG (Data-URL, höchstens 60 KB) in `profiles.avatar_data`, jede Person ändert nur ihr eigenes; Initialen als Rückfall.
- Foto-Metadaten (Aufnahmeort/GPS, Höhe, Kamera, Aufnahmezeit) werden beim Hochladen aus dem Originalfoto gelesen (vor dem Verkleinern) und als Felder in `media_assets` gespeichert, nur für die Familie sichtbar; Follower-Ansicht und Follower-Fotos tragen sie nie (`src/lib/follow/view.ts`, Neukodierung ohne EXIF). Station je Foto: `assignStop` (Position, sonst eindeutiges Aufnahmedatum), Zuordnung von Hand geht immer vor.
- Offline: stabile UUIDs, Mutation-IDs, Versionsprüfung, Konflikte nie still überschreiben (Journal: append-first).
- KI-Ausgaben tragen immer Herkunft und Stand; ohne Freigabe oder Provider antwortet nur der als „regelbasiert, keine KI“ gelabelte Fallback.
- Demo-Daten sind fiktiv, `is_demo = true`, `source_type = 'demo'`. Keine Fremdbilder, nur eigene SVG-Illustrationen.
- Feature-Branch `feat/v1-travel-companion`; Commit/Push/Merge/Deployment nur nach ausdrücklicher Freigabe.

## Design-Regeln (Premium-Redesign)

Verbindlich für alle Gestaltungsarbeit: @CLAUDE.design.md
