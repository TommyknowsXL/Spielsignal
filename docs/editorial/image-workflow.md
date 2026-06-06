# Redaktionsworkflow für Bilder

1. Neue RSS-Meldung oder Steam-Meldung erfassen.
2. Passenden Spielnamen ermitteln.
3. Agent sucht Bildkandidaten.
4. Bevorzugt offizielle Quellen verwenden.
5. Quelle und Nutzungsgrundlage dokumentieren.
6. Kandidat erhält zunächst `pending-review`.
7. Nur nach Freigabe auf `approved` setzen.
8. Bis dahin lokales SpielSignal-Fallback anzeigen.

Kandidaten werden in `src/data/editorialImageQueue.ts` dokumentiert. Freigegebene News-Bilder
werden anschließend manuell nach `src/config/approvedNewsImages.ts`, freigegebene Steam-Bilder
nach `src/config/approvedSteamImages.ts` übertragen.

Der öffentliche Resolver in `src/config/newsImageRules.ts` akzeptiert nur `approved` und
`fallback`. Er fragt weder RSS-Bilder noch Open-Graph-Bilder oder SteamDB ab.

Für Steam-Kandidaten gilt zusätzlich:

1. App-ID und Store-Link im Tagesbericht öffnen.
2. Prüfen, ob Spiel und Bildkandidat eindeutig zusammengehören.
3. Nutzungsgrundlage dokumentieren.
4. App-ID erst danach in `src/config/approvedSteamImages.ts` eintragen.
5. Bis zum Eintrag bleibt das lokale Kategorie-Fallback öffentlich sichtbar.
