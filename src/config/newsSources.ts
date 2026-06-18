export interface NewsSource {
  name: string;
  feedUrl: string | null;
  homepageUrl: string;
  enabled: boolean;
  categoryMapping: string | Record<string, string>;
  usageNotes: string;
}

/**
 * ERLAUBTE FEED-ADRESSEN WERDEN AUSSCHLIESSLICH HIER EINGETRAGEN.
 *
 * Vor dem Aktivieren:
 * 1. Nutzungsbedingungen und API-/Feed-Hinweise prüfen.
 * 2. Die ausdrücklich erlaubte Adresse als feedUrl eintragen.
 * 3. usageNotes mit Prüfdatum und erlaubtem Umfang ergänzen.
 * 4. Erst danach enabled auf true setzen.
 *
 * Keine Feed-Adresse raten: feedUrl bleibt bis zur Prüfung null.
 */
export const newsSources: NewsSource[] = [
  {
    name: "GameStar Gaming-News",
    homepageUrl: "https://www.gamestar.de/",
    feedUrl: "https://www.gamestar.de/rss/gaming.rss",
    enabled: true,
    categoryMapping: "Gaming-News",
    usageNotes:
      "Offizieller GameStar-Gaming-RSS-Feed. Nur Titel, Datum, Quelle und Link anzeigen. Bilder nur aus eindeutig zugeordneten offiziellen Steam-Store-Assets oder freigegebenen Quellen."
  },
  {
    name: "GameStar News",
    homepageUrl: "https://www.gamestar.de/",
    feedUrl: "https://www.gamestar.de/news/rss/news.rss",
    enabled: false,
    categoryMapping: "News",
    usageNotes:
      "Offizieller GameStar-RSS-Feed. Nur Überschrift, Veröffentlichungszeitpunkt, Quelle und Link zum Originalartikel anzeigen. Keine vollständigen Texte oder fremden Bilder übernehmen."
  },
  {
    name: "GameStar Deals",
    homepageUrl: "https://www.gamestar.de/",
    feedUrl: "https://www.gamestar.de/rss/deals.rss",
    enabled: false,
    categoryMapping: "Deals",
    usageNotes:
      "Offizieller GameStar-RSS-Feed. Nur Überschrift, Veröffentlichungszeitpunkt, Quelle und Link zum Originalartikel anzeigen. Keine vollständigen Texte oder fremden Bilder übernehmen."
  },
  {
    name: "GameStar Hardware",
    homepageUrl: "https://www.gamestar.de/",
    feedUrl: "https://www.gamestar.de/rss/hardware.rss",
    enabled: false,
    categoryMapping: "Hardware",
    usageNotes:
      "Offizieller GameStar-RSS-Feed. Nur Überschrift, Veröffentlichungszeitpunkt, Quelle und Link zum Originalartikel anzeigen. Keine vollständigen Texte oder fremden Bilder übernehmen."
  },
  {
    name: "GamePro News",
    homepageUrl: "https://www.gamepro.de/",
    feedUrl: null,
    enabled: false,
    categoryMapping: "Gaming allgemein",
    usageNotes:
      "Offizieller RSS-Feed, aber stärker konsolenorientiert. Erst nach redaktioneller Entscheidung aktivieren."
  },
  {
    name: "PC Games",
    homepageUrl: "https://www.pcgames.de/",
    feedUrl: "https://www.pcgames.de/rss/pcgames.xml",
    enabled: true,
    categoryMapping: "News",
    usageNotes:
      "Feed-Adresse und Nutzungsbedingungen vor Aktivierung manuell prüfen."
  },
  {
    name: "PC Games Hardware",
    homepageUrl: "https://www.pcgameshardware.de/",
    feedUrl: null,
    enabled: false,
    categoryMapping: "Hardware",
    usageNotes:
      "Feed-Adresse und Nutzungsbedingungen vor Aktivierung manuell prüfen."
  },
  {
    name: "MeinMMO",
    homepageUrl: "https://mein-mmo.de/",
    feedUrl: "https://mein-mmo.de/feed/",
    enabled: true,
    categoryMapping: "Online-Spiele",
    usageNotes:
      "Feed-Adresse und Nutzungsbedingungen vor Aktivierung manuell prüfen."
  },
  {
    name: "XboxDynasty",
    homepageUrl: "https://www.xboxdynasty.de/",
    feedUrl: "https://www.xboxdynasty.de/feed/",
    enabled: true,
    categoryMapping: "Gaming allgemein",
    usageNotes:
      "Feed-Adresse, Nutzungsbedingungen und PC-Gaming-Bezug vor Aktivierung manuell prüfen."
  },
  { name: "4Players", homepageUrl: "https://www.4players.de/", feedUrl: "https://www.4players.de/rss/news.xml", enabled: true, categoryMapping: "News", usageNotes: "Oeffentlich erreichbarer News-Feed; nur Metadaten und Link verwenden." },
  { name: "GamesWirtschaft", homepageUrl: "https://www.gameswirtschaft.de/", feedUrl: "https://www.gameswirtschaft.de/feed/", enabled: true, categoryMapping: "Branche", usageNotes: "Oeffentlich erreichbarer RSS-Feed; Branchenmeldungen mit Gaming-Bezug." },
  { name: "ComputerBase Gaming", homepageUrl: "https://www.computerbase.de/thema/gaming/", feedUrl: "https://www.computerbase.de/rss/news.xml", enabled: true, categoryMapping: "Gaming/Hardware", usageNotes: "Oeffentlicher ComputerBase-Newsfeed; Gaming-Bezug wird vor Auswahl klassifiziert." },
  { name: "Golem Gaming", homepageUrl: "https://www.golem.de/specials/games/", feedUrl: "https://rss.golem.de/rss.php?feed=RSS2.0", enabled: true, categoryMapping: "Gaming/Tech", usageNotes: "Oeffentlicher Golem-RSS; Gaming-Bezug wird gefiltert." },
  { name: "Heise Gaming", homepageUrl: "https://www.heise.de/thema/Games", feedUrl: "https://www.heise.de/rss/heise-atom.xml", enabled: true, categoryMapping: "Gaming/Tech", usageNotes: "Oeffentlicher Heise-Atomfeed; Gaming-Bezug wird gefiltert." },
  { name: "Eurogamer.de", homepageUrl: "https://www.eurogamer.de/", feedUrl: "https://www.eurogamer.de/feed", enabled: true, categoryMapping: "News", usageNotes: "Oeffentlicher Feed; nur Metadaten und Link verwenden." },
  { name: "IGN Deutschland", homepageUrl: "https://de.ign.com/", feedUrl: "https://de.ign.com/feed.xml", enabled: true, categoryMapping: "News", usageNotes: "Oeffentlicher Feed; nur Metadaten und Link verwenden." },
  { name: "Play3", homepageUrl: "https://www.play3.de/", feedUrl: "https://www.play3.de/feed/", enabled: true, categoryMapping: "Gaming allgemein", usageNotes: "Oeffentlicher Feed; PC-Bezug wird vor Auswahl geprueft." },
  { name: "ntower", homepageUrl: "https://www.ntower.de/", feedUrl: "https://www.ntower.de/news-feed/", enabled: true, categoryMapping: "Gaming allgemein", usageNotes: "Oeffentlich erreichbare Uebersicht; PC-Bezug wird gefiltert." },
  { name: "PC Gamer", homepageUrl: "https://www.pcgamer.com/", feedUrl: "https://www.pcgamer.com/rss/", enabled: true, categoryMapping: "News", usageNotes: "Public RSS; metadata and source link only." },
  { name: "Eurogamer", homepageUrl: "https://www.eurogamer.net/", feedUrl: "https://www.eurogamer.net/feed", enabled: true, categoryMapping: "News", usageNotes: "Public feed; metadata and source link only." },
  { name: "IGN", homepageUrl: "https://www.ign.com/", feedUrl: "https://feeds.ign.com/ign/games-all", enabled: true, categoryMapping: "News", usageNotes: "Public feed; metadata and source link only." },
  { name: "GameSpot", homepageUrl: "https://www.gamespot.com/", feedUrl: "https://www.gamespot.com/feeds/mashup/", enabled: true, categoryMapping: "News", usageNotes: "Public feed; metadata and source link only." },
  { name: "GamesRadar+", homepageUrl: "https://www.gamesradar.com/", feedUrl: "https://www.gamesradar.com/rss/", enabled: true, categoryMapping: "News", usageNotes: "Public feed; metadata and source link only." },
  { name: "Rock Paper Shotgun", homepageUrl: "https://www.rockpapershotgun.com/", feedUrl: "https://www.rockpapershotgun.com/feed", enabled: true, categoryMapping: "PC Gaming", usageNotes: "Public feed; metadata and source link only." },
  { name: "VGC", homepageUrl: "https://www.videogameschronicle.com/", feedUrl: "https://www.videogameschronicle.com/feed/", enabled: true, categoryMapping: "News", usageNotes: "Public feed; metadata and source link only." },
  { name: "Gematsu", homepageUrl: "https://www.gematsu.com/", feedUrl: "https://www.gematsu.com/feed", enabled: true, categoryMapping: "News", usageNotes: "Public feed; metadata and source link only." },
  { name: "Polygon", homepageUrl: "https://www.polygon.com/", feedUrl: "https://www.polygon.com/rss/index.xml", enabled: true, categoryMapping: "News", usageNotes: "Public feed; metadata and source link only." },
  { name: "The Verge Gaming", homepageUrl: "https://www.theverge.com/games", feedUrl: "https://www.theverge.com/rss/games/index.xml", enabled: true, categoryMapping: "Gaming/Tech", usageNotes: "Public feed; metadata and source link only." },
  { name: "Windows Central Gaming", homepageUrl: "https://www.windowscentral.com/gaming", feedUrl: "https://www.windowscentral.com/rss", enabled: true, categoryMapping: "PC Gaming", usageNotes: "Public feed; metadata and source link only." },
  { name: "Push Square", homepageUrl: "https://www.pushsquare.com/", feedUrl: "https://www.pushsquare.com/feeds/latest", enabled: true, categoryMapping: "Gaming allgemein", usageNotes: "Public feed; PC relevance is filtered before selection." },
  { name: "Nintendo Life", homepageUrl: "https://www.nintendolife.com/", feedUrl: "https://www.nintendolife.com/feeds/latest", enabled: true, categoryMapping: "Gaming allgemein", usageNotes: "Public feed; PC relevance is filtered before selection." },
  { name: "Pure Xbox", homepageUrl: "https://www.purexbox.com/", feedUrl: "https://www.purexbox.com/feeds/latest", enabled: true, categoryMapping: "Gaming allgemein", usageNotes: "Public feed; PC relevance is filtered before selection." },
  { name: "Xbox Wire", homepageUrl: "https://news.xbox.com/", feedUrl: "https://news.xbox.com/en-us/feed/", enabled: true, categoryMapping: "Offiziell", usageNotes: "Offizielle Xbox-Newsquelle; offizielle Meldungen werden in der Queue bevorzugt." },
  { name: "PlayStation Blog", homepageUrl: "https://blog.playstation.com/", feedUrl: "https://blog.playstation.com/feed/", enabled: true, categoryMapping: "Offiziell", usageNotes: "Offizielle PlayStation-Newsquelle; PC-Bezug wird gefiltert." },
  { name: "Ubisoft News", homepageUrl: "https://news.ubisoft.com/", feedUrl: "https://news.ubisoft.com/en-us/rss", enabled: true, categoryMapping: "Offiziell", usageNotes: "Offizielle Ubisoft-Newsquelle." },
  { name: "EA News", homepageUrl: "https://www.ea.com/news", feedUrl: "https://www.ea.com/news/rss.xml", enabled: true, categoryMapping: "Offiziell", usageNotes: "Offizielle EA-Newsquelle." },
  { name: "Epic Games News", homepageUrl: "https://store.epicgames.com/news", feedUrl: "https://store.epicgames.com/en-US/news/rss", enabled: true, categoryMapping: "Offiziell", usageNotes: "Offizielle Epic-Newsquelle." },
  { name: "GOG News", homepageUrl: "https://www.gog.com/news", feedUrl: "https://www.gog.com/news/feed", enabled: true, categoryMapping: "Offiziell", usageNotes: "Offizielle GOG-Newsquelle." }
];

export function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(
      (key) => url.searchParams.delete(key)
    );
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim();
  }
}

export function normalizeTitle(value: string): string {
  return value
    .toLocaleLowerCase("de")
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function deduplicateItems<T extends { url: string; title: string; date: Date }>(
  items: T[]
): T[] {
  const urls = new Set<string>();
  const titles = new Set<string>();

  return [...items]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .filter((item) => {
      const url = normalizeUrl(item.url);
      const title = normalizeTitle(item.title);
      if (urls.has(url) || titles.has(title)) return false;
      urls.add(url);
      titles.add(title);
      return true;
    });
}
