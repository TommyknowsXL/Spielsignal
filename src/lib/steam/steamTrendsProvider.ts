import { fetchSteamJson } from "./steamApiClient";
import {
  STEAM_TREND_CACHE_TTL_MS,
  withSteamCache
} from "./steamCache";

export type SteamMostPlayedRecord = {
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

export async function getSteamMostPlayed(options: {
  enabled: boolean;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  cacheDirectory?: string;
}): Promise<{ records: SteamMostPlayedRecord[]; status: string }> {
  if (!options.enabled) {
    return {
      records: [],
      status: "Steam Most Played deaktiviert: Feature-Flag ist false"
    };
  }
  if (!options.apiKey) {
    return {
      records: [],
      status: "Steam Most Played derzeit nicht verfügbar: API-Key fehlt"
    };
  }

  try {
    const records = await withSteamCache({
      cacheKey: "most-played",
      ttlMs: STEAM_TREND_CACHE_TTL_MS,
      cacheDirectory: options.cacheDirectory,
      useStaleOnError: true,
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
          .map((entry): SteamMostPlayedRecord | undefined => {
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
          .filter((record): record is SteamMostPlayedRecord => Boolean(record))
          .slice(0, 5);
      }
    });
    return {
      records,
      status: records.length
        ? `Steam Most Played aktiv: ${records.length} offizielle Datensätze`
        : "Steam Most Played derzeit nicht verfügbar: API lieferte keine verwertbaren Daten"
    };
  } catch (error) {
    return {
      records: [],
      status:
        `Steam Most Played derzeit nicht verfügbar: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`
    };
  }
}

// Compatibility aliases for existing imports while the public meaning of
// "Steam-Trends" now belongs exclusively to the top-seller provider.
export const getOfficialSteamTrends = getSteamMostPlayed;
export type SteamTrendRecord = SteamMostPlayedRecord;
export { STEAM_TREND_CACHE_TTL_MS };
