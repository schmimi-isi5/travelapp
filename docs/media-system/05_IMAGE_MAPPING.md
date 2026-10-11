# 05 Bildzuordnung

## Regeln
- Hero und Stationskarte folgen der **Station**: gleicher Ortsschlüssel, sonst der nächste Ort, dessen Radius die Station abdeckt (Koordinaten). Kein Bildpfad ist in Seiten kodiert.
- Mit belegtem Ort vor Regionsmotiv; Regionsmotive tragen sichtbar das Wort „Regionsmotiv“ (Hero-Nachweis, Kartenecke, Bildnachweis).
- Dashboard-Hero: aktuelle oder nächste Station; hat sie kein Foto (z. B. der Abflug in Frankfurt), übernimmt die nächste Station mit Foto.
- Galerie der Station: bis zu drei weitere Fotos des Ortes mit eigenem Nachweis.
- Unterkunft: nur ein beschriftetes Regionsmotiv, nie ein Foto der Lodge.

## Ergebnis der Initialbefüllung (lokale Kopie der Reiseplanung, 11.10.2026)
Quelle der Stationen: die aus der Excel `Namibia.xlsx` importierte Reiseplanung (14 Stationen, davon 13 in Namibia/Botswana; Abflug Frankfurt bewusst ohne Foto). Bericht: `import-report-2026-10-11.json`.

| Ort | Hero | Stationskarte | Galerie | Quelle | Lizenz | Status |
|---|---|---|---|---|---|---|
| Windhoek | Tintenpalast, Windhoek, Namibia, 2018-08-04, DD 04.jpg (Regionsmotiv) | Windhoek Landscape.jpg (Ort belegt) | 3 (1 mit Ortsbeleg) | Wikimedia Commons | CC BY-SA 4.0 | vollständig |
| Sossusvlei | Duna en Sossusvlei, Namibia, 2018-08-06, DD 002.jpg (Ort belegt) | Dead Vlei, Sossusvlei, Namibia, 2018-08-06, DD 086.jpg (Ort belegt) | 3 (3 mit Ortsbeleg) | Wikimedia Commons | CC BY-SA 3.0, CC BY-SA 4.0 | vollständig |
| Swakopmund | Dorob National Park near Swakopmund.jpg (Ort belegt) | Swakopmund Dune.jpg (Ort belegt) | 3 (3 mit Ortsbeleg) | Wikimedia Commons | CC BY-SA 3.0, CC BY-SA 4.0 | vollständig |
| Erongo | – (–) | Central-Namib, Erongo-Mountains.JPG (Regionsmotiv) | 1 (0 mit Ortsbeleg) | Wikimedia Commons | CC BY-SA 2.5, CC BY-SA 3.0 | teilweise: hero, gallery |
| Etosha | 079 Herd of African bush elephants drinking in Etosha N… (Ort belegt) | 096 Juvenile Springbok jumping in Etosha National Park … (Ort belegt) | 3 (3 mit Ortsbeleg) | Wikimedia Commons | CC BY-SA 4.0 | vollständig |
| Rundu | Rundu, Namibia, Okavango-River, Angola (2018).jpg (Ort belegt) | Rundu aerial view (03).jpg (Ort belegt) | 3 (3 mit Ortsbeleg) | Wikimedia Commons | CC BY-SA 4.0 | vollständig |
| Divundu | Aerial view of Popa Falls.jpg (Ort belegt) | Popa Falls 2022 (02).jpg (Ort belegt) | 3 (3 mit Ortsbeleg) | Wikimedia Commons | CC BY-SA 4.0 | vollständig |
| Chobe | Giraffes in Chobe National Park 04.jpg (Ort belegt) | Lion (Panthera leo) old male Chobe.jpg (Ort belegt) | 3 (3 mit Ortsbeleg) | Wikimedia Commons | CC BY-SA 2.0, CC BY-SA 4.0 | vollständig |
| Kasane | Kasane aerial view (2019).jpg (Ort belegt) | Chobe River Safari, Kasane (20260520-P1076204).jpg (Ort belegt) | 3 (3 mit Ortsbeleg) | Wikimedia Commons | CC BY 3.0, CC BY-SA 4.0 | vollständig |
| Nata | Chestnutbandedplover.jpg (Ort belegt) | Nata, Botswana - panoramio.jpg (Ort belegt) | 3 (2 mit Ortsbeleg) | Wikimedia Commons | CC BY 3.0, CC BY-SA 2.0, CC BY-SA 3.0 | vollständig |
| Maun | Surroundings of Maun to the Delta - Botswana - panorami (Ort belegt) | Cessna 182 Maun Botswana 28.jpg (Ort belegt) | 3 (3 mit Ortsbeleg) | Wikimedia Commons | CC BY 3.0, CC BY-SA 3.0 | vollständig |

52 Bilder insgesamt, davon 46 mit Ortsbeleg durch Dateikoordinaten und 6 als Regionsmotiv.

## Stationen der Reiseplanung
| Station | Ort in der Bibliothek | UI |
|---|---|---|
| Anreise Frankfurt – Windhoek | keiner (außerhalb der Reiseregion) | Illustration; Dashboard-Hero nimmt das Foto der nächsten Station |
| Windhoek | windhoek | Karte, Station, Dashboard-Hero |
| Namib Wüste / Sossusvlei | sossusvlei | Karte, Station mit Galerie |
| Swakopmund Ocean | swakopmund | Karte, Station mit Galerie |
| Erongo Gebirge, Erongo (Sasa Safari Camp) | erongo | Karte (Regionsmotiv); Hero fehlt, Station zeigt die Illustration |
| Etosha Süd, Etosha Ost | etosha | Karte, Station mit Galerie |
| Rundu, Divundu | rundu, divundu | Karte, Station mit Galerie |
| Chobe, Kasane | chobe, kasane | Karte, Station mit Galerie |
| Nata, Maun | nata, maun | Karte, Station mit Galerie |

Unterkünfte (13) zeigen das Regionsmotiv ihrer Station.

**Bewusst nicht gezeigt:** Für Erongo gab es keinen Hero über dem Mindestwert (die gefundenen Treffer waren Mineralien-Nahaufnahmen und Fotos außerhalb des Radius). Lieber die Illustration als ein falsches oder schlechtes Bild.
