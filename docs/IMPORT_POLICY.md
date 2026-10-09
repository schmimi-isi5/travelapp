# Datenimport und Wahrheitsstatus

Reiseplanung aus Nutzerdateien (insbesondere `Namibia.pdf`, falls im Ziel-Repository vorhanden) mittels geführtem Import/CSV; keine Annahme, dass Dokument in diesem ZIP enthalten ist. Original-Preisangebote zu Mietwagen sind nicht automatisch finale Buchung. Sämtliche Hotelpreise, Zahlungseingänge und offene Posten erst nach Verifizierung der Belege als `confirmed`/`verified` führen.

Import-Felder: EntityType, Station, Anbieter, Datum von/bis, BetragMinor, Währung, Status, SourcePath, Page, VerifiedAt, Notes, ImportedBy. Zuerst `draft` mit Prüfhinweis, danach bewusste Freigabe. Dokumente dürfen nie zum KI-Dienst übertragen werden ohne Einwilligung. Bei Konflikten Belege zum Vergleich darstellen. Weder Screenshots der Entwürfe noch ihre beispielhaften Hotels und Beträge als Fakten übernehmen.
