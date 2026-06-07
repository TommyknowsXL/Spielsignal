import { XMLParser } from "fast-xml-parser";
import {
  newsSources,
  normalizeTitle,
  normalizeUrl,
  type NewsSource
} from "../config/newsSources";

const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_ITEMS_PER_SOURCE = 40;

export interface AggregatedNewsItem {
  id: string;
  title: string;
  url: string;
  date: string;
  category: string;
  sourceName: string;
  sourceHomepageUrl: string;
  similarTo?: string;
}

export interface FeedSourceStatus {
  name: string;
  ok: boolean;
  fromCache: boolean;
  itemCount: number;
  lastSuccessfulAt?: string;
  error?: string;
}

export interface AggregatedNewsResult {
  items: AggregatedNewsItem[];
  generatedAt: string;
  activeSourceCount: number;
  usedFallbackCache: boolean;
  statuses: FeedSourceStatus[];
}

const BLOCKED_NEWS_TERMS = [
  "[anzeige]",
  "anzeige",
  "smartphone",
  "handy",
  "iphone",
  "samsung galaxy",
  "tonies",
  "kaffeevollautomat",
  "kaffeemaschine",
  "e-bike",
  "tennis",
  "film",
  "netflix",
  "schauspieler",
  "will smith",
  "james bond",
  "ps5-angebot",
  "ps5 angebot",
  "nintendo-angebot",
  "nintendo angebot",
  "lego",
  "mediamarkt",
  "lidl",
  "amazon-angebot",
  "podcast",
  "quiz",
  "playstation",
  "unterhaltung",
  "xbox-angebot",
  "apps für den alltag"
] as const;

const GAMING_TERMS = [
  "pc",
  "steam",
  "spiel",
  "game",
  "gaming",
  "rollenspiel",
  "rpg",
  "shooter",
  "strategie",
  "survival",
  "simulation",
  "rennspiel",
  "cyberpunk",
  "early access",
  "gameplay",
  "remake",
  "addon",
  "update",
  "patch",
  "release",
  "demo",
  "open world",
  "multiplayer",
  "singleplayer"
] as const;

export function isRelevantPcGamingNews(item: Pick<AggregatedNewsItem, "title">): boolean {
  const title = item.title.toLocaleLowerCase("de");
  if (BLOCKED_NEWS_TERMS.some((term) => title.includes(term))) return false;
  return GAMING_TERMS.some((term) => title.includes(term));
}

interface SourceCacheEntry {
  items: AggregatedNewsItem[];
  fetchedAt: number;
  lastSuccessfulAt: string;
}

const sourceCache = new Map<string, SourceCacheEntry>();
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: false,
  trimValues: true
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return textValue(record["#text"] ?? record["__cdata"] ?? record["value"]);
}

function linkValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  for (const candidate of asArray(value)) {
    if (!candidate || typeof candidate !== "object") continue;
    const link = candidate as Record<string, unknown>;
    const rel = textValue(link["@_rel"]);
    const href = textValue(link["@_href"]);
    if (href && (!rel || rel === "alternate")) return href;
  }
  return "";
}

function safeDate(value: unknown): Date | null {
  const raw = textValue(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return normalizeUrl(url.toString());
  } catch {
    return null;
  }
}

function categoryFor(rawCategories: unknown, source: NewsSource): string {
  if (typeof source.categoryMapping === "string") return source.categoryMapping;

  const categories = asArray(rawCategories)
    .map((category) => textValue(category).toLocaleLowerCase("de"))
    .filter(Boolean);

  for (const category of categories) {
    for (const [sourceCategory, targetCategory] of Object.entries(source.categoryMapping)) {
      if (category.includes(sourceCategory.toLocaleLowerCase("de"))) return targetCategory;
    }
  }

  return source.categoryMapping.news ?? Object.values(source.categoryMapping)[0] ?? "News";
}

export function parseFeedXml(xml: string, source: NewsSource): AggregatedNewsItem[] {
  const document = parser.parse(xml) as Record<string, any>;
  const rssItems = asArray(document?.rss?.channel?.item);
  const atomItems = asArray(document?.feed?.entry);
  const rdfItems = asArray(document?.["rdf:RDF"]?.item);
  const items = rssItems.length ? rssItems : atomItems.length ? atomItems : rdfItems;

  return items
    .slice(0, MAX_ITEMS_PER_SOURCE)
    .map((item: Record<string, unknown>, index) => {
      const title = textValue(item.title).replace(/\s+/g, " ").trim();
      const url = safeExternalUrl(
        linkValue(item.link) || textValue(item.guid) || textValue(item.id)
      );
      const date =
        safeDate(item.pubDate) ??
        safeDate(item.published) ??
        safeDate(item.updated) ??
        safeDate(item.date);

      if (!title || !url || !date) return null;

      return {
        id: `${normalizeTitle(source.name)}-${date.getTime()}-${index}`,
        title: title.slice(0, 240),
        url,
        date: date.toISOString(),
        category: categoryFor(item.category, source),
        sourceName: source.name,
        sourceHomepageUrl: safeExternalUrl(source.homepageUrl) ?? "https://spielsignal.de/"
      } satisfies AggregatedNewsItem;
    })
    .filter((item): item is AggregatedNewsItem => item !== null);
}

