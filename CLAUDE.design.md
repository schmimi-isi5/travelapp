# Design-Regeln Premium-Redesign (an CLAUDE.md anhängen)

## Quellen der Wahrheit
- Zielbild: `docs/design-audit/02_PREMIUM_DESIGN_VISION.md`
- Tokens & Komponenten: `docs/design-audit/03_DESIGN_SYSTEM_V2.md`
- Maßnahmen-IDs: `docs/design-audit/04_SCREEN_REDESIGN_PLAN.md` und `docs/design-audit/handoff/findings.json`
- Abnahme: `docs/design-audit/07_ACCEPTANCE_CRITERIA.md`

## Gestaltung
- Display-Schrift `font-display` (Fraunces) für Kapitel-Überschriften, `font-sans` (Inter) für UI. Keine Überschrift > 700 Gewicht, kein Text < 12 px.
- Nur Tokens verwenden (`teal-*`, `gold-*`, `sand-*`, `clay-*`, `savanna-*`, `ochre-*`, `stone-*`, `ink-*`). Keine Tailwind-Standardfarben (`slate-*`, `blue-*`, `amber-*`) in neuem Code.
- `gold-500` (#D4A373) nie als Textfarbe auf hellem Grund; dafür `gold-700`.
- Status nur über die 5 Zustände der Taxonomie (bestätigt, in Arbeit, zu klären, kritisch, unbekannt); max. ein Statusbadge pro Karte.
- Containerbreiten nur `max-w-reading`(42rem) / `max-w-content`(72rem) / `max-w-wide`(88rem).
- Max. eine gefüllte Primäraktion pro Sichtbereich.
- Bilder ausschließlich über `next/image` mit `sizes`; jedes Rasterbild in `public/images/ASSETS.json` mit Quelle, Lizenz, Urheber, Alt-Text. Keine externen Bild-URLs.
- Texte: Deutsch, Du-Form, keine Technikbegriffe (Liste Doc 07 G1). Labels zentral in `lib/labels.ts`.
- `prefers-reduced-motion` respektieren.

## Schutzliste – nie ändern ohne ausdrückliche Freigabe
Datenmodell, Migrationen, Supabase-Schema, RLS-Policies, Auth, Finanzberechnungen, Offline-Queue/Sync, Tresor-Kryptografie, Follower-Freigaben, EXIF-Bereinigung. Diese Bereiche dürfen gelesen, aber nicht verändert werden.

## Arbeitsweise
- Vor jeder Maßnahme die ID nennen (z. B. „R1“) und nach Umsetzung die zugehörigen Kriterien aus Doc 07 prüfen.
- Bestehende Komponenten verbessern statt neu schreiben; Aliase für alte Token-Namen erhalten.
- Keine Commits, Pushes, Merges oder Deployments ohne Freigabe von Michael.
- Login für Tests nur über gespeicherten Zustand `.auth/state.json`; niemals Passwörter eingeben oder speichern.
