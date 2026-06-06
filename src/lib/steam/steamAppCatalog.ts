import { normalizeTitle } from "../../config/newsSources";
import { fetchSteamJson } from "./steamApiClient";
import {
  STEAM_APP_LIST_CACHE_TTL_MS,
  withSteamCache
} from "./steamCache";

export type SteamCatalogApp = {
  appid: number;
  name: string;
};

type StoreAppListResponse = {
  response?: {
    apps?: SteamCatalogApp[];
    more_results?: boolean;
    last_appid?: number;
  };
};

export async function getSteamAppCatalog(options: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  cacheDirectory?: string;
}): Promise<SteamCatalogApp[]> {
  return withSteamCache({
    cacheKey: "app-catalog",
    ttlMs: STEAM_APP_LIST_CACHE_TTL_MS,
    cacheDirectory: options.cacheDirectory,
    load: async () => {
      const apps: SteamCatalogApp[] = [];
      let lastAppId = 0;
      for (let page = 0; page < 4; page += 1) {
        const result = await fetchSteamJson<StoreAppListResponse>({
          path: "/IStoreService/GetAppList/v1/",
          apiKey: options.apiKey,
          fetchImpl: options.fetchImpl,
          input: {
            include_games: true,
            include_dlc: false,
            include_software: false,
            include_videos: false,
            include_hardware: false,
            last_appid: lastAppId,
            max_results: 50_000
          }
        });
        const pageApps = result.response?.apps ?? [];
        apps.push(...pageApps.filter((app) => app.appid && app.name));
        if (!result.response?.more_results || !result.response.last_appid) break;
        lastAppId = result.response.last_appid;
      }
      return apps;
    }
  });
}

export function findUniqueSteamApp(
  gameTitle: string,
  apps: SteamCatalogApp[]
): SteamCatalogApp | undefined {
  const target = normalizeTitle(gameTitle);
  const exact = apps.filter((app) => normalizeTitle(app.name) === target);
  return exact.length === 1 ? exact[0] : undefined;
}
