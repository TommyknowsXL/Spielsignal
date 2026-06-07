# Redaktionelle Richtlinie

## Zwei getrennte Inhaltsarten

### Externe Kurzmeldungen

RSS-Feeds dienen als Themenradar. Öffentlich angezeigt werden ausschließlich Titel, Quelle,
Datum, eine zulässige Bildfläche und der Link zur Originalmeldung. Die Karte wird als externer
Inhalt gekennzeichnet und führt zur Quelle.

### Eigene SpielSignal-Artikel

Eigene Artikel besitzen eine eigene Überschrift, Struktur, Faktensichtung, Einordnung,
Quellenbox, SEO-Daten und dokumentierte Bildquelle. Ein fremder Magazinartikel ist niemals die
alleinige Grundlage eines vollständig ausgearbeiteten SpielSignal-Artikels.

## Erlaubt

- freigegebene Gaming-RSS-Feeds als Themenradar verwenden
- Titel, Veröffentlichungszeitpunkt, Quelle und Link anzeigen
- offizielle Primärquellen suchen und dokumentieren
- Fakten aus offiziellen Quellen in eigener Struktur zusammenfassen
- eigene, klar getrennte Einordnung ergänzen
- offizielle Steam-Store-Seiten und Steam-News-Hubs verwenden
- offizielle Publisher- und Entwickler-Webseiten verwenden
- offizielle Patchnotes, Trailer und Pressemitteilungen verwenden
- eigene Screenshots verwenden
- dokumentierte Steam-Store-Bilder bei eindeutiger App-ID verwenden

## Nicht erlaubt

- Artikel anderer Gaming-Magazine kopieren
- vollständige fremde Artikeltexte speichern
- fremde Artikel Absatz für Absatz umformulieren
- Gliederung oder Argumentationsfolge eines fremden Artikels übernehmen
- fremde Einordnung als eigene Meinung ausgeben
- Bilder anderer Gaming-Magazine kopieren
- ungeprüfte Google-Bilder verwenden
- SteamDB scrapen, crawlen oder als Bildquelle verwenden
- Tests, Bewertungen, Reichweiten, Deals, Releases oder Spielzeiten erfinden
- behaupten, ein Spiel gespielt zu haben, wenn keine echten Gameplay-Notizen vorliegen
- Artikel automatisch ungeprüft veröffentlichen

## Primärquellen

Geeignete Primärquellen sind offizielle Entwickler- oder Publisher-Seiten, Steam-Store-Seiten,
Steam-News-Hubs, Patchnotes, Trailer und Pressemitteilungen. Mindestens eine Primärquelle ist
für einen vollständigen eigenen Entwurf erforderlich.

Fehlt sie, darf nur ein Gerüst mit `needs-source-review` erzeugt werden. Der Hinweis
`Offizielle Primärquelle fehlt. Vor Veröffentlichung ergänzen.` muss sichtbar bleiben.

## Artikeltypen

Eigene News-Artikel verwenden:

1. Überschrift und Teaser
2. Was ist passiert?
3. Die wichtigsten Fakten
4. Was bedeutet das für PC-Spieler?
5. Unsere Einordnung
6. Quellen

Release-Checks verwenden:

1. Überschrift und Teaser
2. Was ist das für ein Spiel?
3. Für wen könnte es interessant sein?
4. Was wissen wir bereits?
5. Was ist noch offen?
6. Unsere vorläufige Einschätzung
7. Quellen

Gratis-Aktionen verwenden:

1. Überschrift und Teaser
2. Was ist kostenlos?
3. Wie lange gilt die Aktion?
4. Bleibt das Spiel dauerhaft in der Bibliothek oder ist es nur testbar?
5. Steam-Link
6. Quellen

## Veröffentlichung

Drafts liegen ausschließlich in `src/content/drafts/` und sind nicht öffentlich. Nur manuell
geprüfte Beiträge in `src/content/articles/` mit `status: published` erscheinen auf der
Webseite. Ein Test benötigt eine dokumentierte Spielzeit größer als null. Pull Requests werden
manuell geprüft und gemergt.
