# 03 – Design-System V2

Grundsatz: **Bestehende Tokens weiterentwickeln, nicht ersetzen.** Die vorhandenen Namen (`deep`, `gold`, `sand`, `clay`, `ink`, `muted`, `line`) bleiben als Aliase erhalten, damit bestehende Klassen (`bg-deep`, `text-muted`, `border-line`, `shadow-card`) nicht brechen.

Technik: Tailwind CSS v4 `@theme` in der globalen CSS-Datei (vermutlich `app/globals.css` – vor Umsetzung verifizieren). Keine neue Abhängigkeit außer zwei selbst gehosteten Webfonts über `next/font`.

---

## 1. Token-Architektur

```
Ebene 1  Basis       --color-teal-900 … --color-sand-50, --space-*, --radius-*
Ebene 2  Semantik    --color-surface, --color-text, --color-accent, --color-status-*
Ebene 3  Komponente  --card-radius, --hero-min-h, --chip-h …
```
Komponenten referenzieren nur Ebene 2/3. So lässt sich später ein Dunkelmodus („Safari-Nacht“) über Ebene 2 ergänzen.

---

## 2. Farben

### 2.1 Basispalette (bestehende Werte fett = unverändert)

| Token | Hex | Rolle | Bestehender Alias |
|---|---|---|---|
| `teal-950` | `#082430` | Nacht-Overlay, Footer | – |
| `teal-900` | `#0B2E3B` | Display-Text auf hell, dunkle Flächen | – |
| `teal-800` | **`#0F3D4E`** | Primärfarbe (Deep Teal) | `deep` |
| `teal-700` | **`#14566D`** | Hover | `deep-700` |
| `teal-100` | `#D5E6EB` | Ausgewählt-Hintergrund | – |
| `teal-50` | **`#E6F0F3`** | Aktiver Nav-Hintergrund | `deep-50` |
| `gold-700` | `#8F5F2E` | **Gold als Text** (5,46 : 1 auf Weiß) | – (neu) |
| `gold-500` | **`#D4A373`** | Safari Gold – nur Flächen, Icons, Linien | `gold` |
| `gold-200` | `#F0D9B5` | Eyebrow auf dunklem Foto (10,4 : 1 auf teal-900) | – |
| `gold-100` | `#F6E9DA` | Icon-Kreise, weiche Badges | – |
| `sand-300` | `#E5DCCD` | Linien | `line` |
| `sand-200` | `#EAD7BE` | Trennflächen | – |
| `sand-100` | **`#F5E6D3`** | Sand | `sand` |
| `sand-50` | **`#FBF6EE`** | Seitenhintergrund | `sand-50` |
| `clay-700` | **`#A8472B`** | Sunset Clay – Text/Buttons mit weißer Schrift (5,83 : 1) | `clay-strong` |
| `clay-500` | **`#C65A3A`** | Akzentflächen ≥ 24 px Text (4,26 : 1) | `clay` |
| `clay-50` | `#FBEAE4` | Kritischer Hintergrund | – |
| `savanna-700` | `#2F5D3A` | Bestätigt-Text | – (neu) |
| `savanna-50` | `#EAF2EA` | Bestätigt-Hintergrund | – (neu) |
| `ochre-700` | `#8A5A12` | Warn-Text | ersetzt `warn #b45309` |
| `ochre-50` | `#FDF3DC` | Warn-Hintergrund | ersetzt amber-50 |
| `stone-600` | `#5B6470` | Neutral-/Unbekannt-Text | nahe `muted` |
| `stone-100` | `#F1EEE9` | Neutral-Hintergrund | – |
| `ink-900` | **`#1F2937`** | Fließtext | `ink` |
| `ink-600` | **`#566376`** | Sekundärtext | `muted` |

**Entfernen aus der UI:** Tailwind `slate-700` (`#334155`) als dritte Textfarbe → durch `ink-900`/`ink-600` ersetzen. `blue-*` (Sync-Banner, Info-Box) → `teal-50`/`teal-800`.

### 2.2 Semantische Tokens

