import { pathToFileURL } from "node:url";
import type { NewsSource } from "../../src/config/newsSources";
import { steamAgentConfig } from "../../src/config/steamAgent";
import { buildEditorialQueue } from "./editorialAgent";
import { runNewsScout } from "./newsScout";
import { writeEditorialReport } from "./reportWriter";
import { runSteamScout, type SteamScoutRecord } from "./steamScout";
import type { EditorialCandidate, EditorialQueueReport } from "./types";

export async function runDailyEditorialQueue(options: {
  reportDate?: string;
  rootDirectory?: string;
  newsSources?: NewsSource[];
  steamRecords?: SteamScoutRecord[];
  forceRefresh?: boolean;
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

  let steamCandidates: EditorialCandidate[] = [];
  let steamScoutStatus = steamAgentConfig.enabled
    ? "Steam-Scout aktiv, aber keine verwertbaren Daten gefunden"
    : "Steam-Scout deaktiviert: Konfiguration fehlt";
  try {
    steamCandidates = await runSteamScout(options.steamRecords ?? []);
    if (steamCandidates.length > 0) {
      steamScoutStatus =
        `Steam-Scout aktiv: ${steamCandidates.length} verwertbare offizielle Steam-Datensätze`;
    } else if (options.steamRecords !== undefined) {
      steamScoutStatus = "Steam-Scout aktiv, aber keine verwertbaren Daten gefunden";
    }
  } catch (error) {
    sourceErrors.push(
      `Steam-Scout: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`
    );
  }

  const candidates = buildEditorialQueue([
    ...newsCandidates,
    ...steamCandidates
  ]);
  const summary = {
    rssCandidates: candidates.filter((candidate) => candidate.sourceType === "rss-news").length,
    steamReleaseCandidates: candidates.filter((candidate) => candidate.sourceType === "steam-release").length,
    steamTrendCandidates: candidates.filter((candidate) => candidate.sourceType === "steam-trend").length,
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
    summary,
    safeguards: {
      automaticPublishing: false,
      automaticMainMerge: false,
      automaticImageApproval: false,
      paidAiEnabled: false
    }
  };

  await writeEditorialReport(report, options.rootDirectory);
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
