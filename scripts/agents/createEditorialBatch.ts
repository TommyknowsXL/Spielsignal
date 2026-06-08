import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isSuitablePrimarySource } from "./createEditorialDraft";
import {
  prepareEditorialAiDrafts,
  type EditorialAiDraft
} from "./providers/editorialAiProvider";
import { runFactCheck } from "./review/factCheck";
import { runImageCheck } from "./review/imageCheck";
import { runOriginalityCheck } from "./review/originalityCheck";
import { runQualityCheck } from "./review/qualityCheck";
import { runReaderInterestCheck } from "./review/readerInterestCheck";
import { runSeoCheck } from "./review/seoCheck";
import { runTechnicalCheck } from "./review/technicalCheck";
import type { DraftReviewInput, EditorialReviewResult } from "./review/types";
import type { EditorialCandidate, EditorialQueueReport } from "./types";

const MAX_BATCH_ARTICLES = 5;
const MAX_AVAILABLE_CANDIDATE_IDS = 20;
export const DEFAULT_EDITORIAL_QUEUE_PATH = "src/data/editorial/latest-queue.json";
const ARTICLE_TYPES = ["news-overview", "release-check", "free-promotion", "guide"] as const;
type BatchArticleType = (typeof ARTICLE_TYPES)[number];
export type BatchSelectionMode = "manual" | "auto-top";

export type CreateEditorialBatchOptions = {
  candidateIds?: string[];
  selectionMode?: BatchSelectionMode;
  articleTypeDefault: BatchArticleType;
  primarySourceGroups?: string[][];
  editorialNote?: string;
  maxArticles?: number;
  rootDirectory?: string;
  generatedAt?: string;
  environment?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  queuePath?: string;
};

export type BatchCandidateResult = {
  candidateId: string;
  title: string;
  articleType: BatchArticleType;
  readerInterest: EditorialReviewResult;
  reviews: Record<string, EditorialReviewResult>;
  primarySources: string[];
  imageSource: string;
  status: "draft" | "needs-source-review" | "rejected";
  filePath?: string;
  recommendation: string;
};

export type EditorialBatchResult = {
  generatedAt: string;
  reportDate: string;
  branchName: string;
  checkedCandidates: number;
  generatedDrafts: number;
  completeDrafts: number;
  rejectedCandidates: number;
  results: BatchCandidateResult[];
  reportPath: string;
  rejectedReportPath?: string;
  ai: {
    enabled: boolean;
    model: string;
    reason: string;
    errorCode?: string;
    attempts?: number;
  };
};

function slugify(value: string): string {
  return value
    .toLocaleLowerCase("de")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "artikelentwurf";
}

function uniqueUrls(values: string[]): string[] {
  return [...new Set(values.flatMap((value) => {
    try {
      const url = new URL(value.trim());
      return ["http:", "https:"].includes(url.protocol) && isSuitablePrimarySource(url.toString())
        ? [url.toString()]
        : [];
    } catch {
      return [];
    }
  }))];
}

function automaticOfficialSources(candidate: EditorialCandidate): string[] {
  if (!candidate.steamAppId) return [];
  return [
    candidate.steamStoreUrl,
    `https://store.steampowered.com/news/app/${candidate.steamAppId}/`
  ].filter((source): source is string => Boolean(source));
}

function primarySourcesFor(candidate: EditorialCandidate, supplied: string[]): string[] {
  return uniqueUrls([
    ...supplied,
    ...automaticOfficialSources(candidate),
    ...(candidate.sourceType !== "rss-news" ? [candidate.sourceUrl] : [])
  ]);
}

export function candidateDraftSlug(
  candidate: EditorialCandidate,
  articleType: BatchArticleType
): string {
  return slugify(`${candidate.gameTitle ?? candidate.title}-${articleType}`);
}

