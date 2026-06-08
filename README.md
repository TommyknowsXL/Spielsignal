# SpielSignal

SpielSignal ist eine deutschsprachige Astro-Seite für PC-Gaming-News, eigene redaktionelle
Artikel und offizielle Steam-Trends.

**Positionierung:** Aktuelle PC-Gaming-News, neue Steam-Releases und neue
PC-Game-Pass-Spiele auf einen Blick.

## Lokal starten

```bash
npm install
npm run dev
```

Produktionsprüfung:

```bash
npm run test
npm run build
```

Unter Windows kann bei einer restriktiven PowerShell-Richtlinie `npm.cmd` verwendet werden.

## Öffentliche Inhalte

Die sichtbare Seite ist als redaktionelles PC-Gaming-Magazin aufgebaut. Eigene
SpielSignal-Artikel stehen auf Start- und News-Seite im Mittelpunkt. RSS-Meldungen erscheinen
nur ergänzend als kompakte, klar gekennzeichnete externe Kurzmeldungen.

Es gibt zwei getrennte Inhaltsarten:

1. **Externe Kurzmeldungen:** Titel, Quelle, Datum, Bildfläche und direkter Link zur
   Originalmeldung. Es werden keine Volltexte oder Magazinbilder übernommen.
2. **Eigene SpielSignal-Artikel:** eigenständig strukturierte Beiträge mit Quellen,
   SEO-Daten, Bildnachweis und redaktioneller Einordnung.

Öffentlich erscheinen ausschließlich Dateien aus:

```text
src/content/articles/
```

Dateien aus diesem Verzeichnis benötigen `status: published`. Entwürfe liegen getrennt in:

```text
src/content/drafts/
```

Drafts werden von keiner öffentlichen Route geladen.

Das Schema steht in `src/content/config.ts` und wird über `src/content.config.ts` eingebunden.
Ein Artikel vom Typ `test` benötigt eine dokumentierte `playedMinutes`-Angabe größer als null.

## RSS-Quellen

Aktiv ist derzeit ausschließlich:

```text
GameStar Gaming-News
https://www.gamestar.de/rss/gaming.rss
```

Vorbereitet, aber deaktiviert:

```text
GameStar News
GameStar Hardware
GameStar Deals
GamePro
PC Games
PC Games Hardware
MeinMMO
XboxDynasty
```

Die zentrale Konfiguration liegt in `src/config/newsSources.ts`. Neue Quellen dürfen erst nach
Prüfung der offiziellen Feed-URL, Nutzungsbedingungen, Aggregator-Nutzung und Bildstrategie
aktiviert werden. Scraping ersetzt keinen RSS-Feed.

Der Aggregator verarbeitet ausschließlich Titel, Datum, Quelle, Kategorie und Original-URL.
Er filtert themenfremde Einträge, entfernt Duplikate und übernimmt weder Volltexte noch
Feed-Bilder. Eindeutige Steam-App-IDs können mit einem offiziellen Steam-Store-Bild verknüpft
werden; bei Unsicherheit wird ein lokales SpielSignal-Fallback verwendet.

## Tägliche Themenliste öffnen

```text
GitHub
→ Actions
→ Daily Editorial Queue
→ letzten Lauf öffnen
→ Summary ansehen
```

Der Workflow:

1. ruft freigegebene RSS-Feeds ab
2. entfernt irrelevante Inhalte und Duplikate
3. erkennt Spielnamen
4. ordnet eindeutige Steam-App-IDs und Bildkandidaten zu
5. priorisiert maximal zehn Vorschläge
6. erzeugt Markdown- und JSON-Berichte
7. schreibt die Tagesauswahl in `$GITHUB_STEP_SUMMARY`
8. lädt die Berichte als Artefakt hoch
9. führt Tests und Produktions-Build aus

Redaktioneller Zielablauf:

```text
RSS-Meldung entdeckt Thema
→ Agent sucht offizielle Primärquelle
→ Agent schreibt eigenständigen SpielSignal-Entwurf
→ internes Quellenprotokoll
→ offizielles Bild oder Fallback
→ technischer Check
→ Pull Request
→ manuelle Freigabe
→ Veröffentlichung
```

Er veröffentlicht keine Artikel, genehmigt keine Bilder und führt keinen Merge aus.

Die GitHub Actions verwenden Node-24-kompatible Hauptversionen. Diese benötigen mindestens
GitHub Actions Runner `2.327.1`; GitHub-gehostete Runner werden automatisch aktuell gehalten.
Für selbst gehostete Runner muss die Runner-Version vor der Nutzung aktualisiert werden. Es
werden keine unsicheren Kompatibilitäts- oder Downgrade-Optionen gesetzt.

Lokaler Lauf:

```bash
npm run editorial:daily
```

Ausgaben:

```text
src/data/editorial/latest-queue.json
src/data/editorial/archive/YYYY-MM-DD.json
docs/editorial/daily-reports/YYYY-MM-DD.md
```

## Entwurf erstellen

```text
GitHub
→ Actions
→ Create Editorial Draft
→ Run workflow
→ Candidate ID eintragen
→ Artikeltyp wählen
→ offizielle Quellen ergänzen
→ Workflow starten
```

Der Workflow lädt den Kandidaten aus `latest-queue.json`, behandelt eine RSS-Meldung nur als
Tippquelle und schreibt einen Entwurf nach `src/content/drafts/`.

Ohne geeignete offizielle Primärquelle entsteht nur ein Gerüst mit:

```text
status: needs-source-review
Offizielle Primärquelle fehlt. Vor Veröffentlichung ergänzen.
```

Mit Primärquelle entsteht `status: draft`. Anschließend werden Tests und Build ausgeführt,
ein Branch `editorial-draft/[slug]` gepusht und ein Pull Request erstellt. Es gibt keinen
automatischen Merge und kein automatisches Deployment.

## Entwurf prüfen

```text
GitHub
→ Pull requests
→ Editorial Draft öffnen
→ Dateien prüfen
→ Quellen prüfen
→ Bild prüfen
→ Text prüfen
```

Vor der Veröffentlichung muss der Beitrag aus `src/content/drafts/` redaktionell überarbeitet,
auf `status: published` gesetzt und nach `src/content/articles/` verschoben werden.

## Artikel veröffentlichen

```text
Pull Request
→ Merge pull request
→ Confirm merge
```

Der Merge erfolgt ausschließlich manuell. Nach dem Merge nach `main` veröffentlicht Vercel
automatisch die neue Version.

GitHub Actions benötigt gegebenenfalls Repository-Schreibrechte für Pull Requests. Der
Workflow verwendet nur:

```yaml
permissions:
  contents: write
  pull-requests: write
```

## Editorial Batch erstellen

Der Workflow `Create Editorial Batch` erzeugt aus drei bis fünf ausgewählten Candidate IDs
mehrere geprüfte Entwürfe in einem Lauf:

```text
GitHub
→ Actions
→ Create Editorial Batch
→ Run workflow
```

Eingaben:

- `candidate_ids`: IDs aus der Daily Editorial Queue, durch Komma getrennt
- `article_type_default`: `news-overview`, `release-check`, `free-promotion` oder `guide`
- `primary_source_urls`: offizielle Quellen; Kandidatengruppen mit Semikolon trennen
- `editorial_note`: optionale gemeinsame Redaktionsnotiz
- `max_articles`: maximal fünf

Der Workflow erzeugt vor der Batch-Auswahl selbst eine frische Tagesqueue mit
`npm run editorial:daily`. Die Candidate IDs in der Actions Summary und die anschließende
Draft-Erzeugung stammen dadurch aus derselben `src/data/editorial/latest-queue.json`.

