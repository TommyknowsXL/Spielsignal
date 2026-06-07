import { pathToFileURL } from "node:url";
import type { NewsSource } from "../../src/config/newsSources";
import { buildEditorialQueue } from "./editorialAgent";
import { runNewsScout } from "./newsScout";
import {
  collectSteamScoutData,
  enrichRssCandidatesWithSteam
} from "./providers/steamScoutProvider";
import {
  writeEditorialReport,
  writeGitHubSummary
} from "./reportWriter";
import { runSteamScout, type SteamScoutRecord } from "./steamScout";
import type { EditorialCandidate, EditorialQueueReport } from "./types";

export async function runDailyEditorialQueue(options: {
  reportDate?: string;
  rootDirectory?: string;
  newsSources?: NewsSource[];
  steamRecords?: SteamScoutRecord[];
  forceRefresh?: boolean;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  steamCacheDirectory?: string;
} = {}): Promise<EditorialQueueReport> {
  const generatedAt = new Date().toISOString();
  const reportDate = options.reportDate ?? generatedAt.slice(0, 10);
  const sourceErrors: string[] = [];

  let newsCandidates: EditorialCandidate[] = [];
  try {
    const newsResult = await runNewsScout({
      sources: options.newsSources,
      forceRefresh: options.forceRefresh
    });
    newsCandidates = newsResult.candidates;
    sourceErrors.push(
      ...newsResult.statuses
        .filter((status) => !status.ok)
        .map(
          (status) =>
            `${status.name}: ${status.error ?? "Quelle konnte nicht verarbeitet werden."}`
        )
    );
  } catch (error) {
    sourceErrors.push(
      `News-Scout: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`
    );
  }
  const steamProvider = await collectSteamScoutData({
    env: options.env,
    fetchImpl: options.fetchImpl,
    cacheDirectory: options.steamCacheDirectory
  });
  newsCandidates = enrichRssCandidatesWithSteam(
    newsCandidates,
    steamProvider.appCatalog
  );

  let steamCandidates: EditorialCandidate[] = [];
  try {
    steamCandidates = await runSteamScout([
      ...steamProvider.records,
      ...(options.steamRecords ?? [])
    ]);
  } catch (error) {
    sourceErrors.push(
      `Steam-Scout: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`
    );
  }
  const steamScoutStatus = steamCandidates.length > 0
    ? `${steamProvider.scoutStatus} ${steamCandidates.length} verwertbare Steam-Kandidaten übernommen.`
    : steamProvider.scoutStatus;

  const candidates = buildEditorialQueue([
    ...newsCandidates,
    ...steamCandidates
  ]);
  const summary = {
    rssCandidates: candidates.filter((candidate) => candidate.sourceType === "rss-news").length,
    steamReleaseCandidates: candidates.filter((candidate) => candidate.sourceType === "steam-release").length,
    steamTopSellerCandidates: candidates.filter(
      (candidate) => candidate.sourceType === "steam-top-seller"
    ).length,
    steamMostPlayedCandidates: candidates.filter(
      (candidate) => candidate.sourceType === "steam-most-played"
    ).length,
    possibleFreePromotions: candidates.filter(
      (candidate) =>
        candidate.freeReferenceType &&
        candidate.freeReferenceType !== "none" &&
        !candidate.freePromotionConfirmed
    ).length,
    confirmedFreePromotions: candidates.filter(
      (candidate) => candidate.freePromotionConfirmed
    ).length,
    imageCandidates: candidates.filter((candidate) => candidate.imageCandidateUrl).length,
    rssCandidatesWithSteamAppId: candidates.filter(
      (candidate) => candidate.sourceType === "rss-news" && candidate.steamAppId
    ).length,
    officialSteamImageCandidates: candidates.filter(
      (candidate) =>
        candidate.imageSourceType === "steam-store" &&
        candidate.imageCandidateUrl
    ).length,
    fallbackOnlyCandidates: candidates.filter(
      (candidate) => candidate.imageStatus === "fallback"
    ).length,
    sourceErrors: sourceErrors.length
  };
  const report: EditorialQueueReport = {
    generatedAt,
    reportDate,
    candidates,
    sourceErrors,
    steamScoutStatus,
    steamReleaseStatus: steamProvider.releaseStatus,
    steamTopSellerStatus: steamProvider.topSellerStatus,
    steamMostPlayedStatus: steamProvider.mostPlayedStatus,
    steamTopSellerRegion: steamProvider.topSellerRegion,
    steamTopSellerFetchedAt: steamProvider.topSellerFetchedAt,
    steamTopSellerSource: "Steam",
    steamApiKeyPresent: steamProvider.keyPresent,
    summary,
    safeguards: {
      automaticPublishing: false,
      automaticMainMerge: false,
      automaticImageApproval: false,
      paidAiEnabled: false
    }
  };

  await writeEditorialReport(report, options.rootDirectory);
  const summaryPath =
    options.env?.GITHUB_STEP_SUMMARY ?? process.env.GITHUB_STEP_SUMMARY;
  const summaryWritten = await writeGitHubSummary(report, summaryPath);
  const runningInGitHubActions =
    (options.env?.GITHUB_ACTIONS ?? process.env.GITHUB_ACTIONS) === "true";
  if (runningInGitHubActions && !summaryWritten) {
    throw new Error(
      "GITHUB_STEP_SUMMARY ist im GitHub-Actions-Lauf nicht verfügbar."
    );
  }
  return report;
}

const executedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (executedDirectly) {
  const report = await runDailyEditorialQueue({ forceRefresh: true });
  console.log(
    `Tagesqueue ${report.reportDate}: ${report.candidates.length} Vorschläge, ${report.sourceErrors.length} Quellenhinweise.`
  );
}
