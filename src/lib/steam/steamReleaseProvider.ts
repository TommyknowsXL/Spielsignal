import {
  STEAM_RELEASE_CACHE_TTL_MS,
  withSteamCache
} from "./steamCache";

export type OfficialSteamReleaseRecord = {
  appId: string;
  name: string;
  releaseDate?: string;
  genre?: string;
  storeUrl: string;
};

export type SteamReleaseProviderResult = {
  records: OfficialSteamReleaseRecord[];
  status: string;
};

function isUsefulBaseGame(record: OfficialSteamReleaseRecord): boolean {
  return (
    /^\d+$/.test(record.appId) &&
    record.storeUrl.startsWith("https://store.steampowered.com/app/") &&
    !/\b(dlc|soundtrack|season pass|artbook|add-on|expansion pack)\b/i.test(
      `${record.name} ${record.genre ?? ""}`
    )
  );
}

export async function getOfficialSteamReleases(options: {
  loadOfficialSource?: () => Promise<OfficialSteamReleaseRecord[]>;
  cacheDirectory?: string;
} = {}): Promise<SteamReleaseProviderResult> {
  if (!options.loadOfficialSource) {
    return {
      records: [],
      status:
        "Steam-Releases derzeit nicht verfügbar: Die dokumentierte Steam Web API bietet keinen stabilen öffentlichen Release-Feed."
    };
  }

  try {
    const records = await withSteamCache({
      cacheKey: "releases",
      ttlMs: STEAM_RELEASE_CACHE_TTL_MS,
      cacheDirectory: options.cacheDirectory,
      load: options.loadOfficialSource
    });
    const selected = records
      .filter(isUsefulBaseGame)
      .sort((left, right) =>
        (right.releaseDate ?? "").localeCompare(left.releaseDate ?? "")
      )
      .slice(0, 5);
    return {
      records: selected,
      status: selected.length
        ? `Steam-Releases aktiv: ${selected.length} offizielle Datensätze`
        : "Steam-Releases derzeit nicht verfügbar: Quelle lieferte keine verwertbaren Basisspiele"
    };
  } catch (error) {
    return {
      records: [],
      status:
        `Steam-Releases derzeit nicht verfügbar: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`
    };
  }
}

export { STEAM_RELEASE_CACHE_TTL_MS };