export async function loadPublishedArticleSlugs(rootDirectory = process.cwd()): Promise<Set<string>> {
  const articleDirectory = join(rootDirectory, "src", "content", "articles");
  let files: string[];
  try {
    files = await readdir(articleDirectory);
  } catch {
    return new Set();
  }
  const slugs = await Promise.all(files
    .filter((file) => file.endsWith(".md") || file.endsWith(".mdx"))
    .map(async (file) => {
      const content = await readFile(join(articleDirectory, file), "utf8");
      return content.match(/^slug:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]?.trim();
    }));
  return new Set(slugs.filter((slug): slug is string => Boolean(slug)));
}

function hasConcreteNewsEvent(candidate: EditorialCandidate): boolean {
  const haystack = [
    candidate.title,
    candidate.category,
    candidate.scoreReasons.join(" ")
  ].filter(Boolean).join(" ");
  return /\b(release|erscheint|veröffentlicht|verkaufsstart|launch|update|patch|trailer|demo|gratis|kostenlos|game pass|publisher|ankündigung|angekündigt|dlc|erweiterung)\b/i.test(haystack);
}

function autoTopPriority(candidate: EditorialCandidate): number {
  const readerInterest = runReaderInterestCheck(candidate).score;
  const rssPriority = candidate.sourceType === "rss-news" ? 30 : 0;
  const eventPriority = hasConcreteNewsEvent(candidate) ? 15 : 0;
  return readerInterest + rssPriority + eventPriority + Math.min(10, Math.max(0, candidate.score));
}

function displayQueuePath(queuePath: string, rootDirectory: string): string {
  const displayed = relative(rootDirectory, queuePath).replace(/\\/g, "/");
  return displayed && !displayed.startsWith("../") ? displayed : queuePath.replace(/\\/g, "/");
}

function availableCandidateIds(queue: EditorialQueueReport): string {
  const availableIds = queue.candidates
    .slice(0, MAX_AVAILABLE_CANDIDATE_IDS)
    .map((candidate) => `- ${candidate.id}`);
  const remaining = queue.candidates.length - availableIds.length;
  const availableText = availableIds.length
    ? availableIds.join("\n")
    : "- Keine Candidate IDs verfügbar";
  return remaining > 0
    ? `${availableText}\n- ... und ${remaining} weitere IDs`
    : availableText;
}

function missingCandidateError(
  id: string,
  queue: EditorialQueueReport,
  queuePath: string,
  rootDirectory: string
): Error {
  const safeId = id.replace(/[\r\n]/g, " ").slice(0, 120);

  return new Error(
    "Candidate ID nicht in der aktuell verwendeten Queue gefunden:\n" +
    `${safeId}\n\n` +
    `Verwendete Queue:\n${displayQueuePath(queuePath, rootDirectory)}\n\n` +
    `Queue erzeugt:\n${queue.generatedAt}\n\n` +
    "Verfügbare Candidate IDs:\n" +
    availableCandidateIds(queue)
  );
}

export async function loadEditorialQueue(
  queuePathInput = DEFAULT_EDITORIAL_QUEUE_PATH,
  rootDirectory = process.cwd()
): Promise<{ queue: EditorialQueueReport; queuePath: string }> {
  const queuePath = isAbsolute(queuePathInput)
    ? queuePathInput
    : resolve(rootDirectory, queuePathInput);
  let rawQueue: string;
  try {
    rawQueue = await readFile(queuePath, "utf8");
  } catch {
    throw new Error(`Queue-Datei nicht gefunden: ${displayQueuePath(queuePath, rootDirectory)}`);
  }

  let queue: EditorialQueueReport;
  try {
    queue = JSON.parse(rawQueue) as EditorialQueueReport;
  } catch {
    throw new Error(`Queue-Datei enthält kein valides JSON: ${displayQueuePath(queuePath, rootDirectory)}`);
  }
  if (!Array.isArray(queue.candidates) || queue.candidates.length === 0) {
    throw new Error(`Queue-Datei enthält keine Kandidaten: ${displayQueuePath(queuePath, rootDirectory)}`);
  }
  if (typeof queue.generatedAt !== "string" || !queue.generatedAt.trim()) {
    throw new Error(`Queue-Erzeugungszeitpunkt fehlt: ${displayQueuePath(queuePath, rootDirectory)}`);
  }
  return { queue, queuePath };
}

