# Bildrechte und Freigabestatus

Öffentlich gerendert werden ausschließlich Bilder mit dem Status `approved` oder `fallback`.
Einträge mit `pending-review` oder `rejected` dürfen nicht durch den Resolver ausgegeben werden.

Priorität: eigenes freigegebenes Bild oder eigener Screenshot, dokumentiertes
Publisher-Presskit beziehungsweise offizielle Spielwebseite, dokumentiertes offizielles
Steam-Asset, lokales Kategoriebild, allgemeines lokales SpielSignal-Fallback.

| Dateipfad oder externe URL | Verwendet für | Spiel oder Artikel | Quelle | Quellentyp | Nutzungsgrundlage | Freigabestatus | Datum geprüft |
|---|---|---|---|---|---|---|---|
| `/images/categories/news-default.svg` | allgemeines Fallback | unbekannte Meldungen | SpielSignal | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 |
| `/images/categories/updates.svg` | Kategorie Updates | externe Meldungen | SpielSignal | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 |
| `/images/categories/fantasy.svg` | Kategorie Fantasy | redaktionelle Inhalte | SpielSignal | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 |
| `/images/categories/rollenspiele.svg` | Kategorie Rollenspiele | redaktionelle Inhalte | SpielSignal | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 |
| `/images/categories/survival.svg` | Kategorie Survival | redaktionelle Inhalte | SpielSignal | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 |
| `/images/categories/strategie.svg` | Strategie und Simulation | redaktionelle Inhalte | SpielSignal | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 |
| `/images/categories/shooter.svg` | Kategorie Shooter | redaktionelle Inhalte | SpielSignal | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 |
| `/images/categories/hardware.svg` | Kategorie Hardware | externe Meldungen | SpielSignal | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 |
| `/images/categories/deals.svg` | Deals und Gratis-Aktionen | externe und redaktionelle Inhalte | SpielSignal | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 |

## Zulässige externe Quellen

Externe Bilder müssen einzeln dokumentiert werden. Mögliche Quellentypen sind:

- Eigenes Bild
- Eigener Screenshot
- Offizielle Steam-Store-Seite
- Offizielles Steam-Widget
- Publisher-Presskit
- Offizielle Spielwebseite
- Lizenzierte Bilddatenbank
- SpielSignal-Fallback

Keine Bilder anderer Gaming-Magazine, ungeprüfte Suchmaschinenbilder, Fan-Art, RSS-Bilder,
Open-Graph-Bilder oder SteamDB-Bilder automatisch übernehmen. Kein Hotlinking ohne dokumentierte
Nutzungsgrundlage.

## Steam-Bildfreigabe

Bei externen Kurzmeldungen darf ein offizielles Steam-Store-Bild nur verwendet werden, wenn
die App-ID durch einen eindeutigen exakten Store-Treffer ermittelt wurde. Unsichere oder
mehrdeutige Treffer bleiben beim lokalen Fallback. Ein Ladefehler fällt ebenfalls auf das
lokale Fallback zurück.

Für eigene Artikel werden offizielle Steam-Store-Bilder zunächst nur als URL-Kandidaten im
Tagesbericht geführt. Sie bleiben `pending-review`, bis Zuordnung und Bildquelle für den
Artikel dokumentiert wurden.

Nach manueller Prüfung wird ein Bild anhand seiner App-ID in
`src/config/approvedSteamImages.ts` eingetragen:

```ts
export const approvedSteamImages = {
  "123456": {
    imageUrl: "https://shared.fastly.steamstatic.com/...",
    sourcePageUrl: "https://store.steampowered.com/app/123456/",
    sourceType: "steam-store",
    rightsNotes: "Nutzungsgrundlage manuell geprüft.",
    approvedAt: "YYYY-MM-DD"
  }
};
```

Ohne dokumentierte Zuordnung darf ein eigenes SpielSignal-Artikelbild nicht als freigegeben
gelten.
