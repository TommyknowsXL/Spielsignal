# Bildrechte und Freigabestatus

Öffentlich gerendert werden ausschließlich Bilder mit dem Status `approved` oder `fallback`.
Einträge mit `pending-review` oder `rejected` dürfen nicht durch den Resolver ausgegeben werden.

Priorität: eigenes freigegebenes Bild oder eigener Screenshot, dokumentiertes
Publisher-Presskit beziehungsweise offizielle Spielwebseite, dokumentiertes offizielles
Steam-Asset, lokales Kategoriebild, allgemeines lokales SpielSignal-Fallback.

| Artikel | Bildposition | Bild-URL oder Dateipfad | Quelle | Quellseite | Quellentyp | Nutzungsgrundlage | Freigabestatus | Datum geprüft | Steam-App-ID |
|---|---|---|---|---|---|---|---|---|---|
| Allgemeine Inhalte | Fallback | `/images/categories/news-default.svg` | SpielSignal | - | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 | - |
| Kategorie Updates | Kartenbild | `/images/categories/updates.svg` | SpielSignal | - | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 | - |
| Kategorie Fantasy | Kartenbild | `/images/categories/fantasy.svg` | SpielSignal | - | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 | - |
| Kategorie Rollenspiele | Kartenbild | `/images/categories/rollenspiele.svg` | SpielSignal | - | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 | - |
| Kategorie Survival | Kartenbild | `/images/categories/survival.svg` | SpielSignal | - | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 | - |
| Kategorie Strategie | Kartenbild | `/images/categories/strategie.svg` | SpielSignal | - | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 | - |
| Kategorie Shooter | Kartenbild | `/images/categories/shooter.svg` | SpielSignal | - | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 | - |
| Kategorie Hardware | Kartenbild | `/images/categories/hardware.svg` | SpielSignal | - | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 | - |
| Deals und Gratis-Aktionen | Kartenbild | `/images/categories/deals.svg` | SpielSignal | - | SpielSignal-Fallback | selbst erstellte lokale Grafik | fallback | 2026-06-08 | - |
| Gothic 1 Remake | Hero | `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1297900/header.jpg` | Steam / THQ Nordic | [offizielle Steam-Store-Seite](https://store.steampowered.com/app/1297900/Gothic_1_Remake/) | Steam-Store | eindeutige Zuordnung über Steam-App-ID und offiziellen Store-Eintrag; redaktionell geprüft | approved | 2026-06-08 | 1297900 |

Für den Gothic-Musterartikel sind derzeit keine zusätzlichen externen Bilder freigegeben.
Weitere Steam- oder Publisher-Assets werden erst nach einer einzelnen Quellen- und
Nutzungsprüfung ergänzt. Bis dahin bleibt der Artikel bewusst beim Hero-Bild.

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