| Token | Wert | Verwendung |
|---|---|---|
| `--color-bg` | sand-50 | Seitenhintergrund |
| `--color-surface` | `#FFFFFF` | Karten |
| `--color-surface-sunken` | sand-100 | Finanzblock, Eingabebereiche |
| `--color-text` | ink-900 | Fließtext |
| `--color-text-muted` | ink-600 | Meta |
| `--color-heading` | teal-900 | Überschriften |
| `--color-accent` | teal-800 | Primäraktion |
| `--color-accent-warm` | clay-700 | Aufnahme, Erinnerung, Favorit |
| `--color-highlight` | gold-500 | Linien, Icons, Fortschritt |
| `--color-on-photo` | `#FFFFFF` | Text auf Foto (mit Overlay) |
| `--color-on-photo-eyebrow` | gold-200 | Eyebrow auf Foto |
| `--overlay-hero` | `linear-gradient(180deg, rgb(8 36 48 / .05) 30%, rgb(8 36 48 / .78) 100%)` | Hero-Verlauf |

### 2.3 Status-Taxonomie (max. 5 Zustände)

| Status | Punkt | Text/Hintergrund | Beispiele (bestehende Datenwerte bleiben unverändert) |
|---|---|---|---|
| **Bestätigt** | savanna-700 | savanna-700 / savanna-50 | gebucht, bezahlt, verifiziert |
| **In Arbeit** | gold-500 | gold-700 / gold-100 | angefragt, teilbezahlt |
| **Zu klären** | ochre-700 | ochre-700 / ochre-50 | Klärbedarf, Beleg fehlt |
| **Kritisch** | clay-700 | clay-700 / clay-50 | Frist überschritten, Platzhalter-Notfallnummer |
| **Unbekannt** | stone-600 (hohl) | stone-600 / stone-100 | unbekannt, keine Angabe |

Regel: Status wird **primär als Punkt + Wort** dargestellt, Badge-Fläche nur in Listenköpfen. Pro Karte maximal **ein** Statusbadge.

---

## 3. Typografie

### 3.1 Schriften
| Rolle | Schrift | Lizenz | Laden |
|---|---|---|---|
| Display | **Fraunces** (variabel, `opsz`, `wght 300–600`, `SOFT`) | SIL OFL 1.1 | `next/font/google` (wird zur Build-Zeit selbst gehostet → kompatibel mit CSP `default-src 'self'`) |
| Text/UI | **Inter** (variabel) | SIL OFL 1.1 | `next/font/google`, `display: swap` |
| Ziffern | Inter mit `font-variant-numeric: tabular-nums` | – | Finanzwerte, Zeiten |

Alternative Display-Schriften (falls Fraunces nicht gefällt): *Cormorant Garamond* (eleganter, dünner), *Newsreader* (journalistischer). Beide OFL.

### 3.2 Skala (Major Third 1,25, Basis 16 px)

| Token | Mobil | Desktop | Zeilenhöhe | Schrift / Gewicht | Einsatz |
|---|---|---|---|---|---|
| `display-xl` | 44 px | 76 px | 1,05 | Fraunces 300, opsz 144 | Dashboard-Hero |
| `display-l` | 36 px | 56 px | 1,08 | Fraunces 350 | Stations-/Tagebuch-Hero |
| `h1` | 30 px | 40 px | 1,15 | Fraunces 400 | Seitentitel (Kapitel) |
| `h1-tool` | 26 px | 32 px | 1,2 | Inter 650 | Seitentitel (Werkzeug) |
| `h2` | 22 px | 28 px | 1,25 | Fraunces 450 | Sektionen, Stationstitel |
| `h3` | 18 px | 20 px | 1,3 | Inter 600 | Kartentitel |
| `body-l` | 18 px | 19 px | 1,6 | Inter 400 | Tagebuchtext |
| `body` | 16 px | 16 px | 1,55 | Inter 400 | Standard |
| `small` | 14 px | 14 px | 1,45 | Inter 400/500 | Meta |
| `eyebrow` | 12 px | 13 px | 1,2 | Inter 600, Versal, Laufweite 0,14 em | Kicker |
| `micro` | 12 px | 12 px | 1,3 | Inter 500 | Badges (Minimum!) |

**Verboten:** 11 px (derzeit 6× auf dem Dashboard), Gewicht 800 für Überschriften, Gold `#D4A373` als Textfarbe auf hellem Grund.

