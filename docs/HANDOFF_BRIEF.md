# Claude Code — autonomer Implementierungsauftrag

## Ziel und Ausführung
Implementiere **jetzt** eine produktionsorientierte V1 der Familien-Reise-PWA „Namibia & Botswana – Unsere Reise. Unsere Geschichte.“ im vorhandenen Repository. Keine Rückfragen. Setze sämtliche V1-Funktionen durchgängig um, sodass sich die erste Version mit realistisch gestalteten Oberflächen, Demo-Daten und automatisierten Tests prüfen lässt. Arbeite im Feature-Branch `feat/v1-travel-companion`; niemals direkt auf `main`. Commit/Push/PR nur bei expliziter Autorisierung; kein automatischer Merge/Deployment. Weder realen Zahlungsverkehr noch externe Buchungen auslösen.

## Priorität und Definition of Done
1. `docs/PRODUCT_SPEC.md`, `docs/ACCEPTANCE.md`, `docs/ARCHITECTURE.md`, `docs/DATA_CONTRACT.md` lesen.
2. Designvorgaben aus `design/tokens/tokens.json` und Referenzboards übernehmen, **keine** Screenshots als App-UI benutzen.
3. Next.js App Router, React, TypeScript strict, Tailwind, shadcn/ui, Lucide, responsive PWA. Supabase (Postgres, Auth, Storage, RLS); offline per IndexedDB/Dexie und Service Worker (Workbox oder Serwist; kompatible Version wählen). Tests via Vitest + Playwright.
4. Ausführbarer lokaler Demo-Modus **ohne externe Schlüssel**: alle Seiten, Navigation, Formulare, CRUD, Filter, Diagramme/Übersichten und Offline-Simulation funktionieren mit persistenter IndexedDB. Ein Demo-Banner macht Datenherkunft transparent.
5. Produktiver Modus mit Supabase, Storage, Familien-Rollen und Migrationen. Kein Testuser darf in echte Daten gelangen. Alle Secrets ausschließlich serverseitig.
6. Konturos-Adapter `AiProvider`, daneben nachvollziehbarer lokaler Fallback für Empfehlungen und Tagebuchzusammenfassungen (keine vorgetäuschten KI-Ergebnisse). API-Verträge und Umgebungsvariablen dokumentieren; keine unbestätigten Endpunkte erfinden.
7. Upload von Fotos/Videos/Audios, EXIF optional, Standorte nur per Einwilligung, Waveform/Transkription nur bei verfügbarem Provider, sonst Audioaufnahme/-wiedergabe. Bei Offline-Upload Größenlimit und deutliche Warteschlange.
8. Sicherheitsprüfungen, Unit-/Integration-/E2E-Tests, typecheck, lint und Build ausführen, Fehler selbst reparieren, Ergebnisse in `docs/IMPLEMENTATION_REPORT.md` dokumentieren.

## V1-Module (alle Pflicht)
Reiseplanung mit Routenliste, interaktiver Karte, Tagesbriefing, Stationsdetails; Unterkünfte mit Hotel-Checkliste, Preisen, Rechnungen, Teilzahlungen, offenen Beträgen; Buchungen für Flüge, Mietwagen, Aktivitäten; Familien-Tagebuch mit Medien und Sprachmemos; KI-Hinweise mit Herkunfts- und Aktualitätsstatus; Safari-Tiersichtungen; Offline-First mit Sync; Sicherheits-/Dokumenten-Tresor; Ausgaben nach Währung; Familienzugriff und Rechte; Erinnerungsarchiv mit Export; durchgängiges Design-System.

## Ausführungsreihenfolge
A. Repo initialisieren, UI-Bibliothek/Tokens/Layouts und Routen ausbringen. B. Zod-Domänenschema, Demo-Daten, lokale Repositories und CRUD. C. Supabase SQL + RLS + Storage und Adapter. D. Offline-Sync samt Fehlerbehandlung. E. Medien, KI-Adapter, Exporte. F. Tests/Politur/Dokumentation. Kein Stopp zwischen Phasen; bei fehlenden Schlüsseln Demo-Betrieb vollständig abschließen.

## Qualitätsregeln
- Keine fiktiven Reservierungsnummern, Rechnungen oder Bezahlstatus im Echtmodus. `unknown` ist eigener Status. Kein implizites `paid=false` als belastbare Information.
- Buchungsbetrag und erfasste Zahlungsbuchungen in **Minor Units**; jede Währung separat; Summen über Währungen niemals ungekennzeichnet addieren. FX-Umrechnung nur mit Zeitpunkt/Quelle/Kurs; ohne FX keine konsolidierte EUR-Summe.
- Routen-Fahrzeiten nur aus Anbieter/Quelle oder als ausdrücklich grobe Offline-Schätzung etikettieren. Keine Navigation, Verkehrsdaten oder aktuellen Park-/Grenzöffnungszeiten halluzinieren.
- Sichere Familiengrenzen durch Datenbank-RLS (nicht bloß UI). Minderjährige standardmäßig ohne Zugriff auf Zahlungsdetails/identifizierende Dokumente. Owner/Adult/Member/Child-Rollen.
- Medien: private Storage-Buckets, signierte URLs nur kurzlebig, Dateityp/Größe validieren. Uploads dürfen bei netzbedingten Unterbrechungen wiederaufgenommen werden, wo unterstützt.
- Offline-Änderungen: stabile UUIDs, device/client mutation ids, updated_at/version, Idempotenz; Konflikte niemals still überschreiben. Für persönliche Journale append-first, andere Konflikte markieren und auflösen.
- Backup & Export: JSON + CSV + ZIP der verfügbaren Medien (mit Manifest), GDPR-Löschpfad; fehlende Medien klar benennen. PDF-Reisebuch ist V2.
- Accessibility: Tastatur, Kontrast WCAG AA, Reduced Motion, Alternativtexte, mobile Touch-Ziele, fehlertolerante Formulare.
- Keine Marker wie TODO/FIXME für zentrale V1-Flows; falls externe Integrationen blockieren, implementiere dokumentierte, nutzbare Adapter und sinnvolle Graceful Degradation.

## Abnahme
Erst fertig, wenn alle in `docs/ACCEPTANCE.md` genannten Szenarien geprüft und dokumentiert sind. Fertige Screenshots bei 390px, 768px und 1440px unter `docs/screenshots/` erstellen. Startbefehle: `npm install`, `npm run dev`, `npm run test`, `npm run test:e2e`, `npm run build`.
