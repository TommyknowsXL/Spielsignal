import { writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_EDITORIAL_QUEUE_PATH,
  loadEditorialQueue,
  selectBatchCandidates,
  type BatchSelectionMode
} from "./createEditorialBatch";
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

export function renderBatchQueueSummary(
  report: EditorialQueueReport,
  selectedCandidateIds: string[] = [],
  selectionMode: BatchSelectionMode = "manual"
): string {
  const candidates = report.candidates.slice(0, MAX_SUMMARY_CANDIDATES);
  const rows = candidates.length
    ? candidates.map((candidate) =>
      `| ${markdownTableValue(candidate.id)} | ${markdownTableValue(shortenedTitle(candidate.title))} | ${markdownTableValue(candidate.sourceName)} | ${markdownTableValue(candidate.articleType)} |`
    ).join("\n")
    : "| - | Keine geeigneten Kandidaten | - | - |";
  const omitted = report.candidates.length > MAX_SUMMARY_CANDIDATES
    ? `\n\nWeitere ${report.candidates.length - MAX_SUMMARY_CANDIDATES} Kandidaten sind in \`src/data/editorial/latest-queue.json\` enthalten.`
    : "";

  const selection = selectionMode === "auto-top"
    ? `\n## Automatisch ausgewählte Kandidaten\n\n${selectedCandidateIds.map((id) => `- ${markdownTableValue(id)}`).join("\n") || "- Keine"}\n`
    : "";

  return `# SpielSignal Batch-Auswahl

- **Queue erzeugt:** ${markdownTableValue(report.generatedAt)}
- **Anzahl Kandidaten:** ${report.candidates.length}

| Candidate ID | Titel | Quelle | Artikeltyp |
| --- | --- | --- | --- |
${rows}${omitted}${selection}
`;
}

export function renderBatchQueueDiagnostics(input: {
  report: EditorialQueueReport;
  queuePath: string;
  selectedCandidateIds: string[];
}): string {
  return [
    `Queue-Pfad: ${input.queuePath}`,
    `Queue-Erzeugungszeit: ${input.report.generatedAt}`,
    `Anzahl Kandidaten: ${input.report.candidates.length}`,
    `Gewählte IDs: ${input.selectedCandidateIds.join(", ")}`,
    `Verfügbare IDs: ${input.report.candidates
      .slice(0, MAX_SUMMARY_CANDIDATES)
      .map((candidate) => candidate.id)
      .join(", ")}`
  ].join("\n");
}

export async function prepareBatchQueue(input: {
  rootDirectory?: string;
  summaryPath?: string;
  outputPath?: string;
  queuePath?: string;
  selectionMode?: BatchSelectionMode;
  candidateIds?: string[];
  maxArticles?: number;
} = {}): Promise<{ selectedCandidateIds: string[]; queuePath: string; generatedAt: string; candidateCount: number }> {
  const rootDirectory = input.rootDirectory ?? process.cwd();
  const summaryPath = input.summaryPath ?? process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath?.trim()) throw new Error("GITHUB_STEP_SUMMARY ist nicht verfügbar.");
  const selectionMode = input.selectionMode ?? "manual";
  const maxArticles = Math.max(1, Math.min(5, input.maxArticles ?? 5));
  const loaded = await loadEditorialQueue(input.queuePath ?? DEFAULT_EDITORIAL_QUEUE_PATH, rootDirectory);
  const selected = selectBatchCandidates({
    queue: loaded.queue,
    queuePath: loaded.queuePath,
    rootDirectory,
    selectionMode,
    candidateIds: input.candidateIds,
    maxArticles
  });
  const selectedCandidateIds = selected.map((candidate) => candidate.id);
  await writeFile(summaryPath, renderBatchQueueSummary(loaded.queue, selectedCandidateIds, selectionMode), {
    encoding: "utf8",
    flag: "a"
  });
  if (input.outputPath?.trim()) {
    await writeFile(
      input.outputPath,
      `selectedCandidateIds=${selectedCandidateIds.join(",")}\n`,
      { encoding: "utf8", flag: "a" }
    );
  }
  const displayedQueuePath = relative(rootDirectory, loaded.queuePath).replace(/\\/g, "/");
  console.log(renderBatchQueueDiagnostics({
    report: loaded.queue,
    queuePath: displayedQueuePath,
    selectedCandidateIds
  }));
  return {
    selectedCandidateIds,
    queuePath: loaded.queuePath,
    generatedAt: loaded.queue.generatedAt,
    candidateCount: loaded.queue.candidates.length
  };
}

const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  const [
    selectionMode = "manual",
    candidateInput = "",
    maxInput = "5",
    queuePath = DEFAULT_EDITORIAL_QUEUE_PATH
  ] = process.argv.slice(2);
  await prepareBatchQueue({
    selectionMode: selectionMode as BatchSelectionMode,
    candidateIds: candidateInput.split(","),
    maxArticles: Number.parseInt(maxInput, 10),
    queuePath,
    outputPath: process.env.GITHUB_OUTPUT
  });
}
