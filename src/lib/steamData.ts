import { resolveSteamImage } from "../config/newsImageRules";

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
  return [];
}

export async function getSteamReleases(): Promise<SteamSidebarItem[]> {
  return [];
}
