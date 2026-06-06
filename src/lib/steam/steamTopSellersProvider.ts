import {
  STEAM_TOP_SELLER_CACHE_TTL_MS,
  withSteamCache
} from "./steamCache";

export type SteamTopSeller = {
  rank: number;
  steamAppId: string;
  title: string;
  steamStoreUrl: string;
  imageUrl?: string;
  priceText?: string;
  discountText?: string;
  region: "DE" | "global";
  fetchedAt: string;
  sourceName: "Steam Topseller";
  sourceUrl: string;
};

export type SteamTopSellersResult = {
  records: SteamTopSeller[];
  status: string;
  region: "DE" | "global";
  fetchedAt: string;
  sourceUrl: string;
};

export const STEAM_TOP_SELLERS_DE_URL =
  "https://store.steampowered.com/charts/topselling/DE";
export const STEAM_TOP_SELLERS_GLOBAL_URL =
  "https://store.steampowered.com/charts/topselling/global";

const SEARCH_URL = "https://store.steampowered.com/search/results/";
const EXCLUDED_TITLE =
  /\b(steam deck|soundtrack|dlc|downloadable content|demo|dedicated server|server|benchmark|editor|sdk|video|trailer|artbook|supporter pack|wallpaper engine|software|tools?|hardware)\b/i;

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

function textFrom(fragment: string, className: string): string | undefined {
  const pattern = new RegExp(
    `<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
    "i"
  );
  const match = fragment.match(pattern)?.[1];
  if (!match) return undefined;
  const text = decodeHtml(match.replace(/<[^>]+>/g, " "));
  return text || undefined;
}

export function parseSteamTopSellersHtml(
  html: string,
  options: {
    region: "DE" | "global";
    fetchedAt: string;
    sourceUrl: string;
  }
): SteamTopSeller[] {
  const rows = html.match(
    /<a\b[^>]*class=["'][^"']*\bsearch_result_row\b[^"']*["'][\s\S]*?<\/a>/gi
  ) ?? [];

  return rows.flatMap((row, index): SteamTopSeller[] => {
    const appId =
      row.match(/\bdata-ds-appid=["'](\d+)["']/i)?.[1] ??
      row.match(/store\.steampowered\.com\\?\/app\\?\/(\d+)/i)?.[1];
    const title = textFrom(row, "title");
    if (!appId || !title || EXCLUDED_TITLE.test(title)) return [];

    const href = decodeHtml(
      row.match(/\bhref=["']([^"']+)["']/i)?.[1]?.replace(/\\\//g, "/") ?? ""
    );
    const imageUrl = row
      .match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1]
      ?.replace(/\\\//g, "/");
    const priceText =
      textFrom(row, "discount_final_price") ??
      textFrom(row, "search_price");
    const discountText = textFrom(row, "discount_pct");

    return [{
      rank: index + 1,
      steamAppId: appId,
      title,
      steamStoreUrl: href || `https://store.steampowered.com/app/${appId}/`,
      ...(imageUrl ? { imageUrl: decodeHtml(imageUrl) } : {}),
      ...(priceText ? { priceText } : {}),
      ...(discountText ? { discountText } : {}),
      region: options.region,
      fetchedAt: options.fetchedAt,
      sourceName: "Steam Topseller",
      sourceUrl: options.sourceUrl
    }];
  });
}

async function fetchRegion(options: {
  region: "DE" | "global";
  fetchImpl: typeof fetch;
  timeoutMs: number;
  now: () => Date;
}): Promise<SteamTopSeller[]> {
  const sourceUrl =
    options.region === "DE"
      ? STEAM_TOP_SELLERS_DE_URL
      : STEAM_TOP_SELLERS_GLOBAL_URL;
  const url = new URL(SEARCH_URL);
  url.searchParams.set("filter", "topsellers");
  url.searchParams.set("cc", options.region === "DE" ? "DE" : "US");
  url.searchParams.set("l", options.region === "DE" ? "german" : "english");
  url.searchParams.set("start", "0");
  url.searchParams.set("count", "20");
  url.searchParams.set("infinite", "1");

  const response = await options.fetchImpl(url, {
    headers: {
      accept: "application/json",
      "user-agent": "SpielSignal/1.0 (+https://spielsignal.vercel.app/)"
    },
    signal: AbortSignal.timeout(options.timeoutMs)
  });
  if (!response.ok) throw new Error(`Steam antwortete mit HTTP ${response.status}`);

  const payload = await response.json() as { success?: number; results_html?: string };
  if (payload.success !== 1 || typeof payload.results_html !== "string") {
    throw new Error("Steam lieferte kein verwertbares Topseller-Format");
  }
  const fetchedAt = options.now().toISOString();
  const records = parseSteamTopSellersHtml(payload.results_html, {
    region: options.region,
    fetchedAt,
    sourceUrl
  });
  if (!records.length) throw new Error("Steam lieferte keine geeigneten Basisspiele");
  return records.slice(0, 5);
}

export async function getSteamTopSellers(options: {
  enabled?: boolean;
  fetchImpl?: typeof fetch;
  cacheDirectory?: string;
  timeoutMs?: number;
  now?: () => Date;
} = {}): Promise<SteamTopSellersResult> {
  const now = options.now ?? (() => new Date());
  const fallbackFetchedAt = now().toISOString();
  if (options.enabled === false) {
    return {
      records: [],
      status: "Steam-Topseller deaktiviert: Feature-Flag ist false",
      region: "DE",
      fetchedAt: fallbackFetchedAt,
      sourceUrl: STEAM_TOP_SELLERS_DE_URL
    };
  }

  try {
    const records = await withSteamCache({
      cacheKey: "top-sellers",
      ttlMs: STEAM_TOP_SELLER_CACHE_TTL_MS,
      cacheDirectory: options.cacheDirectory,
      useStaleOnError: true,
      load: async () => {
        const loadOptions = {
          fetchImpl: options.fetchImpl ?? fetch,
          timeoutMs: options.timeoutMs ?? 8000,
          now
        };
        try {
          return await fetchRegion({ ...loadOptions, region: "DE" });
        } catch {
          return fetchRegion({ ...loadOptions, region: "global" });
        }
      }
    });
    const region = records[0]?.region ?? "DE";
    return {
      records,
      status: records.length
        ? `Steam-Topseller aktiv: ${records.length} Einträge (${region})`
        : "Steam-Topseller derzeit nicht verfügbar",
      region,
      fetchedAt: records[0]?.fetchedAt ?? fallbackFetchedAt,
      sourceUrl: records[0]?.sourceUrl ??
        (region === "DE" ? STEAM_TOP_SELLERS_DE_URL : STEAM_TOP_SELLERS_GLOBAL_URL)
    };
  } catch (error) {
    return {
      records: [],
      status:
        `Steam-Topseller derzeit nicht verfügbar: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`,
      region: "DE",
      fetchedAt: fallbackFetchedAt,
      sourceUrl: STEAM_TOP_SELLERS_DE_URL
    };
  }
}

export { STEAM_TOP_SELLER_CACHE_TTL_MS };
