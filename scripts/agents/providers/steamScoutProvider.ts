import { getSteamAgentConfig } from "../../../src/config/steamAgent";
import {
  findUniqueSteamApp,
  getSteamAppCatalog,
  type SteamCatalogApp
} from "../../../src/lib/steam/steamAppCatalog";
import { getSteamStoreUrl } from "../../../src/lib/steam/steamImageCandidateProvider";
import { getOfficialSteamReleases } from "../../../src/lib/steam/steamReleaseProvider";
import { getOfficialSteamTrends } from "../../../src/lib/steam/steamTrendsProvider";
import type { EditorialCandidate } from "../types";
import type { SteamScoutRecord } from "../steamScout";

export type SteamScoutProviderResult = {
  records: SteamScoutRecord[];
  appCatalog: SteamCatalogApp[];
  keyPresent: boolean;
  scoutStatus: string;
  releaseStatus: string;
  trendStatus: string;
};

function statusPart(value: string): string {
  return value.replace(/[.;\s]+$/, "");
}

export async function collectSteamScoutData(options: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  cacheDirectory?: string;
} = {}): Promise<SteamScoutProviderResult> {
  const env = options.env ?? process.env;
  const config = getSteamAgentConfig(env);
  const apiKey = env.STEAM_WEB_API_KEY?.trim();
  const keyPresent = Boolean(apiKey);

  if (!config.enabled) {
    return {
      records: [],
      appCatalog: [],
      keyPresent,
      scoutStatus: "Steam-Scout deaktiviert: STEAM_SCOUT_ENABLED ist nicht true",
      releaseStatus: "Steam-Releases derzeit nicht verfügbar: Steam-Scout deaktiviert",
      trendStatus: "Steam-Trends derzeit nicht verfügbar: Steam-Scout deaktiviert"
    };
  }

  let appCatalog: SteamCatalogApp[] = [];
  let catalogStatus = keyPresent
    ? "Steam-App-Katalog noch nicht geladen"
    : "Steam-App-Katalog nicht verfügbar: API-Key fehlt";
  if (apiKey) {
    try {
      appCatalog = await getSteamAppCatalog({
        apiKey,
        fetchImpl: options.fetchImpl,
        cacheDirectory: options.cacheDirectory
      });
      catalogStatus = `Steam-App-Katalog aktiv: ${appCatalog.length} Einträge`;
    } catch (error) {
      catalogStatus =
        `Steam-App-Katalog nicht verfügbar: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`;
    }
  }

  const releaseResult = config.releasesEnabled
    ? await getOfficialSteamReleases()
    : {
        records: [] as [],
        status: "Steam-Releases deaktiviert: Feature-Flag fehlt"
      };
  const releaseRecords: SteamScoutRecord[] = releaseResult.records.map(
    (record) => ({
      sourceType: "steam-release",
      sourceName: "Steam",
      sourceUrl: record.storeUrl,
      title: record.name,
      gameTitle: record.name,
      steamAppId: record.appId,
      releaseDate: record.releaseDate,
      genre: record.genre,
      sourceReviewed: true
    })
  );
  const trendResult = await getOfficialSteamTrends({
    enabled: config.trendsEnabled,
    apiKey,
    fetchImpl: options.fetchImpl,
    cacheDirectory: options.cacheDirectory
  });
  const trendRecords = trendResult.records
    .flatMap((record): SteamScoutRecord[] => {
      const name =
        record.name ??
        appCatalog.find((app) => String(app.appid) === record.appId)?.name;
      if (!name) return [];
      return [{
        sourceType: "steam-trend",
        sourceName: "Steam",
        sourceUrl: getSteamStoreUrl(record.appId),
        title: name,
        gameTitle: name,
        steamAppId: record.appId,
        ...(record.concurrentPlayers !== undefined
          ? { concurrentPlayers: record.concurrentPlayers }
          : {}),
        sourceReviewed: true
      }];
    });

  return {
    records: [...releaseRecords, ...trendRecords],
    appCatalog,
    keyPresent,
    scoutStatus:
      `Steam-Scout aktiv. ${statusPart(catalogStatus)}; ${statusPart(releaseResult.status)}; ${statusPart(trendResult.status)}`,
    releaseStatus: releaseResult.status,
    trendStatus: trendResult.status
  };
}

export function enrichRssCandidatesWithSteam(
  candidates: EditorialCandidate[],
  appCatalog: SteamCatalogApp[]
): EditorialCandidate[] {
  if (appCatalog.length === 0) return candidates;
  return candidates.map((candidate) => {
    if (!candidate.gameTitle || candidate.steamAppId) return candidate;
    const app = findUniqueSteamApp(candidate.gameTitle, appCatalog);
    if (!app) return candidate;
    const steamAppId = String(app.appid);
    const steamStoreUrl = getSteamStoreUrl(steamAppId);
    return {
      ...candidate,
      steamAppId,
      steamStoreUrl,
      imageStatus: "pending-review",
      imageCandidateUrl:
        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`,
      imageSourcePageUrl: steamStoreUrl,
      imageSourceType: "steam-store",
      rightsNotes:
        "Eindeutiger Treffer im offiziellen Steam-App-Katalog; Store-Bild und Nutzungsgrundlage vor Veröffentlichung manuell prüfen.",
      openChecks: [
        ...candidate.openChecks,
        "Steam-App-ID und Store-Zuordnung redaktionell bestätigen.",
        "Offiziellen Steam-Bildkandidaten manuell freigeben."
      ]
    };
  });
}
