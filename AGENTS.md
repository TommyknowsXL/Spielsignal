# SpielSignal Branding Rules

Diese Regeln sind für alle zukünftigen Arbeiten im Repository verbindlich.

## Marke

- Name: `SpielSignal`
- Positionierung: `PC-Gaming-News, Tests und Deals auf einen Blick`
- Wirkung: professionell, glaubwürdig, technisch modern, dunkel und atmosphärisch
- Vermeiden: kindliche Optik, billiger Neon-Look, überladene Effekte, E-Sport-Klischees

## Farbpalette

Die Grundfarben dürfen nicht ersetzt werden:

```css
--color-midnight: #0b1020;
--color-graphite: #151b2e;
--color-signal-cyan: #3ce6ff;
--color-pulse-blue: #4f7cff;
--color-soft-white: #f3f5f7;
--color-accent-amber: #ffb84d;
```

- Midnight: Seitenhintergrund
- Graphite: Karten, Navigation, Panels und Sidebar
- Signal Cyan: primäre Aktionen, aktive Zustände und Signalformen
- Pulse Blue: Links und sekundäre Aktionen
- Soft White: Überschriften und Haupttext
- Accent Amber: Deals, Sonderaktionen und Kaufhinweise

Abstufungen sind erlaubt, solange Kontrast und Grundcharakter erhalten bleiben.

## Logo

- Ausschließlich die SVGs unter `public/branding/` oder die Komponente `Logo.astro` verwenden.
- Das Icon darf allein stehen; der Schriftzug lautet immer `SpielSignal`.
- Logo nicht verzerren, umfärben oder mit Effekten überladen.
- Keine Rastergrafik als Logo und keine externen Fonts voraussetzen.

## Typografie

- Maximal zwei Schriftfamilien.
- UI und Überschriften: kräftige System-Sans-Serif mit kompakter Laufweite.
- Artikeltext: sehr gut lesbar, großzügige Zeilenhöhe und begrenzte Textbreite.
- Keine dekorative Sci-Fi-Schrift für längere Texte.

## Komponenten

Vorhandene Komponenten wiederverwenden. Neue Seitenelemente sollen zu folgenden Bausteinen
passen: Header, Footer, Logo, Hero, PrimaryButton, SecondaryButton, CategoryChip, NewsCard,
ReviewCard, RecommendationCard, DealCard, ReleaseCalendar, TrendingSidebar, AdSlot,
SectionHeader und ArticleLayout.

## Inhalte und Bilder

- Keine fremden Bilder ungeprüft kopieren.
- Nur eigene, offizielle oder dokumentiert lizenzierte Bilder verwenden.
- Demo-Visuals als CSS/SVG oder klar gekennzeichnete Platzhalter umsetzen.
- Demo-News niemals als aktuelle Meldungen ausgeben.
- Keine erfundenen Bewertungen, Reichweiten oder Nutzerzahlen als reale Daten darstellen.

## Werbung

- Jeder Werbeplatz trägt sichtbar `WERBUNG`.
- Ohne gültige Konfiguration nur dezente Platzhalter anzeigen.
- Werbung darf Navigation, Lesefluss und mobile Bedienung nicht stören.

## Qualität

Vor Abschluss mindestens `npm run build` ausführen. Desktop und Smartphone, Navigation,
Kontraste, interne Links, Assets, Werbekennzeichnung und Browser-Konsole prüfen.