export function selectBatchCandidates(input: {
  queue: EditorialQueueReport;
  queuePath: string;
  rootDirectory: string;
  selectionMode: BatchSelectionMode;
  candidateIds?: string[];
  maxArticles: number;
  articleType?: BatchArticleType;
  publishedSlugs?: Set<string>;
}): EditorialCandidate[] {
  const articleType = input.articleType ?? "news-overview";
  const unpublishedCandidates = input.queue.candidates.filter(
    (candidate) => !input.publishedSlugs?.has(candidateDraftSlug(candidate, articleType))
  );
  if (input.selectionMode === "auto-top") {
    const selected = unpublishedCandidates
      .filter((candidate) =>
        candidate.sourceType !== "steam-top-seller" || hasConcreteNewsEvent(candidate)
      )
      .map((candidate) => ({
        candidate,
        interestScore: runReaderInterestCheck(candidate).score,
        priority: autoTopPriority(candidate)
      }))
      .filter((entry) => entry.interestScore >= 60)
      .sort((left, right) =>
        right.priority - left.priority ||
        right.interestScore - left.interestScore ||
        right.candidate.score - left.candidate.score ||
        left.candidate.id.localeCompare(right.candidate.id)
      )
      .slice(0, input.maxArticles)
      .map((entry) => entry.candidate);
    if (!selected.length) {
      throw new Error(
        `Keine geeigneten Kandidaten für auto-top in ${displayQueuePath(input.queuePath, input.rootDirectory)} gefunden.`
      );
    }
    return selected;
  }

  const candidateIds = [...new Set((input.candidateIds ?? []).map((id) => id.trim()).filter(Boolean))];
  if (!candidateIds.length) throw new Error("Im Auswahlmodus manual ist mindestens eine Candidate ID erforderlich.");
  if (candidateIds.length > MAX_BATCH_ARTICLES) throw new Error("Maximal 5 Candidate IDs sind zulässig.");
  return candidateIds.slice(0, input.maxArticles).map((id) => {
    const candidate = unpublishedCandidates.find((entry) => entry.id === id);
    if (!candidate) {
      const publishedCandidate = input.queue.candidates.find((entry) => entry.id === id);
      if (publishedCandidate && input.publishedSlugs?.has(candidateDraftSlug(publishedCandidate, articleType))) {
        throw new Error(
          `Candidate ID ist bereits als veröffentlichter Artikel vorhanden: ${id} ` +
          `(${candidateDraftSlug(publishedCandidate, articleType)})`
        );
      }
      throw missingCandidateError(id, input.queue, input.queuePath, input.rootDirectory);
    }
    return candidate;
  });
}

function sourceLabel(source: string): string {
  const host = new URL(source).hostname.replace(/^www\./, "");
  if (host.includes("steampowered.com")) return "Steam";
  if (host.includes("xbox.com")) return "Xbox";
  return host;
}

function verifiedFactsFor(candidate: EditorialCandidate): string[] {
  return [
    candidate.gameTitle ? `Spiel: ${candidate.gameTitle}` : undefined,
    candidate.steamAppId ? `Steam-App-ID: ${candidate.steamAppId}` : undefined,
    candidate.genre ? `Genre: ${candidate.genre}` : undefined,
    candidate.releaseDate ? `Offiziell dokumentiertes Release-Datum: ${candidate.releaseDate}` : undefined,
    candidate.steamRank
      ? `Zum dokumentierten Abrufzeitpunkt war das Spiel Rang ${candidate.steamRank} in den Steam-Topsellern; Rankings sind nur Momentaufnahmen.`
      : undefined,
    candidate.freePromotionConfirmed ? `Die Gratis-Aktion ist in der offiziellen Quelle bestätigt.` : undefined
  ].filter((fact): fact is string => Boolean(fact));
}