---

## 4. Spacing, Raster, Container

- Basis 4 px (bestehendes `--spacing: .25rem` bleibt). Rhythmus-Schritte: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96.
- Sektionsabstand: 48 (mobil) / 64 (Tablet) / 96 px (Desktop).
- Kartenpadding: 16 (mobil) / 20 / 24 px.
- Raster: 4 Spalten mobil (Gutter 16, Rand 16), 8 Spalten Tablet (Gutter 20, Rand 24), 12 Spalten Desktop (Gutter 24, Rand 32).
- Container: `--container-content: 72rem`, `--container-reading: 42rem`, `--container-wide: 88rem` (Route-Split, Galerie).
- Breakpoints (Tailwind-Standard beibehalten): `sm 640`, `md 768`, `lg 1024`, `xl 1280`. Sidebar erst ab `lg`; Tablet nutzt Bottom-Nav **plus** zweispaltige Inhalte.

## 5. Radius, Schatten, Linien

| Token | Wert | Einsatz |
|---|---|---|
| `radius-sm` | 8 px | Badges, Inputs (neu) |
| `radius-md` | **12 px** | Buttons (eckig), Bilder in Karten |
| `radius-lg` | **16 px** | Karten |
| `radius-xl` | **24 px** | Hero, Sheets |
| `radius-full` | 9999 px | Pills, Avatare |
| `shadow-card` | `0 1px 2px rgb(15 61 78 / .06), 0 8px 24px -12px rgb(15 61 78 / .18)` | Standardkarte |
| `shadow-raised` | `0 2px 4px rgb(15 61 78 / .08), 0 20px 40px -16px rgb(15 61 78 / .28)` | Hover, Sheets |
| `shadow-photo` | `0 24px 48px -24px rgb(8 36 48 / .45)` | Bildkarten |
| `border-hairline` | 1 px sand-300 | Karten auf Weiß |

Regel: Bildkarten **ohne** Rahmen, nur `shadow-photo`; Textkarten mit Haarlinie, ohne starken Schatten.

## 6. Bildformate

| Format | Ratio | Einsatz | `sizes` |
|---|---|---|---|
| Hero Desktop | 21:9 (mind. 2880×1234) | Dashboard | `100vw` |
| Hero Mobil | 4:5 (1170×1462) | Dashboard mobil (Art Direction via `<picture>`) | `100vw` |
| Kapitel-Hero | 16:9 | Station, Tagebuch-Tag | `100vw` |
| Stationskarte | 3:2 | Route | `(min-width:1024px) 280px, 100vw` |
| Unterkunftskarte | 4:3 | Unterkünfte, Dashboard | `(min-width:1024px) 50vw, 100vw` |
| Tierkachel | 1:1 | Safari-Tracker | `160px` |
| Avatar | 1:1 | Familie | `40px/64px` |

Fokuspunkt pro Bild als Metadatum (`object-position`), damit Tiere/Horizonte beim Zuschnitt erhalten bleiben.

---

## 7. Komponenten

Legende: ♻ bestehende Komponente verbessern · ✚ neu.

### 7.1 Buttons ♻
| Variante | Stil | Einsatz |
|---|---|---|
| `primary` | teal-800, weiß, Höhe 44, Radius full, Inter 600 | eine pro Sichtbereich |
| `primary-on-photo` | gold-500, teal-900 Text | Hero |
| `secondary` | weiß, Haarlinie, teal-800 Text | Zweitaktion |
| `ghost` | transparent, teal-800, Unterstreichung bei Hover | Tertiär, „Alle anzeigen“ |
| `on-photo-outline` | 1 px weiß/60 %, weiß Text, Backdrop-Blur 6 px | Hero-Zweitaktion |
| `record` | clay-700, weiß, Mikrofon-Icon | Sprachmemo |
| `icon` | 44×44 Trefferfläche, 20 px Icon | Löschen, Favorit, Overflow |
| `danger` | clay-700 Text, nur in Bestätigungsdialogen gefüllt | Löschen |

