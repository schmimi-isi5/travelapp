---
description: Einzelne Redesign-Maßnahme per ID umsetzen (z. B. /design-task R1)
argument-hint: <Maßnahmen-ID, z. B. R1 oder U4>
---
Maßnahme: $ARGUMENTS

1. Suche den Eintrag in `docs/design-audit/handoff/findings.json` und die Zeile in `docs/design-audit/04_SCREEN_REDESIGN_PLAN.md`. Sieh dir die referenzierten Screenshots an.
2. Prüfe Abhängigkeiten (`depends_on`). Sind sie nicht erledigt, melde das und stoppe.
3. Setze nur diese Maßnahme um, unter Beachtung von `CLAUDE.design.md` (Schutzliste!).
4. Prüfe die Kriterien aus `criteria`, aktualisiere `status` in `findings.json`.
5. Zeige geänderte Dateien und einen Vorher/Nachher-Screenshot der betroffenen Route. Kein Commit.