function draftSections(articleType: BatchArticleType): string {
  if (articleType === "free-promotion") {
    return `## Was ist kostenlos?

_Anhand der offiziellen Quelle ergänzen._

## Wie lange gilt die Aktion?

_Zeitraum und Bedingungen prüfen._

## Was bedeutet das für PC-Spieler?

_Konkreten Nutzen einordnen._

## Was bleibt offen?

_Nicht belegte Angaben als offen markieren._

## Unsere Einordnung

_Sachliche Einordnung ergänzen._`;
  }
  if (articleType === "guide") {
    return `## Worum geht es?

_Thema anhand offizieller Angaben einordnen._

## Die wichtigsten Schritte

_Nur belegbare, konkrete Schritte ergänzen._

## Was sollten PC-Spieler beachten?

_Voraussetzungen und offene Punkte nennen._

## Unsere Einordnung

_Sachliche Einordnung ergänzen._`;
  }
  return `## Was ist passiert?

_Ereignis ausschließlich anhand offizieller Primärquellen zusammenfassen._

## Die wichtigsten Fakten

- Offiziell bestätigte Fakten ergänzen.

## Warum ist das für PC-Spieler interessant?

_Konkreten PC-Nutzen erklären._

## Was ist offiziell bestätigt?

_Bestätigte Angaben klar von offenen Punkten trennen._

## Was bleibt offen?

_Unsichere Angaben weglassen oder als offen markieren._

## Unsere Einordnung

_Sachliche Einordnung ergänzen._`;
}

