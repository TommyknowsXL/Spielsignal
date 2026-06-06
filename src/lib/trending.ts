import type { PresentedNewsItem } from "./newsPresentation";

export type TrendingItem = {
  title: string;
  url: string;
  source: string;
  image: string;
  imageAlt: string;
  clickCount?: number;
  external: boolean;
};

export type TrendingResult = {
  heading: "Trending auf SpielSignal" | "Neu eingetroffen";
  items: TrendingItem[];
  usesClickData: boolean;
};

type UpstashResponse = { result?: unknown; error?: string };

async function readClickRanking(): Promise<Map<string, number>> {
  const endpoint = import.meta.env?.UPSTASH_REDIS_REST_URL?.trim();
  const token = import.meta.env?.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!endpoint || !token || !endpoint.startsWith("https://")) return new Map();

  try {
    const response = await fetch(
      `${endpoint.replace(/\/$/, "")}/zrevrange/spielsignal:article-clicks/0/19/withscores`,
      {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(4_000)
      }
    );
    if (!response.ok) return new Map();

    const body = (await response.json()) as UpstashResponse;
    if (!Array.isArray(body.result)) return new Map();

    const ranking = new Map<string, number>();
    for (let index = 0; index < body.result.length - 1; index += 2) {
      const url = body.result[index];
      const score = Number(body.result[index + 1]);
      if (typeof url === "string" && Number.isFinite(score) && score > 0) {
        ranking.set(url, score);
      }
    }
    return ranking;
  } catch {
    return new Map();
  }
}

function toTrendingItem(item: PresentedNewsItem, clickCount?: number): TrendingItem {
  return {
    title: item.title,
    url: item.url,
    source: item.sourceName,
    image: item.image,
    imageAlt: item.imageAlt,
    clickCount,
    external: true
  };
}

export async function getTrendingItems(
  newsItems: PresentedNewsItem[]
): Promise<TrendingResult> {
  const ranking = await readClickRanking();
  const ranked = newsItems
    .filter((item) => ranking.has(item.url))
    .sort((left, right) => (ranking.get(right.url) ?? 0) - (ranking.get(left.url) ?? 0))
    .slice(0, 3);

  if (ranked.length) {
    return {
      heading: "Trending auf SpielSignal",
      items: ranked.map((item) => toTrendingItem(item, ranking.get(item.url))),
      usesClickData: true
    };
  }

  return {
    heading: "Neu eingetroffen",
    items: newsItems.slice(0, 3).map((item) => toTrendingItem(item)),
    usesClickData: false
  };
}
