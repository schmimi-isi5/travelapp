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
