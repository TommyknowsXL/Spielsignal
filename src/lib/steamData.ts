import { resolveSteamImage } from "../config/newsImageRules";
import { getSteamAgentConfig } from "../config/steamAgent";
import { getSteamStoreUrl } from "./steam/steamImageCandidateProvider";
import { getSteamMostPlayed } from "./steam/steamMostPlayedProvider";
import { getOfficialSteamReleases } from "./steam/steamReleaseProvider";
import {
  getSteamTopSellers,
  STEAM_TOP_SELLERS_DE_URL
} from "./steam/steamTopSellersProvider";

export type SteamSidebarItem = {
  appId?: number;
  rank?: number;
  title: string;
  url: string;
  source: "Steam";
  sourceUrl?: string;
  image: string;
  fallbackImage?: string;
  imageAlt: string;
  updatedAt?: string;
  valueLabel?: string;
  priceText?: string;
  discountText?: string;
  region?: "DE" | "global";
};

export const OFFICIAL_STEAM_CHARTS_URL = STEAM_TOP_SELLERS_DE_URL;
export const OFFICIAL_STEAM_UPCOMING_URL =
  "https://store.steampowered.com/search/?filter=comingsoon";

export function officialSteamFallback(
  kind: "trends" | "releases"
): SteamSidebarItem {
  const title =
    kind === "trends"
      ? "Offizielle Steam-Topseller ansehen"
      : "Kommende Veröffentlichungen auf Steam ansehen";
  const image = resolveSteamImage({ gameTitle: title, category: "Steam" });
  return {
    title,
    url: kind === "trends" ? OFFICIAL_STEAM_CHARTS_URL : OFFICIAL_STEAM_UPCOMING_URL,
    source: "Steam",
    image: image.src,
    imageAlt: image.alt
  };
}

export async function getSteamTrends(): Promise<SteamSidebarItem[]> {
  const result = await getSteamTopSellers({
    enabled: process.env.STEAM_TOP_SELLERS_ENABLED !== "false"
  });
  return result.records.slice(0, 5).map((record) => {
    const image = resolveSteamImage({
      appId: Number(record.steamAppId),
      gameTitle: record.title,
      category: "Steam"
    });
    return {
      appId: Number(record.steamAppId),
      rank: record.rank,
      title: record.title,
      url: record.steamStoreUrl,
      source: "Steam",
      sourceUrl: record.sourceUrl,
      image: record.imageUrl ?? image.src,
      fallbackImage: image.src,
      imageAlt: record.imageUrl
        ? `Offizielles Steam-Store-Bild zu ${record.title}`
        : image.alt,
      updatedAt: record.fetchedAt,
      priceText: record.priceText,
      discountText: record.discountText,
      region: record.region
    };
  });
}

export async function getSteamMostPlayedItems(): Promise<SteamSidebarItem[]> {
  const config = getSteamAgentConfig();
  const result = await getSteamMostPlayed({
    enabled: config.enabled && config.mostPlayedEnabled,
    apiKey: process.env.STEAM_WEB_API_KEY
  });
  return result.records.slice(0, 5).flatMap((record) => {
    if (!record.name) return [];
    const image = resolveSteamImage({
      appId: Number(record.appId),
      gameTitle: record.name,
      category: "Steam"
    });
    return [{
      appId: Number(record.appId),
      title: record.name,
      url: getSteamStoreUrl(record.appId),
      source: "Steam" as const,
      image: image.src,
      imageAlt: image.alt,
      ...(record.concurrentPlayers !== undefined
        ? { valueLabel: `${record.concurrentPlayers.toLocaleString("de-DE")} gleichzeitig` }
        : {})
    }];
  });
}

export async function getSteamReleases(): Promise<SteamSidebarItem[]> {
  const config = getSteamAgentConfig();
  if (!config.enabled || !config.releasesEnabled) return [];
  await getOfficialSteamReleases();
  return [];
}