Der Workflow verwendet den eindeutigen Branch `editorial-batch/${{ github.run_id }}`, prüft
vorher, ob dieser Remote-Branch bereits existiert, verwendet keinen Force-Push und führt keinen
Merge aus. Queue, Tagesberichte, Batch-Reports und Entwürfe werden auch bei Fehlern als Artifact
`spielsignal-editorial-batch-diagnostics` bereitgestellt.

Als spätere Ausbaustufe könnte der Batch-Workflow alternativ das
`Artifact eines ausgewählten Daily-Queue-Laufs laden`. Bevorzugt bleibt vorerst:
`Batch-Workflow erzeugt selbst eine frische Queue`, weil diese Lösung einfacher, robuster und
konsistent ist.

Jeder Kandidat durchläuft Fakten-, Leserinteresse-, Qualitäts-, Originalitäts-, SEO-, Bild-
und Technikprüfung. Unter 60 Leserinteresse-Punkten entsteht nur ein Ablehnungsbericht. Ohne
offizielle Primärquelle oder bei einem KI-Fehler wird höchstens ein
`needs-source-review`-Gerüst erzeugt, kein fertiger Artikel.

Die optionale KI nutzt die OpenAI Responses API mit strukturierter JSON-Schema-Ausgabe. Sie
ist standardmäßig deaktiviert und erhält nur vorab geprüfte Fakten:

```env
OPENAI_API_KEY=
AI_EDITORIAL_ENABLED=false
AI_EDITORIAL_MODEL=gpt-5-mini
AI_EDITORIAL_MAX_ARTICLES=5
```

API-Aufrufe werden separat nach dem gewählten OpenAI-Modell abgerechnet. Das Artikelmaximum
begrenzt die Zahl der Anfragen beziehungsweise Entwürfe, ist aber kein festes Kostenlimit.
Schlüssel werden weder geloggt noch in Reports oder Drafts geschrieben.

## Optionale KI aktivieren

```text
GitHub Repository
→ Settings
→ Secrets and variables
→ Actions
→ New repository secret
→ OPENAI_API_KEY
```

Repository-Variable:

```text
AI_EDITORIAL_ENABLED=true
```

Die KI-Schnittstelle ist standardmäßig deaktiviert und führt derzeit keine kostenpflichtige
Anfrage aus. Eine spätere Aktivierung darf ausschließlich geprüfte Fakten aus offiziellen
Primärquellen verwenden und niemals veröffentlichen.

API-Nutzung verursacht separate Kosten und ist nicht im ChatGPT-Abonnement enthalten.

## Optionale Secrets und Variablen

```text
STEAM_WEB_API_KEY
OPENAI_API_KEY
AI_EDITORIAL_ENABLED
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Schlüssel werden nur serverseitig beziehungsweise als GitHub Secrets verwendet. Sie dürfen
nicht in Logs, JSON, Markdown oder das Repository geschrieben werden.

## Redaktionelle Regeln

Die verbindlichen Regeln stehen in:

```text
LEGAL_SETUP.md
docs/editorial/editorial-policy.md
docs/editorial/rss-source-onboarding.md
docs/content-image-rights.md
```

Kurzfassung:

- keine Magazinartikel kopieren oder absatzweise umformulieren
- keine fremden Gliederungen oder Meinungen übernehmen
- RSS nur als Themenradar und externe Kurzmeldung verwenden
- eigene Artikel auf offizielle Primärquellen stützen
- keine Bewertungen, Spielzeiten, Deals oder Termine erfinden
- keine Magazinbilder, Google-Bilder oder SteamDB-Bilder übernehmen
- keine automatische Veröffentlichung

## Werbung und Datenschutz

Werbeplätze sind sichtbar mit `WERBUNG` gekennzeichnet und bleiben ohne gültige Konfiguration
dezente Platzhalter. Analyse, Werbung und externe Einbettungen sind standardmäßig deaktiviert.
Details stehen in `.env.example`, `src/config/privacy.ts`, `LEGAL_SETUP.md` und der
Datenschutzerklärung.
