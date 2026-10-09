# Technische Architektur

Frontend: Next.js App Router, React 19 sofern Kompatibilität geprüft, TypeScript strict, Tailwind, shadcn/ui, Lucide, TanStack Query, React Hook Form + Zod, MapLibre GL mit optionalen lizenzierten Kartendaten. Browser PWA mit Manifest und service worker; offline Read-Through Cache, IndexedDB/Dexie und mutation queue. API: Next.js server routes/services. Datenhaltung: Supabase Postgres/Auth/Storage/RLS. Medien: private buckets, signed URL short TTL. KI: `AiProvider` interface, Konturos server-side adapter aus dokumentiertem Config-Vertrag; `DeterministicFallbackProvider` für deaktivierte KI. Jobs: n8n optional, App-Grundfunktionen nicht von n8n abhängig.

Repository-Muster `src/app/(main)/**`, `src/components/**`, `src/features/{trip,stays,bookings,journal,media,ai,sightings,offline,safety,finance,family,archive}/**`, `src/lib/{domain,db,auth,offline,ai,formatting}/**`, `supabase/migrations/**`, `tests/{unit,integration,e2e}/**`.

Datenschutz: separates Familien-Mandat pro Tabelle; Serverautorisierung, RLS, vorzeichenbare URLs; nicht an öffentlichen Bild-URLs leaken. Datenlöschung und Portabilität implementieren. Keine API-Schlüssel clientseitig. Offline-Speicherung sensibler Ausweisdateien nur nach explizitem Opt-in und verschlüsselt, andernfalls online-only. Wiederanmeldung für sensible Dokumente.

Umgebungsvariablen: `NEXT_PUBLIC_APP_MODE=demo|supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable), `SUPABASE_SERVICE_ROLE_KEY` (server only), `AI_PROVIDER=disabled|konturos`, `KONTUROS_BASE_URL`, `KONTUROS_API_KEY` (server only), `NEXT_PUBLIC_MAP_STYLE_URL` (nur lizenzierter Tile-Service), `NEXT_PUBLIC_SITE_URL`. Ohne externe Schlüssel muss `demo` funktionieren.

Sync: `change_log` und `mutation_id` pro Mutation, optimistic UI, server acknowledgements; wiederholte Mutation idempotent; konflikthafte Buchungs-/Zahlungsupdates erzeugen `sync_conflict`, niemals letztes Schreiben blind gewinnen lassen. Offline-Bearbeitung von Zahlungstransaktionen ausdrücklich als `pending` markieren.
