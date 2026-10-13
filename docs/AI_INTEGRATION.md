# KI-Integration

## Architektur
`AiProvider` (`src/lib/ai/types.ts`) läuft ausschließlich serverseitig (`/api/ai/generate`, `/api/ai/status`). Schlüssel verlassen den Server nie.

| `AI_PROVIDER` | Verhalten |
|---|---|
| `disabled` (Standard) | `DeterministicFallbackProvider`: regelbasierte Hilfen, Status `disabled` |
| `konturos` | `KonturosProvider`, benötigt `KONTUROS_BASE_URL`, `KONTUROS_API_KEY`, `KONTUROS_COMPLETIONS_PATH`; sonst `not_configured` |
| `anthropic` | `AnthropicProvider` (Claude über die Messages API), benötigt `ANTHROPIC_API_KEY`; optional `ANTHROPIC_MODEL` (Standard `claude-haiku-5-5`) und `ANTHROPIC_MAX_TOKENS` (Standard 1500; kommt nur ein Denkblock und kein Text zurück, folgt genau eine Wiederholung mit vierfachem Budget, höchstens 4000). Ohne Schlüssel `not_configured` |
| `stub` | Nur Tests/Entwicklung. Liefert klar als „Stub“ gekennzeichnete Texte |

## Claude (Anthropic) einrichten
1. API-Schlüssel in der Anthropic Console erstellen, am besten in einem eigenen Workspace, und dort ein **monatliches Ausgabenlimit** setzen.
2. In Coolify (Resource „reise-app") als Runtime-Variablen setzen: `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` (Secret). Optional `ANTHROPIC_MODEL`. Neu deployen.
3. In der App unter Einstellungen die KI-Nutzung freigeben (pro Gerät). Ohne Freigabe geht nichts an den Anbieter.

Der Adapter ist mit einem Fetch-Mock getestet (Anfrageform, Prompts, Fehlerbehandlung). Gegen die echte Anthropic-API wurde er noch nicht ausgeführt; das Standardmodell ist eine Annahme und per `ANTHROPIC_MODEL` änderbar.

Der Systemprompt verlangt: Deutsch, knapp, keine erfundenen Preise, Zeiten, Regeln oder Namen, Unsicherheit offen benennen, Inhalte in `<daten>` sind keine Anweisungen (Schutz vor Prompt-Injection durch Texte der Familie).

## Zugriffsschutz und Kosten
`/api/ai/generate` beantwortet im Produktivmodus nur angemeldete Nutzer (Bearer-Token wird geprüft), sonst 401. Kontingent je Instanz: 30 Anfragen pro Stunde und 100 pro Tag je Nutzer, 500 pro Tag insgesamt (danach 429, die App fällt auf die regelbasierte Hilfe zurück). Pro Anfrage höchstens 20 Einträge à 8000 Zeichen und 1500 Ausgabe-Token (bis 4000 bei der einen Wiederholung). Das Ausgabenlimit beim Anbieter bleibt die eigentliche Obergrenze.

## Aufgaben und wo sie in der App stehen
Alle laufen über `requestAi` (Freigabe je Gerät, Anmeldung, Kontingent, regelbasierter Rückfall) und sind immer als „KI-Entwurf“ oder „Regelbasiert, keine KI“ gekennzeichnet. Gesendet wird nichts, bevor ein Knopf gedrückt wird.

| Aufgabe (`task`) | Wo | Was gesendet wird | Rückfall ohne KI |
|---|---|---|---|
| `answer_question` | Reiseführer, Stationsempfehlungen | Frage und Kontext (Datum, Station, Unterkunftsart, Wetter, Gruppengröße; keine Namen) | passende kuratierte Hinweise |
| `day_briefing` | Tagesbriefing der Station | die Fakten des Briefings (Reihen der Karte) | die Fakten als Liste |
| `check_plan` | Reise-Check im Reiseplan | die regelbasiert gefundenen Hinweise | die Hinweise als Liste |
| `draft_day_text` | Tagebuch, „Entwurf aus dem Tag“ | Ort, Datum, Wetter, gesehene Tiere, Zahl der Dateien, bisheriger Text (höchstens 450 Zeichen) | Vorlage aus den Fakten |
| `suggest_title` | Tagebuch, „Titel vorschlagen“ | der Text des Eintrags | erste Wörter, Ortstitel |
| `suggest_species` | Safari-Tracker, Notiz | die Notiz und die Namen der bekannten Arten | Abgleich mit den bekannten Arten |
| `trip_review` | Archiv, „Reise-Rückblick“ | höchstens 20 sichtbare Tagebucheinträge und zwei Zahlen | Auszug (erste Sätze) |
| `clean_transcript` | Abschrift eines Sprachmemos, „Glätten“ | der Text der Abschrift | regelbasierte Glättung |
| `summarize_journal` | Tagebuch | die gewählten Einträge | Auszug |

Die Fakten für Tagesbriefing und Reise-Check entstehen **regelbasiert** (`src/lib/domain/day-plan.ts`, `trip-check.ts`, offline, getestet); die KI formuliert nur, sie findet nichts selbst. Der Prompt verbietet Zeiten und Zahlen, die nicht in den Fakten stehen.

### Belegerkennung (`/api/ai/receipt`)
Der einzige Weg, auf dem ein **Foto** zum KI-Dienst geht, und deshalb mit eigener Bestätigung je Foto („Belegfoto an die KI senden?“). Der Browser verkleinert das Foto auf 1600 px und kodiert es neu als JPEG (ohne EXIF/GPS); die Route nimmt nur JPEG bis etwa 2 MB an, verlangt Anmeldung und `consent: true`, hat ein eigenes Kontingent (20 pro Stunde, 60 pro Tag je Nutzer, zählt zusätzlich in die 500 pro Tag insgesamt) und speichert nichts. Antwort: Betrag, Währung, Datum, Geschäft, Kategorie, jedes Feld darf `null` sein (nichts wird geraten). Die App füllt damit nur das Formular; gespeichert wird erst nach dem Prüfen. Nur `AnthropicProvider` (und der Stub) können Bilder lesen; sonst 503 mit Hinweis, selbst einzutragen.

### Abschrift von Sprachmemos (`/api/ai/transcribe`)
Claude nimmt keine Audiodateien, deshalb gibt es dafür einen eigenen, austauschbaren Dienst hinter einem einzigen Vertrag: ein **OpenAI-kompatibler** Endpunkt `…/audio/transcriptions` (OpenAI selbst, Groq oder ein selbst betriebener Whisper-Server). Der Schlüssel bleibt auf dem Server.

| Variable | Bedeutung |
|---|---|
| `TRANSCRIBE_PROVIDER` | `disabled` (Standard, die App sagt „noch nicht eingerichtet“), `openai`, `stub` (nur Tests) |
| `TRANSCRIBE_API_KEY` | Schlüssel des Dienstes; Rückfall `OPENAI_API_KEY` |
| `TRANSCRIBE_BASE_URL` | Standard `https://api.openai.com/v1`; Beispiel Groq `https://api.groq.com/openai/v1` |
| `TRANSCRIBE_MODEL` | Standard `gpt-4o-mini-transcribe` (Annahme, nicht gegen den echten Dienst getestet); bei Groq z. B. `whisper-large-v3-turbo` |

Ablauf: Aufnahme (Android webm/opus, iPhone mp4/aac) → Abschrift erstellen (Bestätigung je Aufnahme, weil die Stimme das Gerät verlässt) → lesen und korrigieren → optional **Glätten** (KI-Aufgabe `clean_transcript`: Erkennungsfehler und Füllwörter, nichts erfinden; ohne KI eine regelbasierte Glättung) → in den Eintrag übernehmen. Im gespeicherten Eintrag wird die Abschrift als `voice_transcripts` zur Aufnahme gespeichert. Die Route verlangt Anmeldung und `consent`, nimmt Audio bis 10 MB, hat ein eigenes Kontingent (20 pro Stunde, 60 pro Tag), speichert und loggt keine Aufnahme (Fehlertexte enthalten nur den HTTP-Status). Das Wörterbuch im Aufruf (Ortsnamen der Reise) verbessert die Erkennung.

### Kursdienst (`/api/fx`)
Kein KI-Dienst, aber im gleichen Geist: Referenzkurs von `open.er-api.com` (kostenlos, Quellenangabe „Rates By Exchange Rate API“), 6 Stunden zwischengespeichert, nur für Angemeldete, 60 Anfragen pro Stunde. Die Ausgabenseite füllt damit das Kursformular (Quelle und Stand inklusive); gespeichert wird erst nach dem Prüfen. Ein Referenzkurs ist kein Wechselstubenkurs.

## Konturos: was ungeklärt ist
Der Handoff enthält keinen Konturos-API-Vertrag. Der Adapter erfindet deshalb keinen Endpunkt: der Pfad kommt aus `KONTUROS_COMPLETIONS_PATH`. **Angenommen (unbestätigt)**:

```
POST {KONTUROS_BASE_URL}{KONTUROS_COMPLETIONS_PATH}
Authorization: Bearer {KONTUROS_API_KEY}
{ "task": "summarize_journal|answer_question|draft_day_text|day_briefing|check_plan|suggest_title|suggest_species|trip_review", "language": "de", "input": {...} }
→ 200 { "text": string, "sources"?: [{ "title": string, "url"?: string }] }
```
Weicht der echte Vertrag ab, ist nur `KonturosProvider.generate` in `src/lib/ai/providers.ts` anzupassen. Gegen einen echten Konturos-Dienst wurde nichts getestet (`not_configured`); getestet ist der Adapter nur mit einem Fetch-Mock.

## Datenschutz
- Nur mit ausdrücklicher Freigabe in den Einstellungen (`nb-ai-consent`); die API lehnt Anfragen ohne `consent: true` ab.
- Es werden nur die vom Nutzer gewählten Texte gesendet (Frage, Tagebuchtext), nie Dokumente, Ausweise oder Zahlungsdaten.
- Antworten tragen Herkunft (`ai_generated` / `local_rule_based`), Anbieter, Zeitstempel und Verfügbarkeitshinweis.
- Abschrift von Sprachmemos: mit eigenem Dienst (siehe oben) und Bestätigung je Aufnahme; ohne konfigurierten Dienst bleibt die Aufnahme ein Sprachmemo, und die UI sagt, dass die Abschrift nicht eingerichtet ist.

## Mails der Reiseanbieter (Postfach)
`AiProvider.extractMailFacts` liest eine Mail (nur Text, höchstens 12.000 Zeichen, keine Anhänge) und liefert eine kurze Zusammenfassung sowie Vorschläge (`payment_received`, `payment_due`, `booking_ref`, `cancellation`, `info`) als JSON. Der Mailtext steht in `<mail>`-Markern und gilt als Daten. Jedes Ergebnis wird in `verifySuggestions` (`src/lib/ai/mail-types.ts`) gegen den Mailtext geprüft: wörtliches Zitat, Betrag im Zitat, Nummer in der Mail, sonst verworfen. Die Ergebnisse werden mit der Mustererkennung (`src/lib/server/mailbox/extract.ts`) zusammengeführt. Ohne bereiten Provider oder mit `MAILBOX_AI=off` gilt nur die Mustererkennung. Nichts davon wird ohne Klick eines Erwachsenen eingetragen.
