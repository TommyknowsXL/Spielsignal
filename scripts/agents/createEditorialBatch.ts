import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isSuitablePrimarySource } from "./createEditorialDraft";
import {
  prepareEditorialAiDrafts,
  prepareReaderEditedDrafts,
  type EditorialAiDraft
} from "./providers/editorialAiProvider";
import {
  findOfficialPrimarySources,
  type OfficialPrimarySource,
  type VerifiedFact
} from "./sources/findOfficialPrimarySources";
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
  sourceFetchImpl?: typeof fetch;
  queuePath?: string;
};

export type BatchCandidateResult = {
  candidateId: string;
  title: string;
  articleType: BatchArticleType;
  readerInterest: EditorialReviewResult;
  reviews: Record<string, EditorialReviewResult>;
  primarySources: string[];
  foundPrimarySourceUrls: string[];
  verifiedPrimarySourceUrls: string[];
  foundPrimarySources: number;
  verifiedPrimarySources: number;
  steamAppId?: string;
  heroImageStatus: string;
  sourceGatePassed: boolean;
  aiInvoked: boolean;
  aiResult: string;
  readerEditResult: string;
  imageSource: string;
  status: "draft" | "needs-source-review" | "rejected";
  filePath?: string;
  articlePath?: string;
  previewPath?: string;
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

type EnrichedCandidateSources = {
  candidate: EditorialCandidate;
  sources: OfficialPrimarySource[];
  verifiedFacts: VerifiedFact[];
};

function sourceTypeForUrl(url: string): OfficialPrimarySource["sourceType"] {
  const parsed = new URL(url);
  if (parsed.hostname.includes("steampowered.com") && parsed.pathname.startsWith("/app/")) {
    return "steam-store";
  }
  if (parsed.hostname.includes("steampowered.com") && parsed.pathname.startsWith("/news/app/")) {
    return "steam-news-hub";
  }
  if (parsed.hostname.includes("xbox.com")) return "official-xbox-page";
  if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) {
    return "official-trailer";
  }
  if (/patch|update|changelog|release-notes/i.test(parsed.pathname)) return "official-patchnotes";
  return "official-developer-site";
}

function suppliedOfficialSources(
  values: string[],
  verified: boolean
): OfficialPrimarySource[] {
  return uniqueUrls(values).map((url) => ({
    url,
    sourceType: sourceTypeForUrl(url),
    sourceName: sourceLabel(url),
    verified,
    confidence: verified ? 0.9 : 0.5,
    discoveredVia: verified ? "trusted-official-provider" : "manual-workflow-input-pending-verification"
  }));
}

