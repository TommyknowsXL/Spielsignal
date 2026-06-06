import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EditorialCandidate, EditorialQueueReport } from "./types";

function markdownValue(value: string | undefined, fallback = "Nicht ermittelt"): string {
  return value?.trim() || fallback;
}

function markdownLink(label: string, value: string | undefined): string {
  return value ? `[${label}](${value})` : "Nicht vorhanden";
}

function candidateMarkdown(candidate: EditorialCandidate, rank: number): string {
  return `## ${rank + 1}. ${candidate.title}

- **Spielname:** ${markdownValue(candidate.gameTitle)}
- **Steam-App-ID:** ${markdownValue(candidate.steamAppId)}
- **Steam-Store-Link:** ${markdownLink("Steam öffnen", candidate.steamStoreUrl)}
- **Quelle:** [${candidate.sourceName}](${candidate.sourceUrl})
- **Artikeltyp:** ${candidate.articleType}
- **Prioritätswert:** ${candidate.score}
- **Gratis-Klassifikation:** ${candidate.freeReferenceType ?? "none"} (${candidate.freePromotionConfirmed ? "bestätigt" : "nicht bestätigt"})
- **Warum interessant?** ${candidate.scoreReasons.join("; ") || "Redaktionelle Prüfung erforderlich"}
- **Bildstatus:** ${candidate.imageStatus}
- **Lokales Fallback-Bild:** ${markdownValue(candidate.imagePath)}
- **Offizieller Bildkandidat:** ${markdownValue(candidate.imageCandidateUrl, "Kein offizieller Bildkandidat gefunden")}
- **Bildquellseite:** ${markdownLink("Quellseite öffnen", candidate.imageSourcePageUrl)}
- **Offene Prüfungen:** ${candidate.openChecks.join("; ") || "Keine zusätzliche Prüfung dokumentiert"}
- **Empfohlene nächste Aktion:** ${candidate.recommendedNextAction}
`;
}

export function renderMarkdownReport(report: EditorialQueueReport): string {
  const candidates = report.candidates.length
    ? report.candidates.map(candidateMarkdown).join("\n")
    : "Keine geeigneten Kandidaten aus den aktuell zulässigen Quellen gefunden.\n";
  const errors = report.sourceErrors.length
    ? report.sourceErrors.map((error) => `- ${error}`).join("\n")
    : "- Keine Quellenfehler gemeldet.";

  return `# SpielSignal Tagesbericht: ${report.reportDate}

Erzeugt: ${report.generatedAt}

Dieser Bericht enthält ausschließlich Vorschläge. Er veröffentlicht keine Artikel, genehmigt
keine Bilder und führt keinen Merge auf \`main\` aus.

## Zusammenfassung

- **Anzahl RSS-Kandidaten:** ${report.summary.rssCandidates}
- **Anzahl Steam-Release-Kandidaten:** ${report.summary.steamReleaseCandidates}
- **Anzahl Steam-Trend-Kandidaten:** ${report.summary.steamTrendCandidates}
- **Anzahl möglicher Gratis-Aktionen:** ${report.summary.possibleFreePromotions}
- **Anzahl bestätigter Gratis-Aktionen:** ${report.summary.confirmedFreePromotions}
- **Anzahl Bildkandidaten:** ${report.summary.imageCandidates}
- **Anzahl Kandidaten nur mit Fallback:** ${report.summary.fallbackOnlyCandidates}
- **Quellenfehler:** ${report.summary.sourceErrors}
- **Steam-Scout:** ${report.steamScoutStatus}

## Quellenstatus

${errors}

## Priorisierte Vorschläge

${candidates}
`;
}

export async function writeEditorialReport(
  report: EditorialQueueReport,
  rootDirectory = process.cwd()
): Promise<{
  latestJson: string;
  archiveJson: string;
  markdownReport: string;
}> {
  const dataDirectory = join(rootDirectory, "src", "data", "editorial");
  const archiveDirectory = join(dataDirectory, "archive");
  const reportDirectory = join(rootDirectory, "docs", "editorial", "daily-reports");
  await Promise.all([
    mkdir(archiveDirectory, { recursive: true }),
    mkdir(reportDirectory, { recursive: true })
  ]);

  const latestJson = join(dataDirectory, "latest-queue.json");
  const archiveJson = join(archiveDirectory, `${report.reportDate}.json`);
  const markdownReport = join(reportDirectory, `${report.reportDate}.md`);
  const json = `${JSON.stringify(report, null, 2)}\n`;

  await Promise.all([
    writeFile(latestJson, json, "utf8"),
    writeFile(archiveJson, json, "utf8"),
    writeFile(markdownReport, renderMarkdownReport(report), "utf8")
  ]);

  return { latestJson, archiveJson, markdownReport };
}
