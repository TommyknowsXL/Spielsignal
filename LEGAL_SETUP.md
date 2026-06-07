# SpielSignal: Rechtliche und technische Startkonfiguration

Stand der technischen Prüfung: 6. Juni 2026

Diese Datei dokumentiert den aktuellen technischen Stand. Sie ersetzt keine Rechtsberatung.
Vor dem öffentlichen Start und vor jeder Monetarisierung wird eine abschließende rechtliche
Prüfung empfohlen.

## Datenschutz-Audit

### Gefundene externe Dienste und Verbindungen

- **Vercel:** Der Astro-Adapter für Vercel ist eingerichtet. Der tatsächlich verwendete Tarif
  und die datenschutzrechtlichen Vertragsunterlagen sind noch zu bestätigen.
- **GameStar-RSS-Feeds:** Drei ausdrücklich freigegebene Feeds werden serverseitig abgerufen.
  Im Browser werden keine GameStar-Skripte, Bilder oder eingebetteten Inhalte geladen.
- **AdSense-Vorbereitung:** Der Quellcode enthält eine bedingte Lademöglichkeit für das
  offizielle AdSense-Skript. Sie ist mit der Standardkonfiguration vollständig deaktiviert.
- **Externe Links:** Artikel-, Quellen- und optionale Teilen-Links führen zu fremden Webseiten.
  Sie werden erst durch einen bewussten Klick des Besuchers geöffnet.
- **Strukturierte Daten:** Lokale Inline-JSON-LD-Skripte beschreiben SpielSignal. Sie senden
  selbst keine Daten an Dritte.

Es wurden keine aktiven Integrationen für Google Analytics, Google Tag Manager, Matomo,
Meta Pixel, Facebook Pixel, Hotjar, Plausible, Umami, DoubleClick oder andere
Analyse-Plattformen gefunden.

### Deaktivierte optionale Dienste

Die zentrale Konfiguration liegt in `src/config/privacy.ts`. Standardmäßig sind deaktiviert:

- Werbung und AdSense
- Analyse und Tracking
- externe YouTube-, Twitch- oder Steam-Einbettungen
- Newsletter
- Kommentare
- Login und Benutzerkonten
- Consent-Modus

Die Umgebungsvariablen in `.env.example` stehen ebenfalls auf `false`. Eine Publisher-ID ist
nicht eingetragen.

### Schriftarten

Es werden keine Google Fonts oder sonstigen extern geladenen Schriftarten verwendet. Die Seite
nutzt lokale Systemschriftarten.

### Cookies und Browser-Speicher

Im geprüften Quellcode werden weder nicht erforderliche Cookies noch `localStorage` oder
`sessionStorage` verwendet. Der RSS-Cache läuft serverseitig im Speicher des jeweiligen
Serverprozesses und ist kein Browser-Cookie.

### Ist aktuell ein Cookie-Banner erforderlich?

Nach dem aktuellen technischen Stand erscheint für die von SpielSignal selbst eingebundenen
Funktionen kein Einwilligungsbanner erforderlich: Es sind keine nicht erforderlichen Cookies,
Analyse-, Werbe- oder Embed-Dienste aktiv. Diese Einschätzung ist technisch und muss vor dem
öffentlichen Start rechtlich bestätigt werden. Technisch notwendige Hosting-Protokolle sind
gesondert mit dem tatsächlich gewählten Anbieter zu prüfen.

## Funktionen mit Einwilligungsbedarf vor Aktivierung

Vor einer Aktivierung sind insbesondere zu prüfen und gegebenenfalls erst nach Einwilligung zu
laden:

- personalisierte oder cookiebasierte Werbung, insbesondere Google AdSense
- Analyse-Dienste
- YouTube-, Twitch-, Steam- und Social-Media-Einbettungen
- Newsletter-Tracking
- Kommentar- oder Login-Dienste externer Anbieter

Die Komponente `src/components/ExternalEmbedPlaceholder.astro` zeigt nur einen deaktivierten
Platzhalter. Sie lädt noch keinen Drittanbieter-Inhalt und speichert keine Einwilligung. Vor
einer echten Nutzung sind eine Zwei-Klick-Logik, Anbieterinformationen, Widerrufsmöglichkeit
und gegebenenfalls eine Consent-Management-Plattform zu ergänzen.

## RSS-Feeds

Aktiv ist ausschließlich:

- GameStar Gaming-News: `https://www.gamestar.de/rss/gaming.rss`

Die Verarbeitung übernimmt nur Quelle, Überschrift, Zeitpunkt, Kategorie und Original-URL.
Feed-Beschreibungen, Volltexte und fremde Bilder werden nicht übernommen. Die Konfiguration
liegt zentral in `src/config/newsSources.ts`.

Deaktivierte Kandidaten sind GameStar News, GameStar Deals, GameStar Hardware, GamePro,
PC Games, PC Games Hardware, MeinMMO und XboxDynasty. Sie dürfen
erst nach redaktioneller und rechtlicher Prüfung aktiviert werden.

## Verbindliche redaktionelle Regeln

RSS-Feeds dürfen als Themenradar und für klar gekennzeichnete externe Kurzmeldungen verwendet
werden. Eigene SpielSignal-Artikel benötigen eine eigenständige Struktur, belegbare Fakten,
eine Quellenbox und eine klare Trennung von Fakten und Einordnung.

Erlaubt sind offizielle Steam-Store-Seiten, Steam-News-Hubs, Publisher- und Entwicklerseiten,
Patchnotes, Trailer, Pressemitteilungen, eigene Screenshots sowie dokumentierte
Steam-Store-Bilder bei eindeutiger App-ID.

