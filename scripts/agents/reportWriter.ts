import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EditorialCandidate, EditorialQueueReport } from "./types";

function markdownValue(value: string | undefined): string {
  return value?.trim() || "Nicht ermittelt";
}

function candidateMarkdown(candidate: EditorialCandidate, rank: number): string {
  return `## ${rank + 1}. ${candidate.title}

- **Spielname:** ${markdownValue(candidate.gameTitle)}
- **Quelle:** [${candidate.sourceName}](${candidate.sourceUrl})
- **Artikeltyp:** ${candidate.articleType}
- **Warum interessant?** ${candidate.scoreReasons.join("; ") || "Redaktionelle Prüfung erforderlich"}
- **Bildstatus:** ${candidate.imageStatus}
- **Bildquelle oder Fallback:** ${markdownValue(candidate.imageSourcePageUrl ?? candidate.imagePath)}
- **Offene Prüfung:** ${candidate.openChecks.join("; ") || "Keine zusätzliche Prüfung dokumentiert"}
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