### 7.2 Cards
- ♻ `Card` (Textkarte): Haarlinie, Radius lg, Padding 20/24, Titel h3.
- ✚ `MediaCard`: Bild oben (Ratio-Prop), Overlay-Slots `topLeft` (Status), `topRight` (Favorit/Nächte), Body (Eyebrow, Titel, Meta), Footer (Aktionen/Fakten). Basis für Station, Unterkunft, Aktivität, Tagebuch.
- ✚ `StatCard` ersetzt KPI-Karten: Zahl in Fraunces 40, Label small, optional Ring.

### 7.3 Navigation
- ♻ **Desktop-Sidebar** (ab `lg`), gruppiert:
  - *Reise:* Heute · Route · Unterkünfte · Buchungen
  - *Erinnern:* Tagebuch · Galerie · Safari-Tracker · Erinnerungen
  - *Organisieren:* Ausgaben · Sicherheit · KI-Guide
  - *Familie:* Familie · Mitreisen
  - Fußbereich: Einstellungen (inkl. Offline & Sync), Abmelden
- ♻ **Header:** Logo · (Suche) · Sync-Punkt · Familien-Avatare · Profil-Menü. **Top-Navigation entfällt.**
- ♻ **Mobile Bottom-Nav** (bis `lg`): Heute · Route · ⊕ (Schnellerfassung: Tagebuch, Foto, Sichtung, Ausgabe) · Erinnern · Mehr. Aktiver Zustand: Icon gefüllt + Label teal-800 + 3 px Indikator oben. Höhe 64 + Safe-Area.
- ✚ `SubNav` (sticky, horizontal scrollbar) für Station und Unterkunftsdetail.

### 7.4 Badges & Status
- ✚ `StatusDot` (8 px Punkt + Label small) – Standard.
- ♻ `Badge` nur noch 3 Varianten: `neutral`, `status-*`, `on-photo` (weiß 85 %, Blur). Mindestgröße 12 px.
- ✚ `MissingInfo`: eine Zeile „Fehlt: Referenz · Anbieter · Beleg“ mit Aktion.
- ✚ `SourceInfo`: Info-Icon mit Popover (Quelle, Stand, „nicht verifiziert“) – ersetzt Badge-Trios.

### 7.5 Status- & Fortschrittsanzeigen
- ✚ `PaymentMeter`: horizontaler Balken in drei Segmenten (verifiziert savanna, unverifiziert gold gestreift, offen sand-200), darunter Beträge tabellarisch; bei unbekanntem Gesamtpreis: gestrichelter Rahmen + „Gesamt noch unbekannt“.
- ✚ `ProgressRing` (Big Five, Buchungen bestätigt).
- ✚ `StatusStep` (Angefragt → Bestätigt → Bezahlt → Beleg) für Unterkunft/Buchung.

### 7.6 Eingabefelder ♻
- Höhe 48, Radius sm (8 px), Hintergrund weiß, Haarlinie sand-300, Fokus 2 px teal-700 + 2 px Offset.
- Selects mit eigenem Chevron; Station-Filter als `Combobox` mit Stationsfotos.
- ✚ `SegmentedControl` für Filter mit ≤ 5 Optionen; ✚ `FilterRail` (horizontal scrollbar, Fade an Rändern) für mehr.

### 7.7 Modals, Dialoge, Sheets
- ✚ `Sheet` (Desktop: rechts 480 px; Mobil: Bottom-Sheet mit Griff, 90 vh) für Unterkunftsdetail, Buchung bearbeiten, Sichtung erfassen.
- ♻ `Dialog` nur für Bestätigungen (Löschen), Radius xl, max. 440 px, Fokusfalle, `Esc` schließt.
- ✚ `Lightbox`: schwarzer Grund 96 %, Swipe, Pfeiltasten, Pinch-Zoom, Metadatenleiste.

### 7.8 Empty States ♻
Drei Typen statt einem gestrichelten Kasten:
1. **Vorfreude** (vor Reisebeginn): Stationsfoto/Illustration, Fraunces-Satz („Euer erstes Kapitel beginnt am 13. Oktober in Windhoek.“), primäre Aktion.
2. **Unterwegs leer** (z. B. Tracker): Illustration der Zielarten (Big Five Silhouetten), „Wer sieht den ersten Elefanten?“.
3. **Werkzeug leer** (Ausgaben, Tresor): kompakt, eine Zeile + Button, kein Rahmen.

