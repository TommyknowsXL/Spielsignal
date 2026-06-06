# RSS-Quellen aufnehmen

Neue Quellen bleiben deaktiviert, bis Feed, Nutzungsbedingungen und Bildstrategie
redaktionell geprüft wurden. Scraping ersetzt keinen fehlenden oder ungeklärten RSS-Feed.

| Quelle | Offizielle Feed-URL | Nutzungsbedingungen geprüft | Aggregator-Nutzung | Gaming-Bezug | Bildstrategie | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PC Games | Noch zu verifizieren | Nein | Unklar | PC-Gaming | Eindeutige Steam-App-ID, sonst lokales Fallback | Kandidat, deaktiviert |
| PC Games Hardware | Noch zu verifizieren | Nein | Unklar | PC-Hardware und Gaming | Nur freigegebene Herstellerbilder oder lokales Fallback | Kandidat, deaktiviert |
| MeinMMO | Noch zu verifizieren | Nein | Unklar | Online- und Service-Spiele | Eindeutige Steam-App-ID, sonst lokales Fallback | Kandidat, deaktiviert |
| GamePro | Noch zu verifizieren | Nein | Unklar | Überwiegend Konsolen-Gaming | Nur Meldungen mit klarem PC-Bezug; Bild separat prüfen | Kandidat, deaktiviert |
| XboxDynasty | Noch zu verifizieren | Nein | Unklar | Xbox und Microsoft Gaming | Nur Meldungen mit klarem PC-Bezug; Bild separat prüfen | Kandidat, deaktiviert |

## Freigabe-Checkliste

1. Offizielle Feed-URL direkt auf der Seite des Anbieters bestätigen.
2. Nutzungsbedingungen und Hinweise zur Aggregator-Nutzung dokumentieren.
3. Zulässigen Umfang festhalten: ausschließlich Titel, Datum, Quelle und Original-Link.
4. Gaming- und PC-Bezug mit Testdaten prüfen.
5. Bildstrategie festlegen. Magazinbilder werden nicht übernommen.
6. Quelle in `src/config/newsSources.ts` eintragen und zunächst deaktiviert lassen.
7. Erst nach dokumentierter Freigabe `enabled: true` setzen.
