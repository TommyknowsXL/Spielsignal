# SpielSignal Agenten-System

Die Agenten-Infrastruktur bereitet ausschließlich redaktionelle Vorschläge vor. Sie schreibt
keine Artikel in Content Collections, veröffentlicht nichts, erstellt keinen automatischen
Pull Request und führt keinen Merge oder Push auf `main` aus.

## Rollen

### Steam-Scout

- akzeptiert nur überprüfbare Datensätze aus zulässigen Quellen
- dokumentiert App-ID, Titel, Genre, Datum, Store-Link und Quelle
- akzeptiert ausschließlich offizielle Steam-Store-Links
- markiert unsichere Daten als `needs-review`
- bestätigt Gratis-Aktionen niemals ohne belegte Quelle
- fragt SteamDB nicht ab

Aktuell ist keine automatische Steam-Datenquelle freigegeben. Der sichere Basislauf erzeugt
daher keine Steam-Kandidaten.

### News-Scout

- ruft nur aktivierte Quellen aus `src/config/newsSources.ts` ab
- verarbeitet Titel, Datum, Kategorie, Quelle und Original-URL
- übernimmt keine Volltexte, RSS-Bilder oder Open-Graph-Bilder
- filtert offensichtlich themenfremde Meldungen
- kennzeichnet externe Meldungen immer als externe Vorschläge

### Bild-Scout

- verwendet zunächst den Resolver aus `src/config/newsImageRules.ts`
- nutzt ein freigegebenes Bild nur bei Status `approved`
- verwendet sonst ein lokales SpielSignal-Fallback
- erzeugt Bildkandidaten ausschließlich als `pending-review`
- genehmigt niemals selbst Bilder

### Redaktions-Agent

- führt Kandidaten zusammen und dedupliziert URL und Titel
- sortiert anhand der zentralen Score-Regeln
- begrenzt den Tagesbericht auf zehn Vorschläge
- empfiehlt ausschließlich sichere Artikeltypen
- verwendet `test-candidate` nur als Prüfhilfe, niemals als fertigen Test
- setzt Vorschläge höchstens auf `needs-review`

## Score-Logik

Die Werte stehen zentral in `scripts/agents/agentConfig.ts`. Positive Signale sind zum Beispiel:

- neue überprüfbare Steam-Veröffentlichung
- erkennbarer PC-Gaming-Bezug
- überprüfbarer Steam-Trend
- mögliche beziehungsweise bestätigte Gratis-Aktion
- großes Update
- hoher praktischer Nutzwert
- bereits freigegebenes Bild
- Aktualität

Abzüge entstehen unter anderem bei fehlendem Gaming-Bezug, themenfremden Titeln, Duplikaten
oder ungeprüften Quellen. Der Score ist ausschließlich eine Sortierhilfe und keine
Qualitätswertung eines Spiels. Es werden keine Reichweitenzahlen erfunden.

## Ausgabe

`npm run editorial:daily` erzeugt:

- `src/data/editorial/latest-queue.json`
- `src/data/editorial/archive/YYYY-MM-DD.json`
- `docs/editorial/daily-reports/YYYY-MM-DD.md`

GitHub Actions lädt diese Dateien als Workflow-Artefakt hoch. Der Workflow schreibt sie nicht
zurück ins Repository.

## Optionale KI-Schnittstelle

`scripts/agents/providers/editorialAiProvider.ts` ist standardmäßig deaktiviert und sendet
keine API-Anfrage. Eine spätere API-Nutzung verursacht separate Kosten. Schlüssel dürfen nur
als GitHub Actions Secret oder serverseitige Umgebungsvariable hinterlegt werden.

Vor jeder Aktivierung sind Kosten, Datenschutz, Prompt-Grenzen und redaktionelle Kontrolle
manuell zu prüfen. Die Schnittstelle darf nur strukturierte Entwurfsvorschläge liefern und
niemals veröffentlichen, Bilder freigeben oder Tests beziehungsweise Bewertungen erfinden.

## Qualitätsregeln für die Tagesqueue

- Spielnamen werden nur aus plausiblen Bestandteilen vor `:` oder `-` extrahiert.
- Bei Unsicherheit bleibt der Spielname leer; es wird nichts ergänzt oder geraten.
- Gratis-Bezüge werden als `free-to-play`, `free-to-keep`, `play-for-free`, `demo`,
  `free-weekend` oder `unknown-free-reference` erfasst.
- Eine ungeprüfte Gratis-Referenz bleibt `needs-review` und höchstens
  `free-promotion-candidate`.
- Eine bestätigte Gratis-Aktion benötigt eine geprüfte offizielle Quelle.
- Pro RSS-Quelle erscheinen höchstens sechs Einträge in der Top-10.
- Bei vorhandenen offiziellen Steam-Daten werden bis zu zwei Steam-Plätze reserviert.
- Ohne freigegebene Steam-Konfiguration nennt der Bericht den fehlenden Datenstand sichtbar.
- Lokale Fallback-Bilder werden nach Thema gewählt.
- Offizielle Steam-Bildkandidaten bleiben bis zur manuellen Prüfung `pending-review`.

Der Bericht enthält eine Zusammenfassung nach Quellenart, Gratis-Status und Bildstatus sowie
pro Kandidat Spielname, App-ID, Steam-Link, Score, Fallback, Bildkandidat und offene Prüfungen.

## Offizielle Steam-Provider

- `IStoreService/GetAppList/v1/`: offizieller App-Katalog für eindeutige App-ID-Zuordnung
- `ISteamChartsService/GetMostPlayedGames/v1/`: experimenteller Trend-Provider hinter
  `STEAM_TRENDS_ENABLED`
- `store.steampowered.com/app/{appid}/`: offizielle Store-Quellseite
- `shared.fastly.steamstatic.com`: offizieller Steam-Asset-Kandidat, nie automatisch freigegeben

`steamapi.xpaw.me` dient ausschließlich als technische Dokumentationsreferenz für den
experimentellen Charts-Endpunkt. Der Agent sendet keine Datenanfragen an diese Domain.

Der App-Katalog wird 24 Stunden, Trends mindestens 60 Minuten und Release-Ergebnisse
mindestens sechs Stunden gecacht. Da die dokumentierte Steam Web API keinen stabilen
öffentlichen Release-Feed bereitstellt, meldet der Release-Provider diesen Zustand offen,
statt Daten aus Store-HTML zu erraten.