### 7.9 Loading States ✚
- Skeletons in Form der Zielkomponente (MediaCard-Skeleton mit 3:2-Fläche, sand-100 → sand-200 Shimmer 1,2 s).
- Bilder: LQIP-Blur (`placeholder="blur"`) statt leerer Fläche.
- Kein Vollseiten-Spinner; Sync-Indikator im Header statt Banner.

### 7.10 Weitere neue Komponenten
`StationRail` (horizontale Stationsminiaturen), `RouteSegment` (Fahrtstrecke zwischen Stationen), `JournalCard`, `AudioPlayer` (Wellenform, Clay), `SpeciesTile`, `AvatarStack`, `FactBar` (Icon-Faktenleiste), `PhotoHero` (Bild + Overlay + Slots).

---

## 8. Ikonografie & Illustration
- Lucide bleibt (1,5 px Strichstärke einheitlich; derzeit gemischt wirkend in Kreisen).
- Icon-Kreise nur in Leerzuständen/Navigation „Mehr“; in Karten Icons ohne Kreis.
- Bestehende SVG-Landschaften werden zu einem **Fallback-Set** mit 7 Klassen (Wüste, Küste, Gebirge, Savanne, Fluss/Delta, Salzpfanne, Stadt) verfeinert; Stadt nur für Windhoek/Kasane-Ort, nie für Naturstationen. Klassenzuordnung je Station explizit, nicht per Default.

## 9. Barrierefreiheit (verbindlich)
- Kontrast nach Tabelle 2.1; Text auf Foto nur mit `--overlay-hero` und min. 4,5 : 1 an der Textposition.
- Touch-Ziele ≥ 44×44 px; Textlinks in Listen mit Zeilen-Trefferfläche.
- Fokus sichtbar (2 px teal-700, Offset 2 px) auf allen interaktiven Elementen.
- `prefers-reduced-motion`: keine Ken-Burns, keine Shared-Element-Übergänge.
- Bilder: `alt` mit Ort + Motiv („Dünen im Sossusvlei bei Sonnenaufgang“); dekorative SVGs `aria-hidden` (bereits so umgesetzt).

## 10. Referenz-Implementierung `@theme` (Entwurf, nicht eingespielt)
```css
@theme {
  --font-display: var(--font-fraunces), ui-serif, Georgia, serif;
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;

  --color-teal-950:#082430; --color-teal-900:#0B2E3B; --color-teal-800:#0F3D4E;
  --color-teal-700:#14566D; --color-teal-100:#D5E6EB; --color-teal-50:#E6F0F3;
  --color-gold-700:#8F5F2E; --color-gold-500:#D4A373; --color-gold-200:#F0D9B5; --color-gold-100:#F6E9DA;
  --color-sand-300:#E5DCCD; --color-sand-200:#EAD7BE; --color-sand-100:#F5E6D3; --color-sand-50:#FBF6EE;
  --color-clay-700:#A8472B; --color-clay-500:#C65A3A; --color-clay-50:#FBEAE4;
  --color-savanna-700:#2F5D3A; --color-savanna-50:#EAF2EA;
  --color-ochre-700:#8A5A12; --color-ochre-50:#FDF3DC;
  --color-stone-600:#5B6470; --color-stone-100:#F1EEE9;

  /* Aliase für Bestandsklassen */
  --color-deep: var(--color-teal-800); --color-deep-700: var(--color-teal-700); --color-deep-50: var(--color-teal-50);
  --color-gold: var(--color-gold-500); --color-sand: var(--color-sand-100);
  --color-clay: var(--color-clay-500); --color-clay-strong: var(--color-clay-700);
  --color-line: var(--color-sand-300); --color-warn: var(--color-ochre-700);

  --radius-sm:8px; --radius-md:12px; --radius-lg:16px; --radius-xl:24px;
  --shadow-card:0 1px 2px rgb(15 61 78/.06),0 8px 24px -12px rgb(15 61 78/.18);
  --shadow-raised:0 2px 4px rgb(15 61 78/.08),0 20px 40px -16px rgb(15 61 78/.28);
  --shadow-photo:0 24px 48px -24px rgb(8 36 48/.45);
  --container-reading:42rem; --container-content:72rem; --container-wide:88rem;
}
```
