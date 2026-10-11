---
description: Premium-Redesign Phase 1 (Fundament) gemäß docs/design-audit umsetzen
---
Lies `HANDOFF_PROMPT.md`, `CLAUDE.design.md` und `docs/design-audit/06_IMPLEMENTATION_ROADMAP.md`.

Arbeite die Phase-1-Maßnahmen aus `docs/design-audit/handoff/findings.json` ab (`phase == 1`), in der Reihenfolge des Feldes `order`. Optionaler Filter über Argumente: $ARGUMENTS (z. B. „hotfix“ = nur Einträge mit `"hotfix": true`).

Für jede Maßnahme:
1. ID und Ziel nennen, betroffene Dateien verifizieren (Feld `files` aktualisieren, falls abweichend).
2. Umsetzen – nur Darstellungsschicht; Schutzliste aus `CLAUDE.design.md` beachten.
3. Zugehörige Kriterien (`criteria`) aus `07_ACCEPTANCE_CRITERIA.md` prüfen.
4. In `findings.json` `status` auf `done` oder `blocked` (mit `note`) setzen.

Nach der Etappe `/design-verify` ausführen und zusammenfassen. Kein Commit, Push oder Deployment.