Nicht erlaubt sind das Kopieren oder absatzweise Umformulieren fremder Magazinartikel, das
Übernehmen fremder Gliederungen oder Meinungen, fremde Magazinbilder, ungeprüfte Google-Bilder,
SteamDB-Scraping, erfundene Tests, Bewertungen, Spielzeiten, Deals oder Releases sowie jede
ungeprüfte automatische Veröffentlichung.

Die vollständige Arbeitsrichtlinie steht in `docs/editorial/editorial-policy.md`.

## Abschnitte der Datenschutzerklärung später anpassen

Bei Änderungen sind mindestens folgende Abschnitte erneut zu prüfen:

- **Hosting:** Anbieter, Tarif, Auftragsverarbeitung, Serverstandorte, Drittlandübermittlungen
  und Speicherdauer
- **Cookies und ähnliche Technologien:** jede neue Browser-Speicherung oder Consent-Lösung
- **Werbung:** Werbenetzwerk, Personalisierung, Rechtsgrundlage und Empfänger
- **Analyse und Tracking:** Anbieter, Zwecke, Datenarten, Speicherdauer und Widerruf
- **Eingebettete Inhalte:** jeder aktivierte Drittanbieter und die Zwei-Klick-Lösung
- **Externe Links und RSS-Feeds:** neue Quellen oder eine erweiterte Datenübernahme
- **Newsletter:** Versanddienst, Double-Opt-in, Protokollierung und Abmeldung
- **Benutzerkonten und Kommentare:** Registrierung, Moderation und Speicherdauer

## AdSense vor Aktivierung

Aktuell wird kein AdSense-Skript geladen und es existiert bewusst keine `public/ads.txt`.
`public/ads.txt.example` ist nur eine Vorlage.

Vor der Aktivierung:

1. Google-Freigabe und echte Publisher-ID abwarten.
2. Geeignete, gegebenenfalls zertifizierte Consent-Management-Lösung einrichten.
3. Einwilligung, Ablehnung und Widerruf technisch testen.
4. Datenschutzerklärung um Anbieter, Zwecke, Datenübermittlungen und Speicherdauer ergänzen.
5. Tatsächlich erforderliche Consent- und Google-Signale konfigurieren.
6. Die echte Google-Zeile als `public/ads.txt` veröffentlichen.
7. Erst danach `PUBLIC_ADS_ENABLED`, `PUBLIC_CONSENT_MODE_READY` und
   `PUBLIC_ADSENSE_CLIENT` setzen.

## Hosting vor öffentlichem Start prüfen

SpielSignal ist auf Monetarisierung ausgelegt. Ein kostenloser Hosting-Tarif darf nur genutzt
werden, wenn dessen Bedingungen eine kommerzielle Nutzung ausdrücklich erlauben.

Falls Vercel eingesetzt wird:

- geeigneten kommerziellen Tarif prüfen
- Vertragsbedingungen prüfen
- Datenschutzinformationen aktualisieren
- Vereinbarung zur Auftragsverarbeitung prüfen
- Drittlandübermittlungen prüfen

Die Entscheidung für Hosting-Anbieter und Tarif ist noch offen und muss der Betreiber vor dem
öffentlichen Start treffen.

## Abschließende offene Prüfung

- Impressum und Datenschutzerklärung anwaltlich oder durch eine qualifizierte Fachstelle prüfen
- tatsächlichen Hosting-Anbieter und Tarif festlegen
- Auftragsverarbeitungsvertrag und internationale Datenübermittlungen prüfen
- RSS-Nutzungsbedingungen und erlaubten Metadatenumfang regelmäßig erneut prüfen
- Rechtstexte bei jeder neuen Funktion vor deren Aktivierung aktualisieren
- keine private Steuernummer veröffentlichen
- keinen veralteten Link zur früheren EU-Online-Streitbeilegungsplattform ergänzen

## Bilder und redaktionelle Freigabe

SpielSignal zeigt zu jedem sichtbaren Inhalt eine Bildfläche. Fremde Bilder dürfen nicht ungeprüft übernommen werden.

Für neue externe Meldungen wird zunächst ein eigenes lokales SpielSignal-Kategoriebild oder Fallback-Bild angezeigt. Ein Agent darf passende Bilder suchen und als Kandidaten vorschlagen. Ein externes Bild darf jedoch erst veröffentlicht werden, wenn Quelle und Nutzungsgrundlage dokumentiert und der Status manuell auf `approved` gesetzt wurden.

Bilder anderer Gaming-Magazine, ungeprüfte Suchmaschinenbilder und automatisiert von SteamDB bezogene Bilder sind nicht zulässig.

SteamDB wird nicht automatisch ausgelesen, gecrawlt oder gescrapt.

Offizielle Steam-Widgets dürfen auf Detailseiten über eine datenschutzfreundliche Zwei-Klick-Lösung eingebunden werden.

## Agenten und redaktionelle Freigabe

Automatisierte Agenten dürfen ausschließlich Vorschläge und Entwürfe vorbereiten. Artikel, Tests, Bewertungen, Bilder und Gratis-Aktionen dürfen nicht ungeprüft veröffentlicht werden.

Ein echter Test darf nur veröffentlicht werden, wenn das Spiel tatsächlich gespielt wurde oder belastbare Gameplay-Notizen vorhanden sind.

Externe Bilder dürfen nur veröffentlicht werden, wenn Quelle und Nutzungsgrundlage dokumentiert und der Status manuell auf `approved` gesetzt wurde.

API-Schlüssel dürfen ausschließlich über serverseitige Umgebungsvariablen oder GitHub Actions Secrets gespeichert werden. Sie dürfen niemals im Repository oder in Logs erscheinen.
