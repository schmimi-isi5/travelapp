# 01 Architektur der Bildversorgung

Ziel: Jede Reisestation wird automatisch durch lizenzierte, belegte Fotos repräsentiert, ohne dass jemand Bilder suchen, hochladen oder zuordnen muss. Die Bibliothek ist reiseübergreifend und von den privaten Familienmedien getrennt.

```
Stationen der Reise (trip_stops)  ──►  Importpipeline (Server, Service-Role)
                                         1 Orte ableiten   (lib.mjs: placeFromStop)
                                         2 Kandidaten holen (commons.mjs: Wikimedia Commons API)
                                         3 Lizenz- und Ortsprüfung, Ranking (lib.mjs)
                                         4 Varianten erzeugen (makeVariants.mjs, sharp, WebP)
                                         5 speichern + verknüpfen (pipeline.mjs)
                                              │
                    ┌─────────────────────────┴───────────────────────┐
         Bucket destination-media (öffentlich,            Tabelle destination_images
         WebP, inhaltsadressierte Pfade)                  (Quelle, Lizenz, Prüfstatus, Varianten)
                    │                                                 │ RLS: angemeldete Nutzer lesen nur approved
                    ▼                                                 ▼
         /media/destination/<pfad>  (App-Route,           useDestinationLibrary (lokal zwischengespeichert)
          gleiche Origin, immutable)                                   │ imagesForStop(stop): Ortsschlüssel, sonst nächster Ort im Radius
                    │                                                  ▼
                    └──────────────►  DestinationHero · StopCover · ResponsiveTravelImage · ImageAttribution · StayRegionThumb
                                      Service Worker: Cache nb-images-v1 (Vorwärmen der wichtigen Varianten)
```

## Bausteine
| Baustein | Datei |
|---|---|
| Datenmodell, Bucket, RLS | `supabase/migrations/0007_destination_images.sql` |
| Reine Importlogik (testbar) | `scripts/destination-images/lib.mjs` |
| Commons-Client (offizielle MediaWiki-API, gedrosselt) | `scripts/destination-images/commons.mjs` |
| Pipeline (idempotent, Berichte) | `scripts/destination-images/pipeline.mjs` |
| Bildvarianten (WebP, ohne Metadaten) | `scripts/destination-images/makeVariants.mjs` |
| Kommandozeile | `scripts/destination-images/import.mjs` |
| Auslieferung | `src/app/media/destination/[...path]/route.ts` |
| Zuordnung Station → Bilder | `src/lib/media/places.ts` |
| Bibliothek laden, zwischenspeichern, vorwärmen | `src/lib/media/library.ts`, `src/features/media/use-destination-library.ts` |
| Komponenten | `src/components/destination-image.tsx` |
| Offline | `public/sw.js` (Cache `nb-images-v1`) |

## Datenmodell (`destination_images`)
Ort (`place_key`, Beschriftung, Land, Koordinaten, Radius), Rolle (`hero`, `card`, `gallery`), Varianten (JSON mit Speicherpfaden), Größe, Alt-Text, Quelle (Anbieter, Datei-ID, URL), Urheber, Lizenz (Typ, URL, Attributionstext, Pflicht), `license_checked_at`, `license_verified`, `location_verified` mit `location_basis`, Eignungswert, Prüfhinweis, `content_hash`, `approved`. Eindeutig je Ort, Rolle und Inhalt (Duplikate unmöglich). `approved` ist nur mit `license_verified` zulässig (CHECK-Constraint).

Abweichungen vom Beispiel-Interface des Auftrags: Das Modell ist ortsbezogen statt an Stations-, Unterkunfts- oder Aktivitäts-IDs gebunden, damit eine Bibliothek viele Reisen bedient; die Zuordnung zur Station geschieht zur Laufzeit über Ortsschlüssel und Koordinaten, nicht über gespeicherte Stations-IDs (kein manuelles Mapping, keine Verknüpfung privater Daten mit der öffentlichen Bibliothek).

## Trennung öffentlich/privat
Familienfotos: Bucket `media` (privat), Tabelle `media_assets`. Bibliothek: Bucket `destination-media` und Tabelle `destination_images`, keine Verweise aufeinander. Die Bibliothek enthält nur Referenzfotos von Orten.

## Schreibzugriff
Nur die Importpipeline mit dem Service-Role-Schlüssel schreibt (Tabelle und Bucket). Clients haben nur Lesezugriff auf freigegebene Zeilen. Der Schlüssel liegt nie im Frontend; der Import läuft von einem vertrauenswürdigen Rechner, nicht im Browser und nicht als öffentliche Route.
