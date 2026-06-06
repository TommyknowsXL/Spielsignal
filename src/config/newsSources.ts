export interface NewsSource {
  name: string;
  feedUrl: string | null;
  homepageUrl: string;
  enabled: boolean;
  categoryMapping: Record<string, string>;
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
    name: "Demo: offizieller Publisher-Newsroom",
    feedUrl: null,
    homepageUrl: "https://example.com/",
    enabled: false,
    categoryMapping: {
      updates: "Updates",
      releases: "Releases"
    },
    usageNotes:
      "Platzhalter. Vor Aktivierung Nutzungsbedingungen, Feed-Adresse und zulässige Metadaten prüfen."
  },
  {
    name: "Demo: freigegebene Spiele-API",
    feedUrl: null,
    homepageUrl: "https://example.org/",
    enabled: false,
    categoryMapping: {
      news: "News",
      deals: "Deals"
    },
    usageNotes:
      "Platzhalter. Nur mit dokumentierter Erlaubnis und ohne Übernahme fremder Volltexte oder Bilder aktivieren."
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
