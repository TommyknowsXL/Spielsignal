# SpielSignal

SpielSignal ist eine überwiegend statische, deutschsprachige Gaming-Magazin-Webseite auf Basis von Astro und TypeScript. Der News-Aggregator wird gezielt serverseitig ausgeführt.

**Unterzeile:** PC-Gaming-News, Tests und Deals auf einen Blick

Die aktuelle Version nutzt ausschließlich klar gekennzeichnete Demo-Inhalte. Sie übernimmt keine fremden Artikel oder Bilder, sendet keine Formulardaten und lädt standardmäßig keine Werbe- oder Tracking-Skripte.

## Technik

- Astro 6 mit statischer Ausgabe und zwei On-Demand-Routen
- Vercel-Adapter für `/news/` und `/api/news.json`
- TypeScript im strikten Modus
- Astro Content Collections
- Responsives CSS ohne UI-Framework
- Sehr wenig Browser-JavaScript
- Sitemap, RSS, robots.txt, Canonical URLs und JSON-LD
- Für Vercel vorbereitet; keine besondere Adapter-Konfiguration nötig

## Lokal starten

Voraussetzung ist eine aktuelle Node.js-LTS-Version.

```bash
npm install
npm run dev
```

Anschließend die von Astro angezeigte Adresse öffnen, normalerweise:

```text
http://localhost:4321
```

Unter Windows kann bei einer restriktiven PowerShell-Richtlinie `npm.cmd` statt `npm` verwendet werden.

## Produktions-Build

```bash
npm run build
```

Der Befehl führt zuerst `astro check` aus und erzeugt danach die statische Webseite im Ordner `dist/`.

Für eine lokale Vorschau des Builds:

```bash
npm run preview
```

## Inhalte pflegen

Eigene Inhalte liegen in:

```text
src/content/tests/
src/content/recommendations/
src/content/news/
src/content/deals/
src/content/releases/
src/content/steam-suggestions/
```

Die Schemas sind in `src/content.config.ts` definiert. Ein Beitrag wird automatisch unter `/artikel/<dateiname>/` erzeugt. Vor Veröffentlichung eines echten Beitrags:

1. `demo: false` setzen.
2. Titel, Beschreibung, Datum, Autor und SEO-Angaben prüfen.
3. Testbedingungen, Quellen und mögliche geschäftliche Beziehungen ergänzen.
4. Keine fremden Volltexte oder Bilder ohne eindeutige Erlaubnis übernehmen.

`steam-suggestions` sind reine redaktionelle Entwürfe und werden nicht automatisch als
Artikelseiten veröffentlicht.

## Steam-Vorschläge pflegen

Das Grundgerüst des späteren täglichen Steam-Release-Agenten liegt in:

```text
src/config/steamAgent.ts
src/content/steam-suggestions/
scripts/prepare-steam-suggestions.ts
```

Der Agent ist absichtlich mit `enabled: false` deaktiviert. Der sichere Vorbereitungsbefehl:

```bash
npm run steam:prepare
```

Ein Vorschlag enthält Spielname, Genre, Release-Datum, Preis, Entwickler, Publisher,
Steam-Link, Kurzbeschreibung, Kategorie, offizielle Bild-URL, Artikeltyp und Status.

Erlaubte Statuswerte:

```text
Entwurf
geprüft
veröffentlicht
```

Ein Eintrag mit `articleType: "Test"` wird vom Content-Schema abgelehnt, wenn weder
`played: true` noch belastbare `gameplayNotes` vorhanden sind.

Für den nächsten produktiven Schritt werden eine ausdrücklich erlaubte Datenquelle,
geklärte Bildrechte, persistenter Speicher und ein täglicher Scheduler benötigt. Ein
Vercel-Cron kann später eine geschützte Serverroute aufrufen; derzeit wird kein automatischer
Abruf aktiviert.

## Geprüfte RSS-Feeds ergänzen

Die zentrale Quellenkonfiguration liegt in:

```text
src/config/newsSources.ts
```

**Genau dort werden später die erlaubten Feed-Adressen im Feld `feedUrl` eingetragen.**
Die enthaltenen Einträge sind inaktive Beispiele und besitzen bewusst keine erfundenen Feed-Adressen.

Vorgehen:

1. Nutzungsbedingungen und technische Dokumentation der Quelle prüfen.
2. Bevorzugt offizielle RSS-Feeds oder ausdrücklich erlaubte APIs verwenden.
3. Beim gewünschten Eintrag eine echte `feedUrl` eintragen.
4. `usageNotes` um Prüfdatum, Freigabegrundlage und erlaubten Umfang ergänzen.
5. Erst danach `enabled: true` setzen.
6. Zum Deaktivieren jederzeit wieder `enabled: false` setzen. Die Adresse kann zur Dokumentation stehen bleiben.
7. Kategorien über `categoryMapping` auf SpielSignal-Kategorien abbilden.
8. Nur Titel, URL, Datum, Quellenname und Kategorie verarbeiten.
9. Keine fremden Bilder, Beschreibungen oder vollständigen Texte automatisiert kopieren.