async function enrichCandidateSources(
  candidate: EditorialCandidate,
  supplied: string[],
  fetchImpl: typeof fetch
): Promise<EnrichedCandidateSources> {
  const discovered = await findOfficialPrimarySources({
    candidateId: candidate.id,
    title: candidate.title,
    gameTitle: candidate.gameTitle,
    steamAppId: candidate.steamAppId,
    sourceUrl: candidate.sourceUrl
  }, { fetchImpl });
  const manualSources = suppliedOfficialSources(supplied, false);
  const nonRssSource = candidate.sourceType !== "rss-news"
    ? suppliedOfficialSources([candidate.sourceUrl], true)
    : [];
  const sources = [...discovered.sources, ...manualSources, ...nonRssSource]
    .filter((source, index, all) =>
      all.findIndex((entry) => entry.url.replace(/\/$/, "") === source.url.replace(/\/$/, "")) === index
    );
  const verifiedSource = sources.find((source) => source.verified);
  const fallbackFacts: VerifiedFact[] = [];
  if (verifiedSource && candidate.sourceType !== "rss-news" && candidate.genre) {
    fallbackFacts.push({
      statement: `Das Spiel ist der Kategorie ${candidate.genre} zugeordnet.`,
      sourceUrl: verifiedSource.url,
      sourceType: verifiedSource.sourceType,
      confidence: 0.75
    });
  }
  if (verifiedSource && candidate.sourceType !== "rss-news" && candidate.releaseDate) {
    fallbackFacts.push({
      statement: `Das dokumentierte Release-Datum ist ${candidate.releaseDate}.`,
      sourceUrl: verifiedSource.url,
      sourceType: verifiedSource.sourceType,
      confidence: 0.85
    });
  }
  const enrichedCandidate: EditorialCandidate = {
    ...candidate,
    gameTitle: discovered.gameTitle ?? candidate.gameTitle,
    steamAppId: discovered.steamAppId ?? candidate.steamAppId,
    steamStoreUrl: discovered.steamAppId
      ? `https://store.steampowered.com/app/${discovered.steamAppId}/`
      : candidate.steamStoreUrl,
    imageStatus: candidate.imageStatus === "approved"
      ? "approved"
      : discovered.imageCandidateUrl
        ? "pending-review"
        : candidate.imageStatus,
    imageCandidateUrl: discovered.imageCandidateUrl ?? candidate.imageCandidateUrl,
    imageSourcePageUrl: discovered.imageSourcePageUrl ?? candidate.imageSourcePageUrl,
    imageSourceType: discovered.imageCandidateUrl ? "steam-store" : candidate.imageSourceType,
    rightsNotes: discovered.imageCandidateUrl
      ? "Offizieller Steam-Store-Bildkandidat; vor Veröffentlichung manuell prüfen."
      : candidate.rightsNotes
  };
  return {
    candidate: enrichedCandidate,
    sources,
    verifiedFacts: [...discovered.verifiedFacts, ...fallbackFacts]
  };
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
  const normalized = body
    .replace(/^\uFEFF/, "")
    .replace(/[\u00A0\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^# .+$/gm, "")
    .replace(/^## Quellen[\s\S]*$/im, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const forbidden = [
    /Für Berichterstattung oder weitere Analyse sollten Redaktion und Leser/i,
    /in den verifizierten Fakten/i,
    /bereitgestellte Quellen/i,
    /Redaktioneller Hinweis/i,
    /dieser Text basiert ausschließlich/i,
    /\bSteam-App-ID\b/i
  ];
  return normalized
    .split(/\n{2,}/)
    .filter((block) => !forbidden.some((pattern) => pattern.test(block)))
    .join("\n\n")
    .trim();
}

function contentBlocksFor(body: string): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const lines = body.split("\n");
  let paragraph: string[] = [];
  let list: string[] = [];
  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: "list", items: list });
    list = [];
  };
  for (const line of lines) {
    const heading = line.match(/^(##|###)\s+(.+)$/);
    const item = line.match(/^-\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1] === "##" ? 2 : 3, text: heading[2].trim() });
    } else if (item) {
      flushParagraph();
      list.push(item[1].trim());
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  const firstParagraph = blocks.findIndex((block) => block.type === "paragraph");
  if (firstParagraph >= 0) {
    blocks.splice(firstParagraph + 1, 0, { type: "ad", slot: "article-inline-1" });
  }
  return blocks;
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
  const contentBlocks = contentBlocksFor(body);
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
${candidate.imageCandidateUrl && candidate.imageStatus !== "approved"
  ? `heroImageCandidate: ${JSON.stringify(candidate.imageCandidateUrl)}\nheroImageCandidateSourceUrl: ${JSON.stringify(candidate.imageSourcePageUrl)}\nheroImageCandidateStatus: "pending-review"\n`
  : ""}contentBlocks: ${JSON.stringify(contentBlocks)}
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
  const complete = result.results.filter((entry) => entry.status === "draft");
  const rejected = result.results.filter((entry) => entry.status === "rejected");
  const completeDetails = complete.map((entry) => {
    const openPoints = [
      ...entry.readerInterest.warnings,
      ...entry.readerInterest.requiredFixes,
      ...Object.values(entry.reviews).flatMap((review) => [
        ...review.warnings,
        ...review.requiredFixes
      ])
    ];
    return `### ${entry.title}

- **Candidate ID:** ${entry.candidateId}
- **Leserinteresse-Score:** ${entry.readerInterest.score}
- **Artikeltyp:** ${entry.articleType}
- **Verifizierte Primärquellen:** ${entry.verifiedPrimarySourceUrls.join(", ") || "keine"}
- **Hero-Bildstatus:** ${entry.heroImageStatus}
- **Reader-Edit:** ${entry.readerEditResult}
- **SEO-Status:** ${entry.reviews.seoCheck?.passed ? "bestanden" : "nicht bestanden"}
- **Technische Prüfung:** ${entry.reviews.technicalCheck?.passed ? "bestanden" : "nicht bestanden"}
- **Offene manuelle Punkte:** ${openPoints.join("; ") || "Keine zusätzlichen Punkte"}
- **Dateipfad:** ${entry.filePath ? relative(process.cwd(), entry.filePath).replace(/\\/g, "/") : "nicht erzeugt"}
- **Erwarteter Artikelpfad:** ${entry.articlePath ?? "nicht verfügbar"}
- **Preview-Pfad:** ${entry.previewPath ?? "nicht verfügbar"}
`;
  }).join("\n");
  const rejectedDetails = rejected.map((entry) => {
    const reasons = [
      ...entry.readerInterest.requiredFixes,
      ...entry.readerInterest.warnings,
      ...Object.values(entry.reviews).flatMap((review) => review.requiredFixes)
    ];
    return `### ${entry.title}

- **Score:** ${entry.readerInterest.score}
- **Ablehnungsgrund:** ${reasons.join("; ") || entry.recommendation}
`;
  }).join("\n");
  return `# SpielSignal Editorial Batch

- **Workflow Run ID:** ${result.branchName.split("/").at(-1)}
- **Branch:** ${result.branchName}
- **Geprüfte Kandidaten:** ${result.checkedCandidates}
- **Vollständige Drafts:** ${result.completeDrafts}
- **Abgelehnte Kandidaten:** ${result.rejectedCandidates}

## Fertige Entwürfe

${completeDetails || "Keine vollständigen Entwürfe."}

${result.completeDrafts === 0
  ? "> **Keine vollständigen Artikel erzeugt. Gerüste dienen ausschließlich der Diagnose und erzeugen keinen Pull Request.**\n"
  : ""}

## Abgelehnte Themen

${rejectedDetails || "Keine abgelehnten Themen."}

## Vor Merge prüfen

- [ ] Ist die Überschrift interessant?
- [ ] Ist der Text leserfreundlich?
- [ ] Stimmen die Fakten?
- [ ] Ist das Bild passend?
- [ ] Sind die Quellen sauber?
- [ ] Keine internen Angaben sichtbar?
- [ ] Veröffentlichen oder überarbeiten?
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
  const selectedCandidates = selectBatchCandidates({
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
  const enriched = await Promise.all(selectedCandidates.map((candidate, index) =>
    enrichCandidateSources(
      candidate,
      options.primarySourceGroups?.[index] ?? [],
      options.sourceFetchImpl ?? fetch
    )
  ));
  const candidates = enriched.map((entry) => entry.candidate);
  const enrichmentMap = new Map(enriched.map((entry) => [entry.candidate.id, entry]));
  const interestMap = new Map(candidates.map((candidate) => [
    candidate.id,
    runReaderInterestCheck(candidate)
  ]));
  const sourceGateMap = new Map(candidates.map((candidate) => {
    const entry = enrichmentMap.get(candidate.id)!;
    const hasVerifiedSource = entry.sources.some((source) => source.verified);
    const hasFacts = entry.verifiedFacts.length > 0;
    const hasImage = Boolean(candidate.imageCandidateUrl || candidate.imagePath || "/images/categories/news-default.svg");
    return [candidate.id, hasVerifiedSource && hasFacts && hasImage] as const;
  }));

  const aiInputs = candidates
    .filter((candidate) =>
      (interestMap.get(candidate.id)?.score ?? 0) >= 60 &&
      sourceGateMap.get(candidate.id)
    )
    .map((candidate) => ({
      candidate,
      articleType: options.articleTypeDefault,
      primarySources: enrichmentMap.get(candidate.id)!.sources
        .filter((source) => source.verified)
        .map((source) => source.url),
      verifiedFacts: enrichmentMap.get(candidate.id)!.verifiedFacts,
      editorialNote: options.editorialNote
    }));
  const aiResult = await prepareEditorialAiDrafts(
    aiInputs,
    options.environment ?? process.env,
    options.fetchImpl ?? fetch
  );
  const readerEditResult = await prepareReaderEditedDrafts(
    aiResult.drafts,
    aiInputs,
    options.environment ?? process.env,
    options.fetchImpl ?? fetch
  );
  const aiDraftMap = new Map(readerEditResult.drafts.map((draft) => [draft.candidateId, draft]));
  const aiRequestedIds = new Set(aiInputs.map((input) => input.candidate.id));
  const aiWasInvoked = Boolean(aiResult.attempts);
  const results: BatchCandidateResult[] = [];

  for (const candidate of candidates) {
    const readerInterest = interestMap.get(candidate.id)!;
    const enrichment = enrichmentMap.get(candidate.id)!;
    const primarySources = enrichment.sources
      .filter((source) => source.verified)
      .map((source) => source.url);
    const sourceGatePassed = sourceGateMap.get(candidate.id) ?? false;
    const aiInvoked = sourceGatePassed && aiRequestedIds.has(candidate.id) && aiWasInvoked;
    const heroImageStatus = candidate.imageStatus === "approved"
      ? "Hero-Bild bereit"
      : candidate.imageCandidateUrl
        ? "Offizieller Steam-Bildkandidat, manuelle Prüfung erforderlich"
        : "Hero-Bild nur Fallback";
    if (readerInterest.score < 60) {
      results.push({
        candidateId: candidate.id,
        title: candidate.title,
        articleType: options.articleTypeDefault,
        readerInterest,
        reviews: {},
        primarySources,
        foundPrimarySourceUrls: enrichment.sources.map((source) => source.url),
        verifiedPrimarySourceUrls: primarySources,
        foundPrimarySources: enrichment.sources.length,
        verifiedPrimarySources: enrichment.sources.filter((source) => source.verified).length,
        steamAppId: candidate.steamAppId,
        heroImageStatus,
        sourceGatePassed,
        aiInvoked: false,
        aiResult: "Nicht aufgerufen: Leserinteresse unter 60.",
        readerEditResult: "Nicht aufgerufen.",
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
      foundPrimarySourceUrls: enrichment.sources.map((source) => source.url),
      verifiedPrimarySourceUrls: primarySources,
      foundPrimarySources: enrichment.sources.length,
      verifiedPrimarySources: enrichment.sources.filter((source) => source.verified).length,
      steamAppId: candidate.steamAppId,
      heroImageStatus,
      sourceGatePassed,
      aiInvoked,
      aiResult: aiDraftMap.has(candidate.id)
        ? "Writer-Draft und Reader-Edit erzeugt."
        : aiInvoked
          ? aiResult.reason
          : sourceGatePassed
            ? "Nicht aufgerufen: KI deaktiviert oder nicht konfiguriert."
            : "Nicht aufgerufen: Source-Gate nicht bestanden.",
      readerEditResult: aiDraftMap.has(candidate.id)
        ? readerEditResult.reason
        : "Kein veröffentlichungsfähiger Reader-Edit vorhanden.",
      imageSource: candidate.imageSourcePageUrl ?? built.reviewInput.heroImage,
      status,
      filePath,
      articlePath: complete ? `/artikel/${built.reviewInput.slug}/` : undefined,
      previewPath: complete ? `/redaktion/vorschau/${built.reviewInput.slug}/` : undefined,
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
      publicationReady: result.completeDrafts > 0,
      articlePaths: result.results
        .flatMap((entry) => entry.articlePath ? [entry.articlePath] : [])
        .join(","),
      previewPaths: result.results
        .flatMap((entry) => entry.previewPath ? [entry.previewPath] : [])
        .join(","),
      heroImageStatuses: result.results
        .filter((entry) => entry.status === "draft")
        .map((entry) => `${entry.candidateId}: ${entry.heroImageStatus}`)
        .join(" | "),
      manualReviewPoints: result.results
        .filter((entry) => entry.status === "draft")
        .flatMap((entry) => Object.values(entry.reviews).flatMap((review) => [
          ...review.warnings,
          ...review.requiredFixes
        ]))
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(" | ")
    };
    await writeFile(
      process.env.GITHUB_OUTPUT,
      `${Object.entries(output).map(([key, value]) => `${key}=${value}`).join("\n")}\n`,
      { encoding: "utf8", flag: "a" }
    );
  }
}