function sanitizedBody(body: string): string {
  return body
    .replace(/^\uFEFF/, "")
    .replace(/[\u00A0\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^# .+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildDraft(input: {
  candidate: EditorialCandidate;
  articleType: BatchArticleType;
  timestamp: string;
  primarySources: string[];
  aiDraft?: EditorialAiDraft;
  editorialNote?: string;
  readerInterestScore: number;
}): {
  markdown: string;
  reviewInput: DraftReviewInput;
  status: "draft" | "needs-source-review";
} {
  const candidate = input.candidate;
  const complete = Boolean(input.aiDraft && input.primarySources.length);
  const status = complete ? "draft" : "needs-source-review";
  const title = input.aiDraft?.title || `${candidate.gameTitle ?? candidate.title}: SpielSignal-Entwurf`;
  const summary = input.aiDraft?.summary || "Teaser nach Prüfung der offiziellen Primärquellen ergänzen.";
  const seoTitle = input.aiDraft?.seoTitle || `${title} | SpielSignal`;
  const seoDescription = input.aiDraft?.seoDescription || "SEO-Beschreibung nach Faktenprüfung ergänzen.";
  const slug = candidateDraftSlug(candidate, input.articleType);
  const fallbackImage = candidate.imagePath || "/images/categories/news-default.svg";
  const approvedOfficialImage = candidate.imageStatus === "approved" && candidate.imageCandidateUrl;
  const heroImage = approvedOfficialImage ? candidate.imageCandidateUrl! : fallbackImage;
  const imageSourceType = heroImage.startsWith("https://shared.fastly.steamstatic.com/")
    ? "steam-store"
    : "spielsignal-fallback";
  const body = sanitizedBody(input.aiDraft?.markdownBody || draftSections(input.articleType));
  const sourceLines = input.primarySources.length
    ? input.primarySources.map((source) => `- [${sourceLabel(source)}](${source})`).join("\n")
    : "- Offizielle Primärquelle fehlt.";
  const externalTips = candidate.sourceType === "rss-news" ? [candidate.sourceUrl] : [];
  const notes = [
    ...(input.editorialNote?.trim() ? [input.editorialNote.trim()] : []),
    ...(input.readerInterestScore < 75 ? ["Leserinteresse 60 bis 74: redaktionell prüfen."] : []),
    ...candidate.openChecks,
    ...(input.aiDraft?.warnings ?? []),
    "Vor Veröffentlichung Fakten, Bildrechte, SEO und Originalität manuell prüfen."
  ];
  const markdown = `---
title: ${JSON.stringify(title)}
slug: ${JSON.stringify(slug)}
articleType: ${JSON.stringify(input.articleType)}
status: ${JSON.stringify(status)}
createdAt: ${JSON.stringify(input.timestamp)}
updatedAt: ${JSON.stringify(input.timestamp)}
author: "SpielSignal-Redaktion"
${candidate.gameTitle ? `gameTitle: ${JSON.stringify(candidate.gameTitle)}\n` : ""}${candidate.steamAppId ? `steamAppId: ${JSON.stringify(candidate.steamAppId)}\n` : ""}tags: []
summary: ${JSON.stringify(summary)}
seoTitle: ${JSON.stringify(seoTitle)}
seoDescription: ${JSON.stringify(seoDescription)}
heroImage: ${JSON.stringify(heroImage)}
heroImageAlt: ${JSON.stringify(`Titelbild zu ${title}`)}
heroImageSourceName: ${JSON.stringify(imageSourceType === "steam-store" ? "Steam" : "SpielSignal")}
heroImageSourceType: ${JSON.stringify(imageSourceType)}
${candidate.imageSourcePageUrl ? `heroImageSourceUrl: ${JSON.stringify(candidate.imageSourcePageUrl)}\n` : ""}imageRightsStatus: ${JSON.stringify(approvedOfficialImage ? "approved" : "fallback")}
externalTipSources: ${JSON.stringify(externalTips)}
primarySources: ${JSON.stringify(input.primarySources)}
editorialNotes: ${JSON.stringify(notes)}
---

${status === "needs-source-review" ? "> **Kein fertiger Artikel: offizielle Primärquelle oder geprüfter KI-Entwurf fehlt.**\n\n" : ""}${body}

## Quellen

${sourceLines}
`;
  const readerText = `${body}\n\n## Quellen\n\n${sourceLines}`;
  const reviewInput: DraftReviewInput = {
    candidateId: candidate.id,
    title,
    articleType: input.articleType,
    markdown,
    readerText,
    primarySources: input.primarySources,
    externalTipSources: externalTips,
    imageStatus: approvedOfficialImage ? "approved" : "fallback",
    imageSourceType,
    heroImage,
    slug,
    seoTitle,
    seoDescription,
    summary,
    wordCount: readerText.trim().split(/\s+/).length,
    hasOfficialFallbackImage: heroImage.startsWith("/images/")
  };
  return { markdown, reviewInput, status };
}

function runReviews(input: DraftReviewInput): Record<string, EditorialReviewResult> {
  return {
    factCheck: runFactCheck(input),
    qualityCheck: runQualityCheck(input),
    originalityCheck: runOriginalityCheck(input),
    seoCheck: runSeoCheck(input),
    imageCheck: runImageCheck(input),
    technicalCheck: runTechnicalCheck(input)
  };
}

function fullGatePassed(reviews: Record<string, EditorialReviewResult>): boolean {
  return Object.values(reviews).every((review) => review.passed);
}

function reportMarkdown(result: EditorialBatchResult): string {
  const rows = result.results.map((entry) => {
    const failedChecks = Object.entries(entry.reviews)
      .filter(([, review]) => !review.passed)
      .map(([name]) => name)
      .join(", ") || "keine";
    return `| ${entry.candidateId} | ${entry.title.replace(/\|/g, "\\|")} | ${entry.readerInterest.score} | ${entry.status} | ${failedChecks} |`;
  }).join("\n");
  const details = result.results.map((entry) => {
    const openPoints = [
      ...entry.readerInterest.warnings,
      ...entry.readerInterest.requiredFixes,
      ...Object.values(entry.reviews).flatMap((review) => [
        ...review.warnings,
        ...review.requiredFixes
      ])
    ];
    const imageStatus = entry.imageSource.startsWith("/images/")
      ? "Hero-Bild nur Fallback"
      : entry.reviews.imageCheck?.warnings.length
        ? "manuelle Bildprüfung erforderlich"
        : "Hero-Bild bereit";
    return `### ${entry.title}

- **Candidate ID:** ${entry.candidateId}
- **Artikeltyp:** ${entry.articleType}
- **Leserinteresse-Score:** ${entry.readerInterest.score}
- **Faktenprüfung:** ${entry.reviews.factCheck?.passed ? "bestanden" : "nicht bestanden"}
- **Bildquelle:** ${entry.imageSource}
- **Bildstatus:** ${imageStatus}
- **SEO-Status:** ${entry.reviews.seoCheck?.passed ? "bestanden" : "nicht bestanden"}
- **Technische Prüfung:** ${entry.reviews.technicalCheck?.passed ? "bestanden" : "nicht bestanden"}
- **Offene Punkte:** ${openPoints.join("; ") || "Keine zusätzlichen Punkte"}
`;
  }).join("\n");
  return `# SpielSignal Editorial Batch

- **Workflow Run ID:** ${result.branchName.split("/").at(-1)}
- **Branch:** ${result.branchName}
- **Anzahl geprüfter Kandidaten:** ${result.checkedCandidates}
- **Anzahl erzeugter Drafts:** ${result.generatedDrafts}
- **Davon vollständige Drafts:** ${result.completeDrafts}
- **Anzahl abgelehnter Kandidaten:** ${result.rejectedCandidates}
- **KI-Modell:** ${result.ai.model}
- **KI-Status:** ${result.ai.reason}
- **KI-Fehlercode:** ${result.ai.errorCode ?? "keiner"}
- **KI-Versuche:** ${result.ai.attempts ?? 0}

| Candidate ID | Titel | Leserinteresse | Status | Fehlgeschlagene Checks |
| --- | --- | ---: | --- | --- |
${rows || "| - | Keine Kandidaten | 0 | rejected | - |"}

## Artikelprüfungen

${details || "Keine Artikel geprüft."}

${result.completeDrafts === 0 ? `> **Keine vollständigen Artikel erzeugt. KI-Verarbeitung fehlgeschlagen.**
> Die Gerüste dienen ausschließlich der Diagnose und dürfen nicht veröffentlicht werden.
` : ""}

## Vor Merge prüfen

- [ ] Text interessant?
- [ ] Fakten korrekt?
- [ ] Bild passend und freigegeben?
- [ ] Quellen sauber?
- [ ] Keine kopierten Formulierungen?
- [ ] Keine internen Daten sichtbar?
- [ ] Veröffentlichen, überarbeiten oder ablehnen?
`;
}

function rejectedMarkdown(result: EditorialBatchResult): string {
  const rejected = result.results.filter((entry) => entry.status === "rejected");
  return `# Abgelehnte Editorial-Kandidaten

${rejected.map((entry) => {
    const fixes = [
      ...entry.readerInterest.requiredFixes,
      ...Object.values(entry.reviews).flatMap((review) => review.requiredFixes)
    ];
    const warnings = [
      ...entry.readerInterest.warnings,
      ...Object.values(entry.reviews).flatMap((review) => review.warnings)
    ];
    return `## ${entry.title}

- **Candidate ID:** ${entry.candidateId}
- **Score:** ${entry.readerInterest.score}
- **Fehler:** ${fixes.join("; ") || "Qualitätsgate nicht bestanden"}
- **Warnungen:** ${warnings.join("; ") || "Keine"}
- **Empfehlung:** ${entry.recommendation}
`;
  }).join("\n") || "Keine abgelehnten Kandidaten.\n"}
`;
}

export async function createEditorialBatch(
  options: CreateEditorialBatchOptions
): Promise<EditorialBatchResult> {
  const rootDirectory = options.rootDirectory ?? process.cwd();
  const maxArticles = Math.max(1, Math.min(MAX_BATCH_ARTICLES, options.maxArticles ?? MAX_BATCH_ARTICLES));
  const selectionMode = options.selectionMode ?? "manual";
  if (!["manual", "auto-top"].includes(selectionMode)) {
    throw new Error(`Nicht unterstützter Auswahlmodus: ${selectionMode}`);
  }
  if (!ARTICLE_TYPES.includes(options.articleTypeDefault)) {
    throw new Error(`Nicht unterstützter Standard-Artikeltyp: ${options.articleTypeDefault}`);
  }

  const { queue, queuePath } = await loadEditorialQueue(
    options.queuePath ?? DEFAULT_EDITORIAL_QUEUE_PATH,
    rootDirectory
  );
  const publishedSlugs = await loadPublishedArticleSlugs(rootDirectory);
  const candidates = selectBatchCandidates({
    queue,
    queuePath,
    rootDirectory,
    selectionMode,
    candidateIds: options.candidateIds,
    maxArticles,
    articleType: options.articleTypeDefault,
    publishedSlugs
  });
  const timestamp = options.generatedAt ?? new Date().toISOString();
  const reportDate = timestamp.slice(0, 10);
  const runId = options.environment?.GITHUB_RUN_ID || process.env.GITHUB_RUN_ID || Date.now().toString();
  const branchName = `editorial-batch/${runId}`;
  const sourceMap = new Map(candidates.map((candidate, index) => [
    candidate.id,
    primarySourcesFor(candidate, options.primarySourceGroups?.[index] ?? [])
  ]));
  const interestMap = new Map(candidates.map((candidate) => [
    candidate.id,
    runReaderInterestCheck(candidate)
  ]));

  const aiInputs = candidates
    .filter((candidate) => (interestMap.get(candidate.id)?.score ?? 0) >= 60)
    .map((candidate) => ({
      candidate,
      articleType: options.articleTypeDefault,
      primarySources: sourceMap.get(candidate.id) ?? [],
      verifiedFacts: verifiedFactsFor(candidate),
      editorialNote: options.editorialNote
    }));
  const aiResult = await prepareEditorialAiDrafts(
    aiInputs,
    options.environment ?? process.env,
    options.fetchImpl ?? fetch
  );
  const aiDraftMap = new Map(aiResult.drafts.map((draft) => [draft.candidateId, draft]));
  const results: BatchCandidateResult[] = [];

  for (const candidate of candidates) {
    const readerInterest = interestMap.get(candidate.id)!;
    const primarySources = sourceMap.get(candidate.id) ?? [];
    if (readerInterest.score < 60) {
      results.push({
        candidateId: candidate.id,
        title: candidate.title,
        articleType: options.articleTypeDefault,
        readerInterest,
        reviews: {},
        primarySources,
        imageSource: candidate.imageSourcePageUrl ?? candidate.imagePath ?? "Kein Bild",
        status: "rejected",
        recommendation: "Thema nicht als vollständigen Artikel verfolgen."
      });
      continue;
    }

    const built = buildDraft({
      candidate,
      articleType: options.articleTypeDefault,
      timestamp,
      primarySources,
      aiDraft: aiDraftMap.get(candidate.id),
      editorialNote: options.editorialNote,
      readerInterestScore: readerInterest.score
    });
    const reviews = runReviews(built.reviewInput);
    const complete = built.status === "draft" && fullGatePassed(reviews);
    const scaffold = built.status === "needs-source-review";
    const status = complete ? "draft" : scaffold ? "needs-source-review" : "rejected";
    let filePath: string | undefined;

    if (complete || scaffold) {
      filePath = join(rootDirectory, "src", "content", "drafts", `${built.reviewInput.slug}.md`);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, built.markdown, "utf8");
    }

    results.push({
      candidateId: candidate.id,
      title: built.reviewInput.title,
      articleType: options.articleTypeDefault,
      readerInterest,
      reviews,
      primarySources,
      imageSource: candidate.imageSourcePageUrl ?? built.reviewInput.heroImage,
      status,
      filePath,
      recommendation: complete
        ? readerInterest.score < 75
          ? "Vollständigen Entwurf besonders sorgfältig redaktionell prüfen."
          : "Vollständigen Entwurf manuell prüfen."
        : scaffold
          ? "Offizielle Primärquelle und geprüfte Fakten ergänzen."
          : "Qualitätsfehler beheben, bevor ein Draft gespeichert wird."
    });
  }

  const reportDirectory = join(rootDirectory, "docs", "editorial", "batch-reports");
  await mkdir(reportDirectory, { recursive: true });
  const reportPath = join(reportDirectory, `${reportDate}-${runId}.md`);
  const rejected = results.filter((entry) => entry.status === "rejected");
  const rejectedReportPath = rejected.length
    ? join(reportDirectory, `${reportDate}-${runId}-rejected.md`)
    : undefined;
  const result: EditorialBatchResult = {
    generatedAt: timestamp,
    reportDate,
    branchName,
    checkedCandidates: results.length,
    generatedDrafts: results.filter((entry) => entry.filePath).length,
    completeDrafts: results.filter((entry) => entry.status === "draft").length,
    rejectedCandidates: rejected.length,
    results,
    reportPath,
    rejectedReportPath,
    ai: {
      enabled: aiResult.enabled,
      model: aiResult.model,
      reason: aiResult.reason,
      errorCode: aiResult.errorCode,
      attempts: aiResult.attempts
    }
  };
  await writeFile(reportPath, reportMarkdown(result), "utf8");
  if (rejectedReportPath) await writeFile(rejectedReportPath, rejectedMarkdown(result), "utf8");
  return result;
}

