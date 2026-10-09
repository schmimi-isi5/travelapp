# KI-Integration

## Architektur
`AiProvider` (`src/lib/ai/types.ts`) läuft ausschließlich serverseitig (`/api/ai/generate`, `/api/ai/status`). Schlüssel verlassen den Server nie.

| `AI_PROVIDER` | Verhalten |
|---|---|
| `disabled` (Standard) | `DeterministicFallbackProvider`: regelbasierte Hilfen, Status `disabled` |
| `konturos` | `KonturosProvider`, benötigt `KONTUROS_BASE_URL`, `KONTUROS_API_KEY`, `KONTUROS_COMPLETIONS_PATH`; sonst `not_configured` |
| `stub` | Nur Tests/Entwicklung. Liefert klar als „Stub“ gekennzeichnete Texte |

## Konturos: was ungeklärt ist
Der Handoff enthält keinen Konturos-API-Vertrag. Der Adapter erfindet deshalb keinen Endpunkt: der Pfad kommt aus `KONTUROS_COMPLETIONS_PATH`. **Angenommen (unbestätigt)**:

```
POST {KONTUROS_BASE_URL}{KONTUROS_COMPLETIONS_PATH}
Authorization: Bearer {KONTUROS_API_KEY}
{ "task": "summarize_journal|answer_question|draft_day_text", "language": "de", "input": {...} }
→ 200 { "text": string, "sources"?: [{ "title": string, "url"?: string }] }
```
Weicht der echte Vertrag ab, ist nur `KonturosProvider.generate` in `src/lib/ai/providers.ts` anzupassen. Gegen einen echten Konturos-Dienst wurde nichts getestet (`not_configured`); getestet ist der Adapter nur mit einem Fetch-Mock.

## Datenschutz
- Nur mit ausdrücklicher Freigabe in den Einstellungen (`nb-ai-consent`); die API lehnt Anfragen ohne `consent: true` ab.
- Es werden nur die vom Nutzer gewählten Texte gesendet (Frage, Tagebuchtext), nie Dokumente, Ausweise oder Zahlungsdaten.
- Antworten tragen Herkunft (`ai_generated` / `local_rule_based`), Anbieter, Zeitstempel und Verfügbarkeitshinweis.
- Transkription/Waveform: nicht implementiert (kein Provider). Audio wird aufgenommen und abgespielt, die UI weist darauf hin.
