import { pathToFileURL } from "node:url";
import type { NewsSource } from "../../src/config/newsSources";
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
  try {
    steamCandidates = await runSteamScout(options.steamRecords ?? []);
  } catch (error) {
    sourceErrors.push(
      `Steam-Scout: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`
    );
  }

  const candidates = buildEditorialQueue([
    ...newsCandidates,
    ...steamCandidates
  ]);
  const report: EditorialQueueReport = {
    generatedAt,
    reportDate,
    candidates,
    sourceErrors,
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
