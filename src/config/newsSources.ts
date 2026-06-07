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
    feedUrl: null,
    enabled: false,
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
    feedUrl: null,
    enabled: false,
    categoryMapping: "Online-Spiele",
    usageNotes:
      "Feed-Adresse und Nutzungsbedingungen vor Aktivierung manuell prüfen."
  },
  {
    name: "XboxDynasty",
    homepageUrl: "https://www.xboxdynasty.de/",
    feedUrl: null,
    enabled: false,
    categoryMapping: "Gaming allgemein",
    usageNotes:
      "Feed-Adresse, Nutzungsbedingungen und PC-Gaming-Bezug vor Aktivierung manuell prüfen."
  }
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
