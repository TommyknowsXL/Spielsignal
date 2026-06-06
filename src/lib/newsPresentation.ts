import { normalizeTitle } from "../config/newsSources";
import { resolveNewsImage } from "../config/newsImageRules";
import { extractGameTitle } from "./gameTitle";
import type { AggregatedNewsItem } from "./newsFeed";
import { getSteamHeaderImageCandidate, getSteamStoreUrl } from "./steam/steamImageCandidateProvider";

export type PresentedNewsItem = AggregatedNewsItem & {
  gameTitle?: string;
  steamAppId?: string;
  steamStoreUrl?: string;
  image: string;
  fallbackImage: string;
  imageAlt: string;
  imageKind: "steam" | "approved" | "fallback";
};

type SteamSearchMatch = {
  appId: string;
  title: string;
  imageUrl?: string;
};

const searchCache = new Map<string, Promise<SteamSearchMatch | undefined>>();

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCandidates(headline: string): string[] {
  const extracted = extractGameTitle(headline);
  const cleaned = headline
    .replace(/^(plus\s*-\s*)?(news|preview|test|kolumne|analyse|video)\s*[:\-]\s*/i, "")
    .trim();
  const beforeDash = cleaned.split(/\s[-–—]\s/, 1)[0]?.trim();
  const beforeColon = cleaned.split(":", 1)[0]?.trim();
  const beforeComma = cleaned.split(",", 1)[0]?.trim();
  return [...new Set([extracted, beforeDash, beforeColon, beforeComma].filter(
    (value): value is string => Boolean(value && value.length >= 3 && value.length <= 80)
  ))];
}

async function searchExactSteamApp(
  gameTitle: string,
  fetchImpl: typeof fetch
): Promise<SteamSearchMatch | undefined> {
  const key = normalizeTitle(gameTitle);
  if (!searchCache.has(key)) {
    searchCache.set(key, (async () => {
      try {
        const url = new URL("https://store.steampowered.com/search/results/");
        url.searchParams.set("term", gameTitle);
        url.searchParams.set("category1", "998");
        url.searchParams.set("cc", "DE");
        url.searchParams.set("l", "german");
        url.searchParams.set("start", "0");
        url.searchParams.set("count", "10");
        url.searchParams.set("infinite", "1");
        const response = await fetchImpl(url, {
          headers: {
            accept: "application/json",
            "user-agent": "SpielSignal/1.0 (+https://spielsignal.vercel.app/)"
          },
          signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) return undefined;
        const payload = await response.json() as { results_html?: string };
        const html = payload.results_html ?? "";
        const rows = html.match(
          /<a\b[^>]*class=["'][^"']*\bsearch_result_row\b[^"']*["'][\s\S]*?<\/a>/gi
        ) ?? [];
        const matches = rows.flatMap((row): SteamSearchMatch[] => {
          const appId = row.match(/\bdata-ds-appid=["'](\d+)["']/i)?.[1];
          const rawTitle = row.match(
            /<span\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
          )?.[1];
          const imageUrl = row.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
          if (!appId || !rawTitle) return [];
          return [{
            appId,
            title: decodeHtml(rawTitle.replace(/<[^>]+>/g, " ")),
            ...(imageUrl ? { imageUrl: decodeHtml(imageUrl) } : {})
          }];
        }).filter((match) => normalizeTitle(match.title) === key);
        return matches.length === 1 ? matches[0] : undefined;
      } catch {
        return undefined;
      }
    })());
  }
  return searchCache.get(key);
}

export async function resolveSteamAppId(
  headline: string,
  fetchImpl: typeof fetch = fetch
): Promise<SteamSearchMatch | undefined> {
  for (const candidate of titleCandidates(headline)) {
    const match = await searchExactSteamApp(candidate, fetchImpl);
    if (match) return match;
  }
  return undefined;
}

export function resolveSteamImage(appId: string): string {
  if (!/^\d+$/.test(appId)) {
    throw new Error("Steam-App-ID muss numerisch sein");
  }
  return getSteamHeaderImageCandidate(appId);
}

export async function prepareNewsItems(
  items: AggregatedNewsItem[],
  options: { fetchImpl?: typeof fetch; limit?: number } = {}
): Promise<PresentedNewsItem[]> {
  const selected = items.slice(0, options.limit ?? 24);
  return Promise.all(selected.map(async (item) => {
    const fallback = resolveNewsImage({
      articleUrl: item.url,
      title: item.title,
      category: item.category
    });
    const steam = await resolveSteamAppId(item.title, options.fetchImpl ?? fetch);
    if (steam) {
      return {
        ...item,
        gameTitle: steam.title,
        steamAppId: steam.appId,
        steamStoreUrl: getSteamStoreUrl(steam.appId),
        image: steam.imageUrl ?? resolveSteamImage(steam.appId),
        fallbackImage: fallback.src,
        imageAlt: `Offizielles Steam-Store-Bild zu ${steam.title}`,
        imageKind: "steam" as const
      };
    }
    return {
      ...item,
      image: fallback.src,
      fallbackImage: fallback.src,
      imageAlt: fallback.alt,
      imageKind: fallback.status === "approved" ? "approved" as const : "fallback" as const
    };
  }));
}