Beispiel für einen später freigegebenen Eintrag:

```ts
{
  name: "Name der geprüften Quelle",
  homepageUrl: "https://quelle.example/",
  feedUrl: "https://quelle.example/ausdruecklich-erlaubter-feed.xml",
  enabled: true,
  usageNotes: "Am TT.MM.JJJJ geprüft: Titel, URL, Datum und Kategorie erlaubt.",
  categoryMapping: {
    patch: "Updates",
    roleplaying: "Rollenspiele",
    news: "News"
  }
}
```

### Funktionsweise des Aggregators

`src/lib/newsFeed.ts`:

- lädt ausschließlich Quellen mit `enabled: true`
- unterstützt RSS 2.0, Atom und einfache RDF-RSS-Feeds
- bricht einzelne Abrufe nach acht Sekunden ab
- akzeptiert höchstens 2 MB pro Feed und 40 Einträge pro Quelle
- übernimmt keine Feed-Beschreibungen, Volltexte oder Bilder
- entfernt doppelte und Tracking-bereinigte URLs
- entfernt exakt gleiche normalisierte Titel
- markiert sehr ähnliche Überschriften
- sortiert alle Meldungen nach Datum
- fängt Fehler pro Quelle ab, ohne andere Quellen zu blockieren
- verwendet bei einem Fehler nach Möglichkeit den letzten erfolgreichen Stand

Die serverseitige API liegt unter `/api/news.json`. Die sichtbare Seite `/news/` verwendet dieselbe Logik. Sind keine verwertbaren Feed-Meldungen verfügbar, werden die Demo-News aus `src/data/demoNews.ts` angezeigt.

### Cache

- Erfolgreiche Ergebnisse werden im laufenden Serverprozess 60 Minuten pro Quelle wiederverwendet.
- `/news/` und `/api/news.json` senden `s-maxage=3600`.
- Vercel liefert dadurch eine Stunde lang eine schnelle CDN-Antwort.
- Danach kann Vercel mit `stale-while-revalidate=86400` den vorhandenen Stand ausliefern, während im Hintergrund aktualisiert wird.
- Bei einem Feed-Fehler verwendet die Feed-Schicht vorhandene letzte Erfolgsdaten. Bei einem kalten Server ohne Erfolgsdaten greift der Demo-Fallback.

### Lokal testen

```bash
npm run test:feeds
npm run dev
```

Der automatische Test startet kurzzeitig einen lokalen Feed auf `127.0.0.1`. Er prüft RSS,
Atom, Abruf, Cache und den letzten erfolgreichen Stand bei einem simulierten Ausfall. Es wird
keine externe Quelle abgerufen.

Danach öffnen:

```text
http://localhost:4321/news/
http://localhost:4321/api/news.json
```

Ohne aktivierte Quelle muss `mode: "demo"` erscheinen. Nach Freigabe und Aktivierung einer funktionierenden Quelle erscheint `mode: "feeds"`.

### Fehler eines Feeds erkennen

In `/api/news.json` enthält `statuses` für jede aktivierte Quelle:

- `ok: true`, wenn der Feed erfolgreich verarbeitet wurde
- `fromCache: true`, wenn ein zwischengespeicherter Stand verwendet wurde
- `lastSuccessfulAt` mit dem letzten erfolgreichen Zeitpunkt
- `error` mit einer knappen technischen Fehlerbeschreibung

Auf `/news/` erscheint bei einem Fehler zusätzlich ein aufklappbarer Hinweis. In Vercel können dieselben Fehler in den Function-Logs nachvollzogen werden.

Der öffentliche Feed `/rss.xml` enthält ausschließlich eigene SpielSignal-Inhalte.

## Werbung und AdSense

Die Seite zeigt standardmäßig nur klar beschriftete Werbeplatzhalter. Das AdSense-Skript wird ausschließlich geladen, wenn alle drei Bedingungen erfüllt sind:

```env
PUBLIC_ADS_ENABLED=true
PUBLIC_ADSENSE_CLIENT=ca-pub-...
PUBLIC_CONSENT_MODE_READY=true
```

Ohne vollständige Konfiguration bleibt das Skript deaktiviert.

Einrichtung:

1. AdSense-Konto einrichten.
2. `spielsignal.de` als Webseite hinzufügen.
3. Freigabe durch Google abwarten.
4. Eine zertifizierte Consent-Management-Lösung einrichten und rechtlich konfigurieren.
5. Die echte Publisher-ID als `PUBLIC_ADSENSE_CLIENT` eintragen.
6. `public/ads.txt.example` mit der echten, von AdSense bereitgestellten Zeile als `public/ads.txt` speichern.
7. Die drei Umgebungsvariablen in Vercel setzen.
8. Neu deployen und Einwilligungsverhalten prüfen.

Keine Publisher-ID raten oder aus Beispielen übernehmen. `PUBLIC_CONSENT_MODE_READY` erst aktivieren, wenn die Consent-Lösung tatsächlich eingerichtet und getestet ist.

Die wiederverwendbare Werbekomponente liegt in `src/components/AdSlot.astro`. Der Affiliate-Hinweis liegt in `src/components/AffiliateNotice.astro`.

## Rechtliche Pflichtaufgaben

Vor jeder öffentlichen Veröffentlichung:

- Platzhalter im Impressum durch echte Angaben ersetzen.
- Verantwortliche Stelle in der Datenschutzerklärung ergänzen.
- Datenschutzerklärung auf Hosting, Kontaktwege, Werbung und weitere Dienste anpassen.
- Keine Analyse-, Werbe- oder externen Tracking-Skripte ohne passende Einwilligung aktivieren.
- Bei Unsicherheit eine rechtliche Prüfung einholen.

Zwingende Platzhalter:

```text
[NAME EINTRAGEN]
[ANSCHRIFT EINTRAGEN]
[E-MAIL EINTRAGEN]
[TELEFON OPTIONAL EINTRAGEN]
```

Das Kontakt- und Newsletter-Formular ist nur eine nicht sendende Frontend-Demo.

## GitHub

1. Das Repository `TommyknowsXL/Spielsignal` verwenden.
2. Falls nötig, in diesem Projekt Git initialisieren: `git init`.
3. Dateien hinzufügen: `git add .`.
4. Commit erstellen: `git commit -m "Initiale SpielSignal-Version"`.
5. Das GitHub-Repository als Remote verbinden.
6. Auf den Hauptbranch pushen.

Keine `.env`-Datei oder Zugangsdaten committen. `.env.example` enthält nur sichere Platzhalter.

## Heute mit Vercel veröffentlichen

1. Bei Vercel anmelden und das GitHub-Repository importieren.
2. Vercel erkennt Astro automatisch.
3. Vercel erkennt den installierten `@astrojs/vercel`-Adapter und die beiden Serverless-Routen automatisch.
4. Build-Befehl `npm run build` prüfen. Die statischen Dateien und Serverless Functions werden vom Adapter passend ausgegeben.
5. Zunächst ohne aktive Werbung deployen.
6. Die erzeugte Vercel-URL sowie `/news/` und `/api/news.json` testen.
7. In den Projekteinstellungen `spielsignal.de` als Domain hinzufügen.
8. Die von Vercel angezeigten DNS-Einträge beim Domainanbieter exakt hinterlegen.
9. `www.spielsignal.de` hinzufügen und auf die bevorzugte Domain weiterleiten.
10. Nach der DNS-Aktualisierung HTTPS, Weiterleitung und Canonical URLs prüfen.

## Checkliste vor dem Start

- [ ] Impressumsdaten vollständig eingetragen
- [ ] Datenschutzerklärung geprüft und angepasst
- [ ] Demo-Inhalte ersetzt oder weiterhin klar als Demo sichtbar
- [ ] Mobile Ansicht getestet
- [ ] Menü und interne Links getestet
- [ ] Werbeflächen als „WERBUNG“ gekennzeichnet
- [ ] Keine AdSense-Skripte vor Consent-Einrichtung aktiv
- [ ] Keine fremden Artikel oder Bilder kopiert
- [ ] `/sitemap-index.xml` erreichbar
- [ ] `/robots.txt` erreichbar
- [ ] `/rss.xml` erreichbar
- [ ] Produktions-Build erfolgreich

## Sinnvolle Version 2

- Persistenten, regionsübergreifenden Feed-Cache mit Überwachung ergänzen
- Titelähnlichkeit zusätzlich per Levenshtein- oder semantischem Vergleich verfeinern
- Lokale Volltextsuche aus einem beim Build erzeugten Index
- Echtes Newsletter-Backend mit Double-Opt-in
- Bildpipeline für eigene oder sauber lizenzierte Titelbilder
- Redaktionsworkflow mit Entwürfen, Vorschau und Veröffentlichungsstatus
- Automatisierte Link-, Accessibility- und Lighthouse-Prüfungen
