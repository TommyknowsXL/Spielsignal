import { getSteamAgentConfig } from "../../../src/config/steamAgent";
import {
  findUniqueSteamApp,
  getSteamAppCatalog,
  type SteamCatalogApp
} from "../../../src/lib/steam/steamAppCatalog";
import { getSteamStoreUrl } from "../../../src/lib/steam/steamImageCandidateProvider";
import { getOfficialSteamReleases } from "../../../src/lib/steam/steamReleaseProvider";
import { getSteamMostPlayed } from "../../../src/lib/steam/steamMostPlayedProvider";
import { getSteamTopSellers } from "../../../src/lib/steam/steamTopSellersProvider";
import type { EditorialCandidate } from "../types";
import type { SteamScoutRecord } from "../steamScout";

export type SteamScoutProviderResult = {
  records: SteamScoutRecord[];
  appCatalog: SteamCatalogApp[];
  keyPresent: boolean;
  scoutStatus: string;
  releaseStatus: string;
  topSellerStatus: string;
  mostPlayedStatus: string;
  topSellerRegion: "DE" | "global";
  topSellerFetchedAt: string;
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
  const generatedAt = new Date().toISOString();

  if (!config.enabled) {
    return {
      records: [],
      appCatalog: [],
      keyPresent,
      scoutStatus: "Steam-Scout deaktiviert: STEAM_SCOUT_ENABLED ist nicht true",
      releaseStatus: "Steam-Releases derzeit nicht verfügbar: Steam-Scout deaktiviert",
      topSellerStatus: "Steam-Topseller derzeit nicht verfügbar: Steam-Scout deaktiviert",
      mostPlayedStatus: "Steam Most Played deaktiviert: Steam-Scout deaktiviert",
      topSellerRegion: "DE",
      topSellerFetchedAt: generatedAt
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
        status: "Steam-Releases deaktiviert: Feature-Flag ist false"
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

  const topSellerResult = await getSteamTopSellers({
    enabled: config.topSellersEnabled,
    fetchImpl: options.fetchImpl,
    cacheDirectory: options.cacheDirectory
  });
  const topSellerRecords: SteamScoutRecord[] = topSellerResult.records
    .slice(0, config.maxTopSellerCandidates)
    .map((record) => ({
      sourceType: "steam-top-seller",
      sourceName: record.sourceName,
      sourceUrl: record.steamStoreUrl,
      title: record.title,
      gameTitle: record.title,
      steamAppId: record.steamAppId,
      steamRank: record.rank,
      steamRegion: record.region,
      steamFetchedAt: record.fetchedAt,
      sourceReviewed: true
    }));

  const mostPlayedResult = await getSteamMostPlayed({
    enabled: config.mostPlayedEnabled,
    apiKey,
    fetchImpl: options.fetchImpl,
    cacheDirectory: options.cacheDirectory
  });
  const mostPlayedRecords = mostPlayedResult.records
    .flatMap((record): SteamScoutRecord[] => {
      const name =
        record.name ??
        appCatalog.find((app) => String(app.appid) === record.appId)?.name;
      if (!name) return [];
      return [{
        sourceType: "steam-most-played",
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
    })
    .slice(0, config.maxMostPlayedCandidates);

  return {
    records: [...releaseRecords, ...topSellerRecords, ...mostPlayedRecords],
    appCatalog,
    keyPresent,
    scoutStatus:
      `Steam-Scout aktiv. ${statusPart(catalogStatus)}; ${statusPart(releaseResult.status)}; ${statusPart(topSellerResult.status)}; ${statusPart(mostPlayedResult.status)}`,
    releaseStatus: releaseResult.status,
    topSellerStatus: topSellerResult.status,
    mostPlayedStatus: mostPlayedResult.status,
    topSellerRegion: topSellerResult.region,
    topSellerFetchedAt: topSellerResult.fetchedAt
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
