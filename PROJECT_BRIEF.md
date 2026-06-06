# SpielSignal – Projektbrief

## Ziel

SpielSignal ist ein deutschsprachiges PC-Gaming-Magazin für `https://spielsignal.de`.
Die Seite bündelt kurze Meldungen, eigene Tests, Empfehlungen, Deals und
Release-Übersichten. Quellen, Demo-Inhalte, Werbung und Affiliate-Beziehungen werden
sichtbar gekennzeichnet.

## Zielgruppe

- deutschsprachige PC-Spieler
- Leser, die Meldungen schnell überblicken möchten
- Spieler, die nachvollziehbare Kauf- und Zeitentscheidungen suchen

## Redaktionelle Leitlinien

1. Keine fremden Volltexte oder langen Textpassagen übernehmen.
2. Keine fremden Bilder ohne dokumentierte Erlaubnis verwenden.
3. Externe Meldungen nennen Quelle, Zeitpunkt und Original-Link.
4. Tests beruhen auf tatsächlicher Spielerfahrung oder belastbaren Gameplay-Notizen.
5. Ersteindrücke bleiben als vorläufig gekennzeichnet.
6. Demo-Inhalte sind keine echten Meldungen, Bewertungen oder Angebote.
7. Werbung und Affiliate-Links werden deutlich gekennzeichnet.

## Technische Architektur

- Astro und TypeScript
- überwiegend statische Ausgabe
- On-Demand-Routen für `/news/` und `/api/news.json`
- Vercel-Serverless-Adapter
- Astro Content Collections
- RSS-/Atom-Aggregator mit 60-Minuten-Cache
- keine ungeprüften aktiven Feed-Quellen
- sehr wenig Browser-JavaScript

## Content Collections

- `tests`: Tests und Ersteindrücke
- `recommendations`: persönliche Empfehlungen
- `news`: eigene News-Artikel und Einordnungen
- `deals`: eigene Deal-Hinweise
- `releases`: Release-Checks
- `steamSuggestions`: unveröffentlichte Agent-Vorschläge

## News-Aggregator

Zentrale Freigabeliste: `src/config/newsSources.ts`

Die Pipeline verarbeitet ausschließlich aktivierte Quellen. Sie übernimmt nur Titel, URL,
Datum, Kategorie und Quellenangaben. Fehler werden pro Quelle isoliert. Gleiche URLs und
Titel werden entfernt, ähnliche Titel markiert. Ohne erfolgreiche Feed-Daten erscheinen
Demo-News.

## Steam-Release-Agent

Der Agent ist in `src/config/steamAgent.ts` standardmäßig deaktiviert. Seine Entwürfe liegen
in `src/content/steam-suggestions/`. Eine spätere tägliche Ausführung soll 5 bis 10
Vorschläge erzeugen, aber niemals automatisch einen Artikel veröffentlichen.

Vor Aktivierung erforderlich:

- erlaubte und dokumentierte Datenquelle
- Prüfung der Nutzungsbedingungen
- geklärte Nutzung offizieller Bild-URLs
- redaktionelle Freigabe
- Vercel-Cron oder externer täglicher Scheduler
- persistenter Speicher für Entwürfe

## Rechtliches vor Veröffentlichung

- Impressum vollständig ausfüllen
- Datenschutzerklärung prüfen und an Hosting sowie aktivierte Dienste anpassen
- Consent-Management vor Werbung oder Tracking einrichten
- bei Unsicherheit rechtliche Prüfung einholen

## Veröffentlichung

Zielplattform ist Vercel. Das Repository wird mit Vercel verbunden, automatisch gebaut und
anschließend mit `spielsignal.de` sowie `www.spielsignal.de` verknüpft.

## Nächste Ausbaustufe

1. Erste erlaubte RSS-Quelle dokumentieren und aktivieren.
2. Persistenten, regionsübergreifenden Feed-Cache ergänzen.
3. Steam-Datenquelle und Scheduler nach Freigabe implementieren.
4. Redaktionsoberfläche für Entwürfe und Statuswechsel entwickeln.
5. Eigene oder lizenzierte Titelbilder integrieren.
