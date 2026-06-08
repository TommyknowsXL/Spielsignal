import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { EditorialQueueReport } from "./types";

const MAX_SUMMARY_CANDIDATES = 20;
const MAX_TITLE_LENGTH = 80;

function markdownTableValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function shortenedTitle(title: string): string {
  const normalized = title.replace(/\s+/g, " ").trim();
  return normalized.length <= MAX_TITLE_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_TITLE_LENGTH - 3).trimEnd()}...`;
}

export function renderBatchQueueSummary(report: EditorialQueueReport): string {
  const candidates = report.candidates.slice(0, MAX_SUMMARY_CANDIDATES);
  const rows = candidates.length
    ? candidates.map((candidate) =>
      `| ${markdownTableValue(candidate.id)} | ${markdownTableValue(shortenedTitle(candidate.title))} | ${markdownTableValue(candidate.sourceName)} | ${markdownTableValue(candidate.articleType)} |`
    ).join("\n")
    : "| - | Keine geeigneten Kandidaten | - | - |";
  const omitted = report.candidates.length > MAX_SUMMARY_CANDIDATES
    ? `\n\nWeitere ${report.candidates.length - MAX_SUMMARY_CANDIDATES} Kandidaten sind in \`src/data/editorial/latest-queue.json\` enthalten.`
    : "";

  return `# SpielSignal Batch-Auswahl

- **Datum:** ${markdownTableValue(report.reportDate)}
- **Anzahl Kandidaten:** ${report.candidates.length}

| Candidate ID | Titel | Quelle | Artikeltyp |
| --- | --- | --- | --- |
${rows}${omitted}
`;
}

export async function writeBatchQueueSummary(
  rootDirectory = process.cwd(),
  summaryPath = process.env.GITHUB_STEP_SUMMARY
): Promise<boolean> {
  if (!summaryPath?.trim()) return false;
  const queuePath = join(rootDirectory, "src", "data", "editorial", "latest-queue.json");
  const report = JSON.parse(await readFile(queuePath, "utf8")) as EditorialQueueReport;
  await writeFile(summaryPath, renderBatchQueueSummary(report), {
    encoding: "utf8",
    flag: "a"
  });
  return true;
}

const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  const written = await writeBatchQueueSummary();
  if (!written) throw new Error("GITHUB_STEP_SUMMARY ist nicht verfügbar.");
}
