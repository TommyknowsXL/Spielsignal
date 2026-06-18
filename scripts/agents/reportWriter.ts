import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EditorialCandidate, EditorialQueueReport } from "./types";

function markdownValue(value: string | undefined, fallback = "Nicht ermittelt"): string {
  return value?.trim() || fallback;
}

function markdownLink(label: string, value: string | undefined): string {
  return value ? `[${label}](${value})` : "Nicht vorhanden";
}

function markdownTableValue(value: string): string {
  return value
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function candidateMarkdown(candidate: EditorialCandidate, rank: number): string {
  return `## ${rank + 1}. ${candidate.title}

- **Spielname:** ${markdownValue(candidate.gameTitle)}
- **Candidate ID:** ${candidate.id}
- **Steam-App-ID:** ${markdownValue(candidate.steamAppId)}
- **Steam-Store-Link:** ${markdownLink("Steam öffnen", candidate.steamStoreUrl)}
- **Quelle:** [${candidate.sourceName}](${candidate.sourceUrl})
- **Cluster:** ${candidate.clusterId ?? candidate.id}
- **Klassifikation:** ${candidate.topicClassification ?? "general-news"}
- **Cluster-Quellen:** ${(candidate.clusterSourceNames ?? [candidate.sourceName]).join(", ")}
- **Unabhaengige Quellen:** ${candidate.independentSourceCount ?? 1}
- **Offizielle Primaerquelle im Cluster:** ${candidate.officialPrimarySourceUrl ? markdownLink("oeffnen", candidate.officialPrimarySourceUrl) : "Nein"}
- **Artikeltyp:** ${candidate.articleType}
- **Prioritätswert:** ${candidate.score}
- **Gratis-Klassifikation:** ${candidate.freeReferenceType ?? "none"} (${candidate.freePromotionConfirmed ? "bestätigt" : "nicht bestätigt"})
- **Warum interessant?** ${candidate.scoreReasons.join("; ") || "Redaktionelle Prüfung erforderlich"}
- **Bildstatus:** ${candidate.imageStatus}
- **Bildfreigabestatus:** ${candidate.imageStatus}
- **Bildquellentyp:** ${candidate.imageSourceType ?? "Nicht vorhanden"}
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
  const sourceDiagnostics = report.sourceDiagnostics
    ? `## Quellen-Diagnose

- **Abgefragte Quellen:** ${report.sourceDiagnostics.requested.join(", ") || "Keine"}
- **Erfolgreiche Quellen:** ${report.sourceDiagnostics.successful.join(", ") || "Keine"}
- **Fehlerhafte Quellen:** ${report.sourceDiagnostics.failed.join("; ") || "Keine"}
- **Kandidaten je Quelle:** ${Object.entries(report.sourceDiagnostics.candidatesBySource).map(([name, count]) => `${name}: ${count}`).join("; ") || "Keine"}

## Themencluster

${report.sourceDiagnostics.clusters.length ? report.sourceDiagnostics.clusters.map((cluster) => `- **${cluster.title}** (${cluster.classification}, Score ${cluster.score}): ${cluster.independentSourceCount} unabhaengige Quelle(n), Primaerquelle ${cluster.officialPrimarySourceUrl ? "gefunden" : "nicht erkannt"}, ausgewaehlt: ${cluster.selected ? "ja" : "nein"}; ${cluster.reason}`).join("\n") : "- Keine Cluster gebildet."}
`
    : "";

  const markdown = `# SpielSignal Tagesauswahl

**Datum:** ${report.reportDate}

Erzeugt: ${report.generatedAt}

Dieser Bericht enthält ausschließlich Vorschläge. Er veröffentlicht keine Artikel, genehmigt
keine Bilder und führt keinen Merge auf \`main\` aus.

## Zusammenfassung

- **Anzahl RSS-Kandidaten:** ${report.summary.rssCandidates}
- **Anzahl Steam-Release-Kandidaten:** ${report.summary.steamReleaseCandidates}
- **Anzahl Steam-Topseller-Kandidaten:** ${report.summary.steamTopSellerCandidates}
- **Anzahl Steam-Most-Played-Kandidaten:** ${report.summary.steamMostPlayedCandidates}
- **Anzahl RSS-Kandidaten mit Steam-App-ID:** ${report.summary.rssCandidatesWithSteamAppId}
- **Anzahl offizieller Steam-Bildkandidaten:** ${report.summary.officialSteamImageCandidates}
- **Anzahl möglicher Gratis-Aktionen:** ${report.summary.possibleFreePromotions}
- **Anzahl bestätigter Gratis-Aktionen:** ${report.summary.confirmedFreePromotions}
- **Anzahl Bildkandidaten:** ${report.summary.imageCandidates}
- **Anzahl Kandidaten nur mit Fallback:** ${report.summary.fallbackOnlyCandidates}
- **Quellenfehler:** ${report.summary.sourceErrors}
- **Abgefragte Quellen:** ${report.summary.sourceCount}
- **Erfolgreiche Quellen:** ${report.summary.successfulSources}
- **Fehlerhafte Quellen:** ${report.summary.failedSources}
- **Eingangskandidaten vor Auswahl:** ${report.summary.inputCandidates}
- **Themencluster:** ${report.summary.clusterCount}
- **Cluster mit offizieller Primaerquelle:** ${report.summary.officialPrimarySourceClusters}
- **Cluster mit mehreren Fachmedien:** ${report.summary.multiSourceClusters}
- **Ausgeschlossene Kolumnen/Meinungen:** ${report.summary.excludedColumns}
- **Ausgeschlossene Specials/Listicles:** ${report.summary.excludedSpecialsListicles}
- **Ausgeschlossene Paywall-Inhalte:** ${report.summary.excludedPaywalled}
- **Ausgeschlossene Steam-Rankings ohne Anlass:** ${report.summary.excludedSteamRankingsWithoutNews}
- **Steam-Scout:** ${report.steamScoutStatus}
- **Steam-API-Key vorhanden:** ${report.steamApiKeyPresent ? "ja" : "nein"}
- **Steam-Releases:** ${report.steamReleaseStatus}
- **Steam-Topseller:** ${report.steamTopSellerStatus}
- **Steam-Most-Played:** ${report.steamMostPlayedStatus}
- **Steam-Topseller-Region:** ${report.steamTopSellerRegion}
- **Steam-Topseller-Abrufzeit:** ${report.steamTopSellerFetchedAt}
- **Steam-Topseller-Quelle:** ${report.steamTopSellerSource}

## Quellenstatus

${errors}

${sourceDiagnostics}

## Priorisierte Vorschläge

${candidates}
`;
  return `${markdown.trimEnd()}\n`;
}

export function renderGitHubSummary(report: EditorialQueueReport): string {
  const steamCandidates =
    report.summary.steamReleaseCandidates +
    report.summary.steamTopSellerCandidates +
    report.summary.steamMostPlayedCandidates +
    report.candidates.filter(
      (candidate) => candidate.sourceType === "free-promotion"
    ).length;
  const topCandidates = report.candidates.slice(0, 10);
  const candidateRows = topCandidates.length
    ? topCandidates
        .map(
          (candidate) =>
            `| ${markdownTableValue(candidate.id)} | ${markdownTableValue(candidate.title)} | ${markdownTableValue(candidate.sourceName)} | ${markdownTableValue(candidate.articleType)} |`
        )
        .join("\n")
    : "| - | Keine geeigneten Kandidaten | - | - |";

  return `# SpielSignal Tagesauswahl

- **Datum:** ${report.reportDate}
- **Anzahl RSS-Kandidaten:** ${report.summary.rssCandidates}
- **Anzahl Steam-Kandidaten:** ${steamCandidates}
- **Anzahl Bildkandidaten:** ${report.summary.imageCandidates}
- **Quellenfehler:** ${report.summary.sourceErrors}

## Top-Kandidaten

| Candidate ID | Titel | Quelle | Artikeltyp |
| --- | --- | --- | --- |
${candidateRows}

> Diese Liste enthält ausschließlich redaktionelle Vorschläge. Es werden keine Artikel veröffentlicht oder nach \`main\` gemergt.
`;
}

export async function writeGitHubSummary(
  report: EditorialQueueReport,
  summaryPath: string | undefined
): Promise<boolean> {
  if (!summaryPath?.trim()) return false;
  await writeFile(summaryPath, renderGitHubSummary(report), "utf8");
  return true;
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
