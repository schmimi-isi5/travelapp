# 04 Importablauf

```bash
SUPABASE_URL=https://api.reise.<domain> SUPABASE_SERVICE_ROLE_KEY=<Secret> \
  node scripts/destination-images/import.mjs [--trip <id>] [--dry-run] [--force] [--all-countries] [--report <datei>]
```
Optional `PIXABAY_API_KEY=<Schlüssel>` setzen, dann kommen Stockfotos von Pixabay als zweite Quelle dazu (siehe 02). Läuft auf einem vertrauenswürdigen Rechner mit Repo-Checkout und `npm ci` (nutzt `sharp` und `@supabase/supabase-js`). Der Schlüssel wird nie ausgegeben.

## Schritte
1. **Route lesen:** alle Stationen (optional einer Reise) aus `trip_stops`; Stationen außerhalb Namibias/Botswanas (Abflug in Frankfurt) und ohne Titel werden übersprungen (`--all-countries` hebt das auf). Nichts wird erfunden.
2. **Orte bilden:** `placeFromStop` entfernt Zusätze („Nationalpark“, „Gebirge“, „(Süd)“, „Ocean“), nimmt bei „A / B“ den spezifischeren Teil und bildet den Ortsschlüssel (`Namib Wüste / Sossusvlei` → `sossusvlei`; beide Erongo-Stationen → `erongo`). Stationen desselben Orts teilen sich die Bilder.
3. **Suchbegriffe:** `<Ort> <Land>`, `<Ort> landscape`, `<Ort> <Land> nature`, englische Übersetzung der Zusätze (Wüste → desert) sowie benannte Sehenswürdigkeiten aus den Highlights der Station (Beispiel „Popa Falls (N.P.) + Bwabwata (N.P.)“ → `Popa Falls Namibia`, `Bwabwata Namibia`; Tätigkeiten wie „Relaxen am Pool“ werden ausgefiltert).
4. **Kandidaten holen:** Commons-API, gedrosselt (siehe 02).
5. **Prüfen und bewerten:** Format/Kategorie-Filter, Lizenz-Schranke, Ortsbeleg, dann Wertung (Qualität bis 45, Ortsbeleg bis 35, Rollenpassung bis 15, Motiv −40…+12, Featured-Bonus, Abzug bei Wiederverwendung in Nachbarorten). Mindestwerte je Rolle (Hero 55, Karte 45, Galerie 35): darunter bleibt die Rolle leer.
6. **Rollen verteilen:** je Ort 1 Hero, 1 Karte, bis zu 10 Galeriebilder (`GALLERY_TARGET`); keine Datei doppelt je Ort. Hero braucht mindestens 1920 px Breite und Seitenverhältnis 1,4 bis 2,2.
7. **Optimieren:** WebP-Varianten (Hero: 1920×1080, 1200×800, 800×700; Karte: 800×600, 320×240; Galerie: 1200 px breit, 320×240), Zuschnitt auf den Bildausschnitt mit der meisten Aufmerksamkeit, ohne EXIF/GPS.
8. **Speichern:** Pfad `<ort>/<hash12>-<rolle>-<variante>.webp` (inhaltsadressiert, daher unveränderlich), `upsert` der Tabellenzeile mit `ignoreDuplicates`.
9. **Verknüpfen:** über `place_key` und Koordinaten zur Laufzeit (siehe 01), keine Stations-IDs in der Bibliothek.
10. **Berichten:** je Ort Status (`complete`, `partial`, `no_images`, `complete_skipped`), Ablehnungsgründe, gewählte Dateien mit Lizenz und Ortsstatus; optional als JSON (`--report`).

## Idempotenz und Fehler
- Vollständige Orte werden übersprungen (keine Suche, kein Download). Teilweise Orte werden nur um fehlende Rollen ergänzt; bekannte Dateien (Titel) und bekannte Inhalte (Hash) werden nicht erneut genommen.
- Speicher-Uploads laufen ohne Überschreiben; „existiert bereits“ gilt als Erfolg.
- Fehler einzelner Suchen oder Downloads werden protokolliert und stoppen den Lauf nicht (`search_error`, `import_error`).
- `--dry-run` wählt und meldet, schreibt aber nichts.

## Neue Reisen
Stationen anlegen, den Import mit `--trip <id>` ausführen. Bekannte Orte werden wiederverwendet; neue Orte werden automatisch gesucht. Eine Station ohne Ergebnis zeigt weiter die Illustration.

## Rücknahme
Ein Foto verschwindet, sobald `approved = false` gesetzt wird (auch ohne Deploy; Geräte holen die Liste beim nächsten Online-Start, bereits geladene Bilder bleiben im Gerätecache, bis der Cache geleert wird).
