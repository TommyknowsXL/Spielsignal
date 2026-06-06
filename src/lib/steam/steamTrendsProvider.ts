import { fetchSteamJson } from "./steamApiClient";
import {
  STEAM_TREND_CACHE_TTL_MS,
  withSteamCache
} from "./steamCache";

export type SteamTrendRecord = {
  appId: string;
  name?: string;
  concurrentPlayers?: number;
};

type SteamChartsResponse = {
  response?: {
    ranks?: Array<{
      rank?: number;
      appid?: number;
      concurrent_in_game?: number;
      item?: {
        id?: number;
        name?: string;
      };
    }>;
  };
};

export async function getOfficialSteamTrends(options: {
  enabled: boolean;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  cacheDirectory?: string;
}): Promise<{ records: SteamTrendRecord[]; status: string }> {
  if (!options.enabled) {
    return { records: [], status: "Steam-Trends deaktiviert: Feature-Flag fehlt" };
  }
  if (!options.apiKey) {
    return { records: [], status: "Steam-Trends derzeit nicht verfügbar: API-Key fehlt" };
  }

  try {
    const records = await withSteamCache({
      cacheKey: "trends",
      ttlMs: STEAM_TREND_CACHE_TTL_MS,
      cacheDirectory: options.cacheDirectory,
      load: async () => {
        const result = await fetchSteamJson<SteamChartsResponse>({
          path: "/ISteamChartsService/GetMostPlayedGames/v1/",
          apiKey: options.apiKey!,
          fetchImpl: options.fetchImpl,
          input: {
            context: { language: "german", country_code: "DE" },
            data_request: { include_basic_info: true }
          }
        });
        return (result.response?.ranks ?? [])
          .map((entry): SteamTrendRecord | undefined => {
            const appId = entry.appid ?? entry.item?.id;
            const name = entry.item?.name;
            if (!appId) return undefined;
            return {
              appId: String(appId),
              ...(name ? { name } : {}),
              ...(Number.isFinite(entry.concurrent_in_game)
                ? { concurrentPlayers: entry.concurrent_in_game }
                : {})
            };
          })
          .filter((record): record is SteamTrendRecord => Boolean(record))
          .slice(0, 5);
      }
    });
    return {
      records,
      status: records.length
        ? `Steam-Trends aktiv: ${records.length} offizielle Datensätze`
        : "Steam-Trends derzeit nicht verfügbar: API lieferte keine verwertbaren Daten"
    };
  } catch (error) {
    return {
      records: [],
      status:
        `Steam-Trends derzeit nicht verfügbar: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`
    };
  }
}

export { STEAM_TREND_CACHE_TTL_MS };
