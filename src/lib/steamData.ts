import { resolveSteamImage } from "../config/newsImageRules";
import { getSteamAgentConfig } from "../config/steamAgent";
import { getOfficialSteamReleases } from "./steam/steamReleaseProvider";
import { getOfficialSteamTrends } from "./steam/steamTrendsProvider";
import { getSteamStoreUrl } from "./steam/steamImageCandidateProvider";

export type SteamSidebarItem = {
  appId?: number;
  title: string;
  url: string;
  source: "Steam";
  image: string;
  imageAlt: string;
  updatedAt?: string;
  valueLabel?: string;
};

export const OFFICIAL_STEAM_CHARTS_URL =
  "https://store.steampowered.com/charts/mostplayed";
export const OFFICIAL_STEAM_UPCOMING_URL =
  "https://store.steampowered.com/search/?filter=comingsoon";

export function officialSteamFallback(
  kind: "trends" | "releases"
): SteamSidebarItem {
  const title =
    kind === "trends"
      ? "Offizielle Steam-Charts ansehen ↗"
      : "Kommende Veröffentlichungen auf Steam ansehen ↗";
  const image = resolveSteamImage({ gameTitle: title, category: "Steam" });
  return {
    title,
    url: kind === "trends" ? OFFICIAL_STEAM_CHARTS_URL : OFFICIAL_STEAM_UPCOMING_URL,
    source: "Steam",
    image: image.src,
    imageAlt: image.alt
  };
}

/**
 * No unofficial or undocumented endpoint is queried. A reviewed data source
 * can later populate these arrays server-side.
 */
export async function getSteamTrends(): Promise<SteamSidebarItem[]> {
  const config = getSteamAgentConfig();
  if (!config.enabled) return [];
  const result = await getOfficialSteamTrends({
    enabled: config.trendsEnabled,
    apiKey: process.env.STEAM_WEB_API_KEY
  });
  return result.records.filter((record) => record.name).slice(0, 5).map((record) => {
    const name = record.name!;
    const image = resolveSteamImage({
      appId: Number(record.appId),
      gameTitle: name,
      category: "Steam"
    });
    return {
      appId: Number(record.appId),
      title: name,
      url: getSteamStoreUrl(record.appId),
      source: "Steam",
      image: image.src,
      imageAlt: image.alt,
      ...(record.concurrentPlayers !== undefined
        ? { valueLabel: `${record.concurrentPlayers.toLocaleString("de-DE")} gleichzeitig` }
        : {})
    };
  });
}

export async function getSteamReleases(): Promise<SteamSidebarItem[]> {
  const config = getSteamAgentConfig();
  if (!config.enabled || !config.releasesEnabled) return [];
  await getOfficialSteamReleases();
  return [];
}