function parseSourceGroups(value: string): string[][] {
  return value.split(";").map((group) =>
    group.split(",").map((url) => url.trim()).filter(Boolean)
  );
}

const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  const [
    candidateInput = "",
    articleType = "news-overview",
    sourceInput = "",
    editorialNote = "",
    maxInput = "5",
    queuePath = DEFAULT_EDITORIAL_QUEUE_PATH,
    selectionMode = "manual"
  ] = process.argv.slice(2);
  const result = await createEditorialBatch({
    candidateIds: candidateInput.split(","),
    selectionMode: selectionMode as BatchSelectionMode,
    articleTypeDefault: articleType as BatchArticleType,
    primarySourceGroups: parseSourceGroups(sourceInput),
    editorialNote,
    maxArticles: Number.parseInt(maxInput, 10),
    queuePath
  });
  console.log(JSON.stringify(result, null, 2));

  if (process.env.GITHUB_OUTPUT) {
    const output = {
      branchName: result.branchName,
      reportPath: relative(process.cwd(), result.reportPath).replace(/\\/g, "/"),
      checkedCandidates: result.checkedCandidates,
      generatedDrafts: result.generatedDrafts,
      completeDrafts: result.completeDrafts,
      rejectedCandidates: result.rejectedCandidates,
      reportDate: result.reportDate,
      publicationReady: result.completeDrafts > 0
    };
    await writeFile(
      process.env.GITHUB_OUTPUT,
      `${Object.entries(output).map(([key, value]) => `${key}=${value}`).join("\n")}\n`,
      { encoding: "utf8", flag: "a" }
    );
  }
}