async function readLimitedBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_FEED_BYTES) throw new Error("Feed ist größer als 2 MB.");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_FEED_BYTES) {
      await reader.cancel();
      throw new Error("Feed ist größer als 2 MB.");
    }
    result += decoder.decode(value, { stream: true });
  }

  return result + decoder.decode();
}

async function fetchSource(source: NewsSource): Promise<AggregatedNewsItem[]> {
  if (!source.feedUrl) throw new Error("Keine Feed-Adresse konfiguriert.");
  const feedUrl = safeExternalUrl(source.feedUrl);
  if (!feedUrl) throw new Error("Feed-Adresse muss HTTP oder HTTPS verwenden.");

  const response = await fetch(feedUrl, {
    headers: {
      accept: "application/atom+xml, application/rss+xml, application/xml, text/xml",
      "user-agent": "SpielSignalFeedReader/1.0 (+https://spielsignal.de/ueber-spielsignal/)"
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) throw new Error(`Feed antwortet mit HTTP ${response.status}.`);
  const items = parseFeedXml(await readLimitedBody(response), source);
  if (!items.length) throw new Error("Feed enthält keine verwertbaren Einträge.");
  return items;
}

function titleTokens(title: string): Set<string> {
  return new Set(
    normalizeTitle(title)
      .split(" ")
      .filter((token) => token.length > 2)
  );
}

function titleSimilarity(left: string, right: string): number {
  const a = titleTokens(left);
  const b = titleTokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

export function deduplicateAndMarkSimilar(
  items: AggregatedNewsItem[]
): AggregatedNewsItem[] {
  const urls = new Set<string>();
  const exactTitles = new Set<string>();
  const result: AggregatedNewsItem[] = [];

  for (const item of [...items].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))) {
    const normalizedUrl = normalizeUrl(item.url);
    const normalizedTitle = normalizeTitle(item.title);
    if (urls.has(normalizedUrl) || exactTitles.has(normalizedTitle)) continue;

    const similar = result.find((candidate) => titleSimilarity(candidate.title, item.title) >= 0.65);
    result.push(similar ? { ...item, similarTo: similar.title } : item);
    urls.add(normalizedUrl);
    exactTitles.add(normalizedTitle);
  }

  return result;
}

export async function getAggregatedNews(
  options: { forceRefresh?: boolean; sources?: NewsSource[] } = {}
):
  Promise<AggregatedNewsResult> {
  const enabledSources = (options.sources ?? newsSources).filter((source) => source.enabled);
  const statuses: FeedSourceStatus[] = [];
  const collected: AggregatedNewsItem[] = [];
  let usedFallbackCache = false;

  await Promise.all(
    enabledSources.map(async (source) => {
      const cacheKey = source.feedUrl ?? source.name;
      const cached = sourceCache.get(cacheKey);
      const cacheIsFresh =
        cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS && !options.forceRefresh;

      if (cacheIsFresh) {
        collected.push(...cached.items);
        statuses.push({
          name: source.name,
          ok: true,
          fromCache: true,
          itemCount: cached.items.length,
          lastSuccessfulAt: cached.lastSuccessfulAt
        });
        return;
      }

      try {
        const items = await fetchSource(source);
        const lastSuccessfulAt = new Date().toISOString();
        sourceCache.set(cacheKey, { items, fetchedAt: Date.now(), lastSuccessfulAt });
        collected.push(...items);
        statuses.push({
          name: source.name,
          ok: true,
          fromCache: false,
          itemCount: items.length,
          lastSuccessfulAt
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unbekannter Feed-Fehler.";
        if (cached) {
          collected.push(...cached.items);
          usedFallbackCache = true;
          statuses.push({
            name: source.name,
            ok: false,
            fromCache: true,
            itemCount: cached.items.length,
            lastSuccessfulAt: cached.lastSuccessfulAt,
            error: message
          });
        } else {
          statuses.push({
            name: source.name,
            ok: false,
            fromCache: false,
            itemCount: 0,
            error: message
          });
        }
      }
    })
  );

  return {
    items: deduplicateAndMarkSimilar(collected).filter(isRelevantPcGamingNews),
    generatedAt: new Date().toISOString(),
    activeSourceCount: enabledSources.length,
    usedFallbackCache,
    statuses: statuses.sort((a, b) => a.name.localeCompare(b.name, "de"))
  };
}
