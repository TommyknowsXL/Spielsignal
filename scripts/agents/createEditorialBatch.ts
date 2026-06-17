import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isSuitablePrimarySource } from "./createEditorialDraft";
import { analyzeEditorialCandidate, type CandidateEntityAnalysis } from "./entityAnalysis";
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
import {
  reviewSecondarySources,
  supportedGamingMedia,
  type SecondarySourceReview
} from "./sources/findSecondarySources";
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
  fallbackToQueue?: boolean;
};

export type BatchCandidateResult = {
  candidateId: string;
  title: string;
  articleType: BatchArticleType;
  radarSourceName: string;
  radarSourceUrl: string;
  readerInterest: EditorialReviewResult;
  reviews: Record<string, EditorialReviewResult>;
  searchedOfficialSources: string[];
  primarySources: string[];
  foundPrimarySourceUrls: string[];
  verifiedPrimarySourceUrls: string[];
  foundPrimarySources: number;
  verifiedPrimarySources: number;
  verifiedFacts: string[];
  secondarySourceReview?: SecondarySourceReview;
  secondarySourceFallbackUsed?: boolean;
  steamAppId?: string;
  heroImageStatus: string;
  sourceGatePassed: boolean;
  aiInvoked: boolean;
  aiResult: string;
  readerEditResult: string;
  imageSource: string;
  status: "draft" | "needs-source-review" | "secondary-source-review" | "rejected";
  filePath?: string;
  articlePath?: string;
  previewPath?: string;
  decisionReason: string;
  recommendation: string;
  missingFacts?: string[];
  entityAnalysis?: CandidateEntityAnalysis;
  sourceDiagnostics?: string[];
  publishabilityScore?: number;
  finalStatus?:
    | "draft-complete"
    | "source-gate-rejected"
    | "entity-needs-resolution"
    | "insufficient-verified-facts"
    | "duplicate"
    | "opinion-only"
    | "steam-ranking-without-news"
    | "secondary-source-review"
    | "secondary-source-rejected"
    | "image-gate-rejected"
    | "skipped-after-target-reached"
    | "technical-error"
    | "ai-not-started"
    | "ai-request-failed"
    | "ai-response-invalid"
    | "draft-quality-rejected";
};

type DedupedCandidate = {
  entry: EnrichedCandidateSources;
  duplicateOf?: string;
  duplicateReason?: string;
};

export type EditorialBatchResult = {
  generatedAt: string;
  reportDate: string;
  branchName: string;
  checkedCandidates: number;
  generatedDrafts: number;
  completeDrafts: number;
  researchStubs: number;
  skippedDuplicates: number;
  rejectedCandidates: number;
  noNewsEventCandidates: number;
  entityErrorCandidates: number;
  sourceErrorCandidates: number;
  insufficientFactCandidates: number;
  queueCandidateCount: number;
  queueGeneratedAt: string;
  queuePath: string;
  queueHash: string;
  secondaryArticlesChecked: number;
  secondaryArticlesRead: number;
  secondarySourceReviewDrafts: number;
  aiCallsAttempted: number;
  aiCallsSuccessful: number;
  aiCallsFailed: number;
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
  searchedSources: string[];
  sources: OfficialPrimarySource[];
  verifiedFacts: VerifiedFact[];
  secondaryReview: SecondarySourceReview;
  entityAnalysis?: CandidateEntityAnalysis;
  sourceDiagnostics: string[];
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
  const entityAnalysis = analyzeEditorialCandidate(candidate);
  const discovered = await findOfficialPrimarySources({
    candidateId: candidate.id,
    title: candidate.title,
    gameTitle: entityAnalysis.entityType === "game" ? entityAnalysis.mainEntity ?? candidate.gameTitle : candidate.gameTitle,
    steamAppId: candidate.steamAppId,
    sourceUrl: candidate.sourceUrl,
    entityAnalysis
  }, { fetchImpl });
  const secondaryReview = await reviewSecondarySources({
    candidateTitle: candidate.title,
    sourceUrls: [candidate.sourceUrl, ...supplied]
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
    searchedSources: discovered.searchedSources,
    sources,
    verifiedFacts: [...discovered.verifiedFacts, ...fallbackFacts],
    secondaryReview,
    entityAnalysis: discovered.entityAnalysis ?? entityAnalysis,
    sourceDiagnostics: discovered.sourceDiagnostics
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
  evaluateFullQueue?: boolean;
  fallbackToQueue?: boolean;
}): EditorialCandidate[] {
  const articleType = input.articleType ?? "news-overview";
  const unpublishedCandidates = input.queue.candidates.filter(
    (candidate) => !input.publishedSlugs?.has(candidateDraftSlug(candidate, articleType))
  );
  const rankableCandidates = input.evaluateFullQueue
    ? unpublishedCandidates
    : unpublishedCandidates.filter((candidate) =>
      candidate.sourceType !== "steam-top-seller" || hasConcreteNewsEvent(candidate)
    );
  const rankedEntries = rankableCandidates
    .map((candidate) => ({
      candidate,
      interestScore: runReaderInterestCheck(candidate).score,
      priority: autoTopPriority(candidate)
    }))
    .sort((left, right) =>
      right.priority - left.priority ||
      right.interestScore - left.interestScore ||
      right.candidate.score - left.candidate.score ||
      left.candidate.id.localeCompare(right.candidate.id)
    );
  const autoRanked = rankedEntries.map((entry) => entry.candidate);
  const summaryRanked = rankedEntries
    .filter((entry) => entry.interestScore >= 60)
    .map((entry) => entry.candidate);
  if (input.selectionMode === "auto-top") {
    const selected = input.evaluateFullQueue ? autoRanked : summaryRanked.slice(0, input.maxArticles);
    if (!selected.length) {
      throw new Error(
        `Keine geeigneten Kandidaten für auto-top in ${displayQueuePath(input.queuePath, input.rootDirectory)} gefunden.`
      );
    }
    return selected;
  }

  const candidateIds = [...new Set((input.candidateIds ?? []).map((id) => id.trim()).filter(Boolean))];
  if (!candidateIds.length && input.fallbackToQueue !== false) {
    return input.evaluateFullQueue ? autoRanked : summaryRanked.slice(0, input.maxArticles);
  }
  if (!candidateIds.length) throw new Error("Im Auswahlmodus manual ist mindestens eine Candidate ID erforderlich.");
  if (candidateIds.length > MAX_BATCH_ARTICLES) throw new Error("Maximal 5 Candidate IDs sind zulässig.");
  const manualCandidates = candidateIds.slice(0, input.maxArticles).map((id) => {
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
  if (!input.evaluateFullQueue || input.fallbackToQueue === false) return manualCandidates;
  const manualSet = new Set(manualCandidates.map((candidate) => candidate.id));
  return [
    ...manualCandidates,
    ...autoRanked.filter((candidate) => !manualSet.has(candidate.id))
  ];
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

function normalizeEditorialDashes(value: string): string {
  return value.replace(/[\u2010-\u2014]/g, "-");
}

function sanitizedBody(body: string): string {
  const normalized = body
    .replace(/^\uFEFF/, "")
    .replace(/[\u00A0\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/[\u2010-\u2014]/g, "-")
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

function emptySecondaryReview(): SecondarySourceReview {
  const media = supportedGamingMedia();
  return {
    searchedGermanMedia: media.german,
    searchedEnglishMedia: media.english,
    articlesChecked: 0,
    fullTextReadCount: 0,
    readErrors: [],
    articles: [],
    facts: [],
    corroboratedFacts: [],
    unconfirmedFacts: [],
    contradictions: [],
    followedOriginalSources: [],
    independentEstablishedSources: 0,
    fallbackEligible: false,
    fallbackReason: "Sekundaerquellen-Pruefung nicht ausgefuehrt."
  };
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
  const markdown = normalizeEditorialDashes(`---
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
`);
  const readerText = normalizeEditorialDashes(`${body}\n\n## Quellen\n\n${sourceLines}`);
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

function buildSecondarySourceReviewDraft(input: {
  candidate: EditorialCandidate;
  articleType: BatchArticleType;
  timestamp: string;
  review: SecondarySourceReview;
  editorialNote?: string;
  readerInterestScore: number;
}): {
  markdown: string;
  reviewInput: DraftReviewInput;
  status: "secondary-source-review";
} {
  const candidate = input.candidate;
  const title = `${candidate.gameTitle ?? candidate.title}: Sekundaerquellen-Pruefung`;
  const summary = "Keine erreichbare Primaerquelle: Dieser Entwurf basiert nur auf abgeglichenen Fachmedien und verlangt zwingend manuelle Pruefung.";
  const slug = candidateDraftSlug(candidate, input.articleType);
  const fallbackImage = candidate.imagePath || "/images/categories/news-default.svg";
  const secondarySources = input.review.articles.filter((article) => article.fullTextRead).map((article) => article.url);
  const confirmedFacts = input.review.corroboratedFacts.map((fact) => fact.statement);
  const unconfirmedFacts = input.review.unconfirmedFacts.map((fact) => fact.statement);
  const body = [
    "## Keine erreichbare Primaerquelle",
    "Dieser Draft ist nicht freigabefaehig. Er darf nur als Arbeitsgrundlage in der Redaktion verwendet werden, weil keine belastbare offizielle Primaerquelle erreicht wurde.",
    "## Bestaetigte Kernfakten aus Fachmedien",
    ...(confirmedFacts.length ? confirmedFacts.slice(0, 6).map((fact) => `- ${fact}`) : ["- Keine belastbar uebereinstimmenden Kernfakten."]),
    "## Unbestaetigte Angaben",
    ...(unconfirmedFacts.length ? unconfirmedFacts.slice(0, 6).map((fact) => `- ${fact}`) : ["- Keine weiteren unbestaetigten Angaben dokumentiert."]),
    "## Widersprueche",
    ...(input.review.contradictions.length ? input.review.contradictions.map((item) => `- ${item}`) : ["- Keine Widersprueche in den gelesenen Volltexten erkannt."]),
    "## Eigene Einordnung",
    "Die Redaktion muss die Lage neu pruefen, Originalquellen nachrecherchieren und unsichere Aussagen klar kennzeichnen. Keine Aussage darf als offiziell bestaetigt formuliert werden."
  ].join("\n\n");
  const contentBlocks = contentBlocksFor(body);
  const notes = [
    ...(input.editorialNote?.trim() ? [input.editorialNote.trim()] : []),
    "secondary-source-review: Keine erreichbare Primaerquelle.",
    "Manuelle Pruefung zwingend; keine automatische Freigabe.",
    `Unabhaengige etablierte Sekundaerquellen: ${input.review.independentEstablishedSources}.`,
    `Fallback-Grund: ${input.review.fallbackReason}.`,
    ...(input.readerInterestScore < 75 ? ["Leserinteresse 60 bis 74: redaktionell pruefen."] : []),
    ...candidate.openChecks
  ];
  const sourceLines = secondarySources.map((source) => `- [${sourceLabel(source)}](${source})`).join("\n");
  const markdown = normalizeEditorialDashes(`---
title: ${JSON.stringify(title)}
slug: ${JSON.stringify(slug)}
articleType: ${JSON.stringify(input.articleType)}
status: "secondary-source-review"
createdAt: ${JSON.stringify(input.timestamp)}
updatedAt: ${JSON.stringify(input.timestamp)}
author: "SpielSignal-Redaktion"
${candidate.gameTitle ? `gameTitle: ${JSON.stringify(candidate.gameTitle)}\n` : ""}${candidate.steamAppId ? `steamAppId: ${JSON.stringify(candidate.steamAppId)}\n` : ""}tags: []
summary: ${JSON.stringify(summary)}
seoTitle: ${JSON.stringify(`${title} | SpielSignal`)}
seoDescription: ${JSON.stringify(summary)}
heroImage: ${JSON.stringify(fallbackImage)}
heroImageAlt: ${JSON.stringify(`Platzhalterbild zu ${title}`)}
heroImageSourceName: "SpielSignal"
heroImageSourceType: "spielsignal-fallback"
imageRightsStatus: "fallback"
contentBlocks: ${JSON.stringify(contentBlocks)}
externalTipSources: ${JSON.stringify(candidate.sourceType === "rss-news" ? [candidate.sourceUrl] : [])}
primarySources: []
secondarySources: ${JSON.stringify(secondarySources)}
secondarySourceFacts: ${JSON.stringify(input.review.facts)}
secondarySourceWarnings: ${JSON.stringify([
    "Keine erreichbare Primaerquelle",
    ...input.review.readErrors,
    ...input.review.contradictions
  ])}
editorialNotes: ${JSON.stringify(notes)}
---

> **Keine erreichbare Primaerquelle. Dieser Draft ist nur eine Sekundaerquellen-Pruefung und kann nicht automatisch freigegeben werden.**

${body}

## Quellen

${sourceLines || "- Keine vollstaendig gelesenen Sekundaerquellen."}
`);
  const readerText = normalizeEditorialDashes(`${body}\n\n## Quellen\n\n${sourceLines}`);
  const reviewInput: DraftReviewInput = {
    candidateId: candidate.id,
    title,
    articleType: input.articleType,
    markdown,
    readerText,
    primarySources: [],
    externalTipSources: candidate.sourceType === "rss-news" ? [candidate.sourceUrl] : [],
    imageStatus: "fallback",
    imageSourceType: "spielsignal-fallback",
    heroImage: fallbackImage,
    slug,
    seoTitle: `${title} | SpielSignal`,
    seoDescription: summary,
    summary,
    wordCount: readerText.trim().split(/\s+/).length,
    hasOfficialFallbackImage: true
  };
  return { markdown, reviewInput, status: "secondary-source-review" };
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

function normalizedKey(value: string | undefined): string {
  return (value ?? "")
    .toLocaleLowerCase("de")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sourceKey(source: OfficialPrimarySource): string {
  try {
    const url = new URL(source.url);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return source.url.replace(/\/$/, "");
  }
}

function duplicateKeys(entry: EnrichedCandidateSources, articleType: BatchArticleType): string[] {
  const candidate = entry.candidate;
  const verifiedSourceKeys = entry.sources
    .filter((source) => source.verified)
    .map(sourceKey);
  const game = normalizedKey(candidate.gameTitle ?? candidate.title);
  return [
    `slug:${candidateDraftSlug(candidate, articleType)}`,
    `file:src/content/drafts/${candidateDraftSlug(candidate, articleType)}.md`,
    candidate.steamAppId ? `steam:${candidate.steamAppId}` : "",
    ...verifiedSourceKeys.map((source) => `game-source:${game}:${source}`)
  ].filter(Boolean);
}

function candidateStrength(entry: EnrichedCandidateSources): number {
  const candidate = entry.candidate;
  const verifiedSources = entry.sources.filter((source) => source.verified).length;
  const concreteFacts = concreteEventFacts(entry).length;
  return runReaderInterestCheck(candidate).score + verifiedSources * 10 + concreteFacts * 15 + candidate.score;
}

function dedupeEnrichedCandidates(
  entries: EnrichedCandidateSources[],
  articleType: BatchArticleType
): DedupedCandidate[] {
  const selected = new Map<string, EnrichedCandidateSources>();
  const keyOwner = new Map<string, string>();
  const ordered = [...entries].sort((left, right) =>
    candidateStrength(right) - candidateStrength(left) ||
    left.candidate.id.localeCompare(right.candidate.id)
  );
  const results: DedupedCandidate[] = [];
  for (const entry of ordered) {
    const keys = duplicateKeys(entry, articleType);
    const duplicateKey = keys.find((key) => keyOwner.has(key));
    if (duplicateKey) {
      results.push({
        entry,
        duplicateOf: keyOwner.get(duplicateKey),
        duplicateReason: `Duplicate skipped by ${duplicateKey}.`
      });
      continue;
    }
    selected.set(entry.candidate.id, entry);
    for (const key of keys) keyOwner.set(key, entry.candidate.id);
    results.push({ entry });
  }
  const resultMap = new Map(results.map((result) => [result.entry.candidate.id, result]));
  return entries.map((entry) => resultMap.get(entry.candidate.id)!);
}

function hasConcreteEvent(candidate: EditorialCandidate): boolean {
  return hasConcreteNewsEvent(candidate);
}

function concreteEventFacts(entry: EnrichedCandidateSources): VerifiedFact[] {
  return entry.verifiedFacts.filter((fact) => {
    const text = normalizedKey(fact.statement);
    if (/app id|steam app id|app-id|unter dem namen|steam fuehrt|steam führt|meldung.*veroffentlicht|meldung.*veroeffentlicht|news beitrag.*exist|news hub|steam news|dokumentiert den anlass/.test(text)) {
      return false;
    }
    return /datum|demo|zeitraum|verfugbar|verfuegbar|plattform|preis|patch|update|feature|umfang|release|version|inhalt|anderung|aenderung|roadmap|trailer|dlc/.test(text);
  });
}

function sourceGateDetails(candidate: EditorialCandidate, entry: EnrichedCandidateSources): {
  passed: boolean;
  reason: string;
  concreteFacts: VerifiedFact[];
} {
  const hasVerifiedSource = entry.sources.some((source) => source.verified);
  const concreteFacts = concreteEventFacts(entry);
  const hasEnoughFacts = concreteFacts.length >= 2;
  const needsEntityResolution = Boolean(entry.entityAnalysis?.needsResolution);
  const hasEvent = !needsEntityResolution && hasConcreteEvent(candidate);
  const hasImage = Boolean(candidate.imageCandidateUrl || candidate.imagePath || "/images/categories/news-default.svg");
  const missing = [
    needsEntityResolution ? "entity-needs-resolution: keine sichere Hauptentitaet" : "",
    !hasVerifiedSource ? "keine verifizierte offizielle Primaerquelle" : "",
    !hasEvent ? "kein konkreter aktueller Anlass" : "",
    !hasEnoughFacts ? "Nicht genug verifizierte Fakten fuer vollstaendigen Artikel" : "",
    !hasImage ? "kein Bild/Fallback verfuegbar" : ""
  ].filter(Boolean);
  return {
    passed: missing.length === 0,
    reason: missing.length
      ? `Source-Gate abgelehnt: ${missing.join("; ")}.`
      : "Source-Gate bestanden: offizieller Anlass und mindestens zwei belastbare Fakten vorhanden.",
    concreteFacts
  };
}

function publishabilityScore(input: {
  candidate: EditorialCandidate;
  entry: EnrichedCandidateSources;
  readerInterest: EditorialReviewResult;
  gateDetails: ReturnType<typeof sourceGateDetails>;
  duplicate?: boolean;
}): number {
  const analysis = input.entry.entityAnalysis;
  const verifiedSources = input.entry.sources.filter((source) => source.verified).length;
  const concreteFacts = input.gateDetails.concreteFacts.length;
  const hasEvent = hasConcreteEvent(input.candidate);
  const hasImage = Boolean(input.candidate.imageCandidateUrl || input.candidate.imagePath || "/images/categories/news-default.svg");
  const opinionOnly = analysis?.topicType === "opinion/community-topic" && concreteFacts < 2;
  const topSellerOnly = input.candidate.sourceType === "steam-top-seller" && !hasEvent;
  return [
    input.readerInterest.score,
    analysis && !analysis.needsResolution && analysis.entityType !== "unknown" ? 25 : -40,
    analysis && analysis.topicType !== "unknown" ? 15 : -10,
    verifiedSources > 0 ? 35 : -45,
    concreteFacts >= 2 ? 45 : concreteFacts * 12 - 35,
    hasEvent ? 20 : -20,
    hasImage ? 10 : -25,
    input.duplicate ? -100 : 0,
    opinionOnly ? -60 : 0,
    topSellerOnly ? -60 : 0,
    Math.min(10, Math.max(0, input.candidate.score))
  ].reduce((sum, value) => sum + value, 0);
}

function finalStatusFor(input: {
  candidate: EditorialCandidate;
  entry: EnrichedCandidateSources;
  gateDetails?: ReturnType<typeof sourceGateDetails>;
  duplicate?: boolean;
  complete?: boolean;
  scaffold?: boolean;
  aiInvoked?: boolean;
  aiErrorCode?: string;
  reviews?: Record<string, EditorialReviewResult>;
}): BatchCandidateResult["finalStatus"] {
  if (input.complete) return "draft-complete";
  if (input.duplicate) return "duplicate";
  const analysis = input.entry.entityAnalysis;
  if (input.candidate.sourceType === "steam-top-seller" && !hasConcreteEvent(input.candidate)) return "steam-ranking-without-news";
  if (analysis?.needsResolution) return "entity-needs-resolution";
  if (analysis?.topicType === "opinion/community-topic" && concreteEventFacts(input.entry).length < 2) return "opinion-only";
  if (input.gateDetails && input.gateDetails.concreteFacts.length < 2) return "insufficient-verified-facts";
  if (input.gateDetails && !input.gateDetails.passed) return "source-gate-rejected";
  if (input.aiErrorCode) return input.aiErrorCode === "invalid_response" ? "ai-response-invalid" : "ai-request-failed";
  if (!input.aiInvoked || input.scaffold) return "ai-not-started";
  if (input.reviews && !fullGatePassed(input.reviews)) return "draft-quality-rejected";
  return "source-gate-rejected";
}

function skippedQueueCandidateResult(input: {
  candidate: EditorialCandidate;
  articleType: BatchArticleType;
  reason: string;
  finalStatus: NonNullable<BatchCandidateResult["finalStatus"]>;
}): BatchCandidateResult {
  const readerInterest = runReaderInterestCheck(input.candidate);
  const entityAnalysis = analyzeEditorialCandidate(input.candidate);
  return {
    candidateId: input.candidate.id,
    title: input.candidate.title,
    articleType: input.articleType,
    radarSourceName: input.candidate.sourceName,
    radarSourceUrl: input.candidate.sourceUrl,
    readerInterest,
    reviews: {},
    searchedOfficialSources: entityAnalysis.searchTerms.map((term) => `search-term:${term}`),
    primarySources: [],
    foundPrimarySourceUrls: [],
    verifiedPrimarySourceUrls: [],
    foundPrimarySources: 0,
    verifiedPrimarySources: 0,
    verifiedFacts: [],
    steamAppId: input.candidate.steamAppId,
    heroImageStatus: input.candidate.imageCandidateUrl ? "Bildkandidat vorhanden, nicht geprueft" : "Hero-Bild nicht geprueft",
    sourceGatePassed: false,
    aiInvoked: false,
    aiResult: "Nicht aufgerufen: Kandidat wurde vor der KI-Stufe bilanziert.",
    readerEditResult: "Nicht aufgerufen.",
    imageSource: input.candidate.imageSourcePageUrl ?? input.candidate.imagePath ?? "Kein Bild",
    status: "rejected",
    decisionReason: input.reason,
    recommendation: "Im Report sichtbar halten und bei Bedarf separat recherchieren.",
    missingFacts: ["Keine vollstaendige Enrichment-Pruefung dokumentiert."],
    entityAnalysis,
    secondarySourceReview: emptySecondaryReview(),
    secondarySourceFallbackUsed: false,
    sourceDiagnostics: [input.reason],
    publishabilityScore: publishabilityScore({
      candidate: input.candidate,
      entry: {
        candidate: input.candidate,
        searchedSources: [],
        sources: [],
        verifiedFacts: [],
        secondaryReview: emptySecondaryReview(),
        entityAnalysis,
        sourceDiagnostics: [input.reason]
      },
      readerInterest,
      gateDetails: {
        passed: false,
        reason: input.reason,
        concreteFacts: []
      }
    }),
    finalStatus: input.finalStatus
  };
}

function reportMarkdown(result: EditorialBatchResult): string {
  const complete = result.results.filter((entry) => entry.status === "draft");
  const researchStubs = result.results.filter((entry) => entry.status === "needs-source-review");
  const rejected = result.results.filter((entry) => entry.status === "rejected");
  const uniqueDraftFiles = [...new Set(result.results.flatMap((entry) =>
    entry.filePath ? [relative(process.cwd(), entry.filePath).replace(/\\/g, "/")] : []
  ))];
  const duplicateDetails = result.results
    .filter((entry) => /Duplicate uebersprungen/i.test(entry.decisionReason))
    .map((entry) => `- ${entry.candidateId}: ${entry.decisionReason}`)
    .join("\n");
  const thinFactDetails = result.results
    .filter((entry) => /Nicht genug verifizierte Fakten/i.test(entry.decisionReason))
    .map((entry) => `- ${entry.candidateId}: ${entry.decisionReason}`)
    .join("\n");
  const steamNewsDetails = result.results
    .filter((entry) => entry.foundPrimarySourceUrls.some((url) => url.includes("store.steampowered.com/news/")))
    .map((entry) => {
      const official = entry.verifiedPrimarySourceUrls.some((url) => url.includes("store.steampowered.com/news/"));
      const reason = official
        ? "konkreter Beitrag ist Entwickler-/Publisher-Post"
        : "Autor/Quelle unklar oder nur aggregiert/sekundaer";
      return `- ${entry.candidateId}: Steam-News-Hub ${official ? "offiziell bestaetigt" : "unklar/sekundaer"} - ${reason}`;
    })
    .join("\n");
  const entityDetails = result.results.map((entry) => {
    const analysis = entry.entityAnalysis;
    return `### ${entry.candidateId}

- **Erkannte Hauptentitaet:** ${analysis?.mainEntity ?? "keine sichere Entitaet"}
- **Entitaetstyp:** ${analysis?.entityType ?? "unknown"}
- **Anlass/Thementyp:** ${analysis?.topicType ?? "unknown"}
- **Entfernte Titelbestandteile:** ${analysis?.removedTitleParts.join("; ") || "keine"}
- **Verwendete Suchbegriffe:** ${analysis?.searchTerms.join(", ") || "keine"}
- **Gepruefte offizielle Quellengruppen:** ${analysis?.sourceGroups.join(", ") || "keine"}
- **Quellendiagnose:** ${entry.sourceDiagnostics?.join("; ") || "keine Zusatzdiagnose"}
`;
  }).join("\n");
  const researchStubDetails = researchStubs.map((entry) => `### ${entry.title}

- **Candidate ID:** ${entry.candidateId}
- **Grund:** ${entry.decisionReason}
- **Dateipfad:** ${entry.filePath ? relative(process.cwd(), entry.filePath).replace(/\\/g, "/") : "nicht erzeugt"}
- **Fehlende Fakten:** ${entry.missingFacts?.join("; ") || "Nicht genug verifizierte Fakten fuer vollstaendigen Artikel"}
- **KI-Aufruf:** ${entry.aiInvoked ? "gestartet" : "nicht gestartet"} (${entry.aiResult})
`).join("\n");
  const sourceRoleDetails = result.results.map((entry) => `### ${entry.candidateId}

- **Radarquelle:** ${entry.radarSourceName} (${entry.radarSourceUrl})
- **Sekundärquellen:** ${entry.radarSourceUrl}
- **Verifizierte Primärquellen:** ${entry.verifiedPrimarySourceUrls.join(", ") || "keine"}
- **Eigene redaktionelle Einordnung:** ${entry.status === "draft" ? "im Draft vorhanden und manuell zu pruefen" : "nicht erzeugt, weil Gate nicht veroeffentlichungsreif war"}
`).join("\n");
  const zeroDraftReasons = result.completeDrafts === 0
    ? result.results.map((entry) => `- ${entry.candidateId}: ${entry.decisionReason}`).join("\n")
    : "";
  const statusCounts = result.results.reduce<Record<string, number>>((counts, entry) => {
    const status = entry.finalStatus ?? entry.status;
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
  const statusCountTotal = Object.values(statusCounts).reduce((sum, value) => sum + value, 0);
  const statusCountDetails = Object.entries(statusCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `- **${status}:** ${count}`)
    .join("\n");
  const secondaryArticlesChecked = result.results.reduce((sum, entry) =>
    sum + (entry.secondarySourceReview?.articlesChecked ?? 0), 0);
  const secondaryArticlesRead = result.results.reduce((sum, entry) =>
    sum + (entry.secondarySourceReview?.fullTextReadCount ?? 0), 0);
  const allCandidateDetails = result.results
    .slice()
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId))
    .map((entry) => `### ${entry.candidateId}

- **Originaltitel:** ${entry.title}
- **Bereinigter Titel:** ${entry.entityAnalysis?.cleanedTitle ?? entry.title}
- **Entity:** ${entry.entityAnalysis?.mainEntity ?? "keine sichere Entitaet"}
- **Entity-Typ:** ${entry.entityAnalysis?.entityType ?? "unknown"}
- **Thementyp:** ${entry.entityAnalysis?.topicType ?? "unknown"}
- **Suchbegriffe:** ${entry.entityAnalysis?.searchTerms.join(", ") || "keine"}
- **Gepruefte Domains/Quellen:** ${entry.searchedOfficialSources.join(", ") || "keine"}
- **Gefundene URLs:** ${entry.foundPrimarySourceUrls.join(", ") || "keine"}
- **Akzeptierte Primaerquellen:** ${entry.verifiedPrimarySourceUrls.join(", ") || "keine"}
- **Abgelehnte Quellen / Diagnose:** ${entry.sourceDiagnostics?.join("; ") || "keine"}
- **Extrahierte Fakten:** ${entry.verifiedFacts.join("; ") || "keine"}
- **Gefundene deutsche Fachmedien:** ${entry.secondarySourceReview?.articles.filter((article) => article.language === "de").map((article) => article.sourceName).join(", ") || "keine"}
- **Gefundene englische Fachmedien:** ${entry.secondarySourceReview?.articles.filter((article) => article.language === "en").map((article) => article.sourceName).join(", ") || "keine"}
- **Volltext gelesen:** ${(entry.secondarySourceReview?.fullTextReadCount ?? 0) > 0 ? "ja" : "nein"}
- **Lesefehler:** ${entry.secondarySourceReview?.readErrors.join("; ") || "keine"}
- **Fakten aus Fachmedien:** ${entry.secondarySourceReview?.facts.map((fact) => `${fact.sourceName}: ${fact.statement}`).join("; ") || "keine"}
- **Verfolgte Originalquellen:** ${entry.secondarySourceReview?.followedOriginalSources.join(", ") || "keine"}
- **Uebereinstimmungen:** ${entry.secondarySourceReview?.corroboratedFacts.map((fact) => fact.statement).join("; ") || "keine"}
- **Widersprueche:** ${entry.secondarySourceReview?.contradictions.join("; ") || "keine"}
- **Unabhaengige Sekundaerquellen:** ${entry.secondarySourceReview?.independentEstablishedSources ?? 0}
- **Primaerquelle vorhanden:** ${entry.verifiedPrimarySources > 0 ? "ja" : "nein"}
- **Sekundaerquellen-Fallback verwendet:** ${entry.secondarySourceFallbackUsed ? "ja" : "nein"}
- **Draft-Status:** ${entry.status}
- **Publishability-Score:** ${entry.publishabilityScore ?? 0}
- **KI-Status:** ${entry.aiInvoked ? "gestartet" : "nicht gestartet"} (${entry.aiResult})
- **Finaler Status:** ${entry.finalStatus ?? entry.status}
- **Finaler Ablehnungsgrund:** ${entry.status === "draft" ? "keiner" : entry.decisionReason}
`)
    .join("\n");
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
- **Radarquelle:** ${entry.radarSourceName} (${entry.radarSourceUrl})
- **Gesuchte offizielle Quellen:** ${entry.searchedOfficialSources.join(", ") || "keine automatische Quelle pruefbar"}
- **Gefundene Primaerquellen:** ${entry.foundPrimarySourceUrls.join(", ") || "keine"}
- **Verifizierte Fakten:** ${entry.verifiedFacts.join("; ") || "keine"}
- **Publishability-Score:** ${entry.publishabilityScore ?? 0}
- **Finaler Status:** ${entry.finalStatus ?? entry.status}
- **Entscheidung:** ${entry.decisionReason}
- **KI-Aufruf:** ${entry.aiInvoked ? "gestartet" : "nicht gestartet"} (${entry.aiResult})
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
- **Bereinigter Titel:** ${entry.entityAnalysis?.cleanedTitle ?? entry.title}
- **Entity:** ${entry.entityAnalysis?.mainEntity ?? "keine sichere Entitaet"}
- **Entity-Typ:** ${entry.entityAnalysis?.entityType ?? "unknown"}
- **Thementyp:** ${entry.entityAnalysis?.topicType ?? "unknown"}
- **Publishability-Score:** ${entry.publishabilityScore ?? 0}
- **Finaler Status:** ${entry.finalStatus ?? entry.status}
- **Radarquelle:** ${entry.radarSourceName} (${entry.radarSourceUrl})
- **Gesuchte offizielle Quellen:** ${entry.searchedOfficialSources.join(", ") || "keine automatische Quelle pruefbar"}
- **Gefundene Primaerquellen:** ${entry.foundPrimarySourceUrls.join(", ") || "keine"}
- **Verifizierte Primaerquellen:** ${entry.verifiedPrimarySourceUrls.join(", ") || "keine"}
- **Konkrete Fakten:** ${entry.verifiedFacts.join("; ") || "keine"}
- **KI-Aufruf:** ${entry.aiInvoked ? "gestartet" : "nicht gestartet"} (${entry.aiResult})
- **Entscheidung:** ${entry.decisionReason}
- **Ablehnungsgrund:** ${reasons.join("; ") || entry.recommendation}
`;
  }).join("\n");
  return `# SpielSignal Editorial Batch

- **Workflow Run ID:** ${result.branchName.split("/").at(-1)}
- **Branch:** ${result.branchName}
- **Queue-Dateipfad:** ${result.queuePath}
- **Queue-Erstellungszeit:** ${result.queueGeneratedAt}
- **Queue-Hash:** ${result.queueHash}
- **Queue-Kandidaten gesamt:** ${result.queueCandidateCount}
- **Verwendete Candidate IDs:** ${result.results.map((entry) => entry.candidateId).join(", ") || "keine"}
- **KI-Aufrufe versucht:** ${result.aiCallsAttempted}
- **KI-Aufrufe erfolgreich:** ${result.aiCallsSuccessful}
- **KI-Aufrufe fehlgeschlagen:** ${result.aiCallsFailed}
- **API-Key vorhanden:** ${result.ai.enabled ? "ja" : "nein oder KI deaktiviert"}
- **KI-Status:** ${result.ai.reason}${result.ai.errorCode ? ` (${result.ai.errorCode})` : ""}
- **Gepruefte Fachartikel:** ${secondaryArticlesChecked}
- **Vollstaendig gelesene Fachartikel:** ${secondaryArticlesRead}
- **Sekundaerquellen-Review-Drafts:** ${result.secondarySourceReviewDrafts}
- **Geprüfte Kandidaten:** ${result.checkedCandidates}
- **Übersprungene Kandidaten:** ${result.results.filter((entry) => entry.finalStatus === "skipped-after-target-reached").length}
- **Duplikate:** ${result.skippedDuplicates}
- **Kandidaten ohne Nachrichtenanlass:** ${result.noNewsEventCandidates}
- **Kandidaten mit Entity-Fehler:** ${result.entityErrorCandidates}
- **Kandidaten mit Source-Fehler:** ${result.sourceErrorCandidates}
- **Kandidaten mit Faktenmangel:** ${result.insufficientFactCandidates}
- **Vollständige Drafts:** ${result.completeDrafts}
- **Recherche-Stubs:** ${result.researchStubs}
- **Übersprungene Duplikate:** ${result.skippedDuplicates}
- **Abgelehnte Kandidaten:** ${result.rejectedCandidates}

## Finalstatus-Bilanz

- **Statussumme:** ${statusCountTotal} von ${result.queueCandidateCount}

${statusCountDetails || "Keine Statuswerte dokumentiert."}

## Vollständige Kandidatenbilanz

${allCandidateDetails || "Keine Kandidaten bilanziert."}

## Eindeutige Draft-Dateien

${uniqueDraftFiles.map((file) => `- ${file}`).join("\n") || "Keine eindeutigen Draft-Dateien erzeugt."}

## Deduplizierung

${duplicateDetails || "Keine Duplikate uebersprungen."}

## Duenne Faktenlage

${thinFactDetails || "Keine Kandidaten wegen zu duenner Faktenlage abgelehnt."}

## Steam-News-Hub-Bewertung

${steamNewsDetails || "Keine Steam-News-Hub-Quelle bewertet."}

## Entity- und Quellendiagnose

${entityDetails || "Keine Entity-Diagnose dokumentiert."}

## Quellenrollen

${sourceRoleDetails || "Keine Quellenrollen dokumentiert."}

## Fertige Entwürfe

${completeDetails || "Keine vollständigen Entwürfe."}

${result.completeDrafts === 0
  ? "> **Keine vollständigen Artikel erzeugt. Gerüste dienen ausschließlich der Diagnose und erzeugen keinen Pull Request.**\n"
  : ""}

## Recherche-Stubs / Needs Source Review

${researchStubDetails || "Keine Recherche-Stubs."}

${zeroDraftReasons ? `### Warum 0 Artikel erzeugt wurden\n\n${zeroDraftReasons}\n` : ""}

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
  const queueRaw = await readFile(queuePath, "utf8");
  const queueHash = createHash("sha256").update(queueRaw).digest("hex").slice(0, 16);
  const publishedSlugs = await loadPublishedArticleSlugs(rootDirectory);
  const selectedCandidates = selectBatchCandidates({
    queue,
    queuePath,
    rootDirectory,
    selectionMode,
    candidateIds: options.candidateIds,
    maxArticles,
    articleType: options.articleTypeDefault,
    publishedSlugs,
    evaluateFullQueue: true,
    fallbackToQueue: options.fallbackToQueue ?? true
  });
  const timestamp = options.generatedAt ?? new Date().toISOString();
  const reportDate = timestamp.slice(0, 10);
  const runId = options.environment?.GITHUB_RUN_ID || process.env.GITHUB_RUN_ID || Date.now().toString();
  const branchName = `editorial-batch/${reportDate}-${runId}`;
  const enriched = await Promise.all(selectedCandidates.map((candidate, index) =>
    enrichCandidateSources(
      candidate,
      options.primarySourceGroups?.[index] ?? [],
      options.sourceFetchImpl ?? fetch
    )
  ));
  const deduped = dedupeEnrichedCandidates(enriched, options.articleTypeDefault);
  const activeEnriched = deduped.filter((entry) => !entry.duplicateOf).map((entry) => entry.entry);
  const duplicateEntries = deduped.filter((entry) => entry.duplicateOf);
  const candidates = activeEnriched.map((entry) => entry.candidate);
  const enrichmentMap = new Map(activeEnriched.map((entry) => [entry.candidate.id, entry]));
  const interestMap = new Map(candidates.map((candidate) => [
    candidate.id,
    runReaderInterestCheck(candidate)
  ]));
  const sourceGateDetailsMap = new Map(candidates.map((candidate) => {
    const entry = enrichmentMap.get(candidate.id)!;
    return [candidate.id, sourceGateDetails(candidate, entry)] as const;
  }));
  const sourceGateMap = new Map(candidates.map((candidate) => {
    const details = sourceGateDetailsMap.get(candidate.id)!;
    return [candidate.id, details.passed] as const;
  }));
  const sourceGateReasonMap = new Map(candidates.map((candidate) => {
    const details = sourceGateDetailsMap.get(candidate.id)!;
    return [candidate.id, details.reason] as const;
  }));
  const publishabilityMap = new Map(candidates.map((candidate) => {
    const entry = enrichmentMap.get(candidate.id)!;
    const readerInterest = interestMap.get(candidate.id)!;
    const gateDetails = sourceGateDetailsMap.get(candidate.id)!;
    return [candidate.id, publishabilityScore({ candidate, entry, readerInterest, gateDetails })] as const;
  }));

  const aiInputs = candidates
    .filter((candidate) =>
      (interestMap.get(candidate.id)?.score ?? 0) >= 60 &&
      sourceGateMap.get(candidate.id)
    )
    .sort((left, right) =>
      (publishabilityMap.get(right.id) ?? 0) - (publishabilityMap.get(left.id) ?? 0) ||
      left.id.localeCompare(right.id)
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
  const aiEnvironment = {
    ...(options.environment ?? process.env),
    AI_EDITORIAL_MAX_ARTICLES: String(Math.max(
      Number.parseInt((options.environment ?? process.env).AI_EDITORIAL_MAX_ARTICLES ?? "0", 10) || 0,
      aiInputs.length,
      maxArticles
    ))
  };
  const aiResult = await prepareEditorialAiDrafts(
    aiInputs,
    aiEnvironment,
    options.fetchImpl ?? fetch
  );
  const readerEditResult = await prepareReaderEditedDrafts(
    aiResult.drafts,
    aiInputs,
    aiEnvironment,
    options.fetchImpl ?? fetch
  );
  const aiDraftMap = new Map(readerEditResult.drafts.map((draft) => [draft.candidateId, draft]));
  const aiRequestedIds = new Set(aiInputs.map((input) => input.candidate.id));
  const aiWasInvoked = Boolean(aiResult.attempts);
  const results: BatchCandidateResult[] = [];
  let completedDraftsWritten = 0;

  for (const duplicate of duplicateEntries) {
    const candidate = duplicate.entry.candidate;
    const readerInterest = runReaderInterestCheck(candidate);
    const primarySources = duplicate.entry.sources
      .filter((source) => source.verified)
      .map((source) => source.url);
    results.push({
      candidateId: candidate.id,
      title: candidate.title,
      articleType: options.articleTypeDefault,
      radarSourceName: candidate.sourceName,
      radarSourceUrl: candidate.sourceUrl,
      readerInterest,
      reviews: {},
      searchedOfficialSources: duplicate.entry.searchedSources,
      primarySources,
      foundPrimarySourceUrls: duplicate.entry.sources.map((source) => source.url),
      verifiedPrimarySourceUrls: primarySources,
      foundPrimarySources: duplicate.entry.sources.length,
      verifiedPrimarySources: duplicate.entry.sources.filter((source) => source.verified).length,
      verifiedFacts: duplicate.entry.verifiedFacts.map((fact) => fact.statement),
      secondarySourceReview: duplicate.entry.secondaryReview,
      secondarySourceFallbackUsed: false,
      steamAppId: candidate.steamAppId,
      heroImageStatus: candidate.imageCandidateUrl ? "Offizieller Steam-Bildkandidat, manuelle Pruefung erforderlich" : "Hero-Bild nur Fallback",
      sourceGatePassed: false,
      aiInvoked: false,
      aiResult: "Nicht aufgerufen: Duplicate vor KI-Aufruf uebersprungen.",
      readerEditResult: "Nicht aufgerufen.",
      imageSource: candidate.imageSourcePageUrl ?? candidate.imagePath ?? "Kein Bild",
      status: "rejected",
      decisionReason: `Duplicate uebersprungen: zusammengefuehrt mit ${duplicate.duplicateOf}. ${duplicate.duplicateReason ?? ""}`.trim(),
      recommendation: "Keinen zweiten Draft fuer denselben Zielslug oder dieselbe offizielle Quelle erzeugen.",
      entityAnalysis: duplicate.entry.entityAnalysis,
      sourceDiagnostics: duplicate.entry.sourceDiagnostics,
      publishabilityScore: publishabilityScore({
        candidate,
        entry: duplicate.entry,
        readerInterest,
        gateDetails: sourceGateDetails(candidate, duplicate.entry),
        duplicate: true
      }),
      finalStatus: "duplicate"
    });
  }

  for (const candidate of candidates) {
    const readerInterest = interestMap.get(candidate.id)!;
    const enrichment = enrichmentMap.get(candidate.id)!;
    const primarySources = enrichment.sources
      .filter((source) => source.verified)
      .map((source) => source.url);
    const sourceGatePassed = sourceGateMap.get(candidate.id) ?? false;
    const gateDetails = sourceGateDetailsMap.get(candidate.id);
    const sourceDecisionReason = sourceGateReasonMap.get(candidate.id) ?? "Source-Gate nicht ausgewertet.";
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
        radarSourceName: candidate.sourceName,
        radarSourceUrl: candidate.sourceUrl,
        readerInterest,
        reviews: {},
        searchedOfficialSources: enrichment.searchedSources,
        primarySources,
        foundPrimarySourceUrls: enrichment.sources.map((source) => source.url),
        verifiedPrimarySourceUrls: primarySources,
        foundPrimarySources: enrichment.sources.length,
        verifiedPrimarySources: enrichment.sources.filter((source) => source.verified).length,
        verifiedFacts: enrichment.verifiedFacts.map((fact) => fact.statement),
        secondarySourceReview: enrichment.secondaryReview,
        secondarySourceFallbackUsed: false,
        steamAppId: candidate.steamAppId,
        heroImageStatus,
        sourceGatePassed,
        aiInvoked: false,
        aiResult: "Nicht aufgerufen: Leserinteresse unter 60.",
        readerEditResult: "Nicht aufgerufen.",
        imageSource: candidate.imageSourcePageUrl ?? candidate.imagePath ?? "Kein Bild",
        status: "rejected",
        decisionReason: `Leserinteresse unter 60. ${sourceDecisionReason}`,
        recommendation: "Thema nicht als vollständigen Artikel verfolgen.",
        missingFacts: gateDetails && gateDetails.concreteFacts.length < 2
          ? ["Mindestens zwei konkrete, spielrelevante Fakten zum Anlass fehlen."]
          : [],
        entityAnalysis: enrichment.entityAnalysis,
        sourceDiagnostics: enrichment.sourceDiagnostics,
        publishabilityScore: publishabilityMap.get(candidate.id),
        finalStatus: finalStatusFor({ candidate, entry: enrichment, gateDetails })
      });
      continue;
    }

    if (!sourceGatePassed) {
      if (enrichment.secondaryReview.fallbackEligible) {
        const built = buildSecondarySourceReviewDraft({
          candidate,
          articleType: options.articleTypeDefault,
          timestamp,
          review: enrichment.secondaryReview,
          editorialNote: options.editorialNote,
          readerInterestScore: readerInterest.score
        });
        const filePath = join(rootDirectory, "src", "content", "drafts", `${built.reviewInput.slug}.md`);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, built.markdown, "utf8");
        results.push({
          candidateId: candidate.id,
          title: built.reviewInput.title,
          articleType: options.articleTypeDefault,
          radarSourceName: candidate.sourceName,
          radarSourceUrl: candidate.sourceUrl,
          readerInterest,
          reviews: {},
          searchedOfficialSources: enrichment.searchedSources,
          primarySources,
          foundPrimarySourceUrls: enrichment.sources.map((source) => source.url),
          verifiedPrimarySourceUrls: primarySources,
          foundPrimarySources: enrichment.sources.length,
          verifiedPrimarySources: enrichment.sources.filter((source) => source.verified).length,
          verifiedFacts: enrichment.verifiedFacts.map((fact) => fact.statement),
          secondarySourceReview: enrichment.secondaryReview,
          secondarySourceFallbackUsed: true,
          steamAppId: candidate.steamAppId,
          heroImageStatus,
          sourceGatePassed: false,
          aiInvoked: false,
          aiResult: "Nicht aufgerufen: Sekundaerquellen-Fallback erzeugt nur manuellen Review-Draft.",
          readerEditResult: "Nicht aufgerufen.",
          imageSource: candidate.imageSourcePageUrl ?? built.reviewInput.heroImage,
          status: "secondary-source-review",
          filePath,
          previewPath: `/redaktion/vorschau/${built.reviewInput.slug}/`,
          decisionReason: `Sekundaerquellen-Fallback genutzt. ${sourceDecisionReason}`,
          recommendation: "Manuelle Pruefung zwingend: Primaerquelle nachrecherchieren, keine automatische Freigabe.",
          missingFacts: [
            "Keine erreichbare Primaerquelle.",
            ...enrichment.secondaryReview.unconfirmedFacts.map((fact) => `Unbestaetigt: ${fact.statement}`),
            ...enrichment.secondaryReview.contradictions.map((item) => `Widerspruch: ${item}`)
          ],
          entityAnalysis: enrichment.entityAnalysis,
          sourceDiagnostics: [
            ...enrichment.sourceDiagnostics,
            enrichment.secondaryReview.fallbackReason
          ],
          publishabilityScore: publishabilityMap.get(candidate.id),
          finalStatus: "secondary-source-review"
        });
        continue;
      }
      results.push({
        candidateId: candidate.id,
        title: candidate.title,
        articleType: options.articleTypeDefault,
        radarSourceName: candidate.sourceName,
        radarSourceUrl: candidate.sourceUrl,
        readerInterest,
        reviews: {},
        searchedOfficialSources: enrichment.searchedSources,
        primarySources,
        foundPrimarySourceUrls: enrichment.sources.map((source) => source.url),
        verifiedPrimarySourceUrls: primarySources,
        foundPrimarySources: enrichment.sources.length,
        verifiedPrimarySources: enrichment.sources.filter((source) => source.verified).length,
        verifiedFacts: enrichment.verifiedFacts.map((fact) => fact.statement),
        secondarySourceReview: enrichment.secondaryReview,
        secondarySourceFallbackUsed: false,
        steamAppId: candidate.steamAppId,
        heroImageStatus,
        sourceGatePassed,
        aiInvoked: false,
        aiResult: "Nicht aufgerufen: Source-Gate nicht bestanden.",
        readerEditResult: "Nicht aufgerufen.",
        imageSource: candidate.imageSourcePageUrl ?? candidate.imagePath ?? "Kein Bild",
        status: "rejected",
        decisionReason: sourceDecisionReason,
        recommendation: "Keine Artikelerzeugung ohne verifizierte offizielle Primaerquelle und belastbare Fakten.",
        missingFacts: gateDetails && gateDetails.concreteFacts.length < 2
          ? ["Mindestens zwei konkrete, spielrelevante Fakten zum Anlass fehlen."]
          : [],
        entityAnalysis: enrichment.entityAnalysis,
        sourceDiagnostics: enrichment.sourceDiagnostics,
        publishabilityScore: publishabilityMap.get(candidate.id),
        finalStatus: finalStatusFor({ candidate, entry: enrichment, gateDetails })
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
    const fullGateComplete = built.status === "draft" && fullGatePassed(reviews);
    const complete = fullGateComplete && completedDraftsWritten < maxArticles;
    const scaffold = built.status === "needs-source-review";
    const status = complete ? "draft" : scaffold ? "needs-source-review" : "rejected";
    let filePath: string | undefined;

    if (complete || scaffold) {
      filePath = join(rootDirectory, "src", "content", "drafts", `${built.reviewInput.slug}.md`);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, built.markdown, "utf8");
    }
    if (complete) completedDraftsWritten += 1;

    results.push({
      candidateId: candidate.id,
      title: built.reviewInput.title,
      articleType: options.articleTypeDefault,
      radarSourceName: candidate.sourceName,
      radarSourceUrl: candidate.sourceUrl,
      readerInterest,
      reviews,
      searchedOfficialSources: enrichment.searchedSources,
      primarySources,
      foundPrimarySourceUrls: enrichment.sources.map((source) => source.url),
      verifiedPrimarySourceUrls: primarySources,
      foundPrimarySources: enrichment.sources.length,
      verifiedPrimarySources: enrichment.sources.filter((source) => source.verified).length,
      verifiedFacts: enrichment.verifiedFacts.map((fact) => fact.statement),
      secondarySourceReview: enrichment.secondaryReview,
      secondarySourceFallbackUsed: false,
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
      decisionReason: complete
        ? "Akzeptiert: Leserinteresse, Source-Gate, KI-Entwurf und Qualitaetschecks bestanden."
        : aiDraftMap.has(candidate.id)
          ? "Abgelehnt: Qualitaetsgate nach KI-Entwurf nicht bestanden."
          : "Nicht vollstaendig: Source-Gate bestanden, aber KI/Reader-Edit lieferte keinen fertigen Entwurf.",
      recommendation: complete
        ? readerInterest.score < 75
          ? "Vollständigen Entwurf besonders sorgfältig redaktionell prüfen."
          : "Vollständigen Entwurf manuell prüfen."
        : scaffold
          ? "Offizielle Primärquelle und geprüfte Fakten ergänzen."
          : "Qualitätsfehler beheben, bevor ein Draft gespeichert wird.",
      missingFacts: complete ? [] : [
        ...Object.values(reviews).flatMap((review) => review.requiredFixes),
        ...(aiDraftMap.has(candidate.id) ? [] : ["Gepruefter KI-Entwurf fehlt."]),
        ...(fullGateComplete && !complete ? ["Maximale Anzahl vollstaendiger Drafts in diesem Batch erreicht."] : [])
      ],
      entityAnalysis: enrichment.entityAnalysis,
      sourceDiagnostics: enrichment.sourceDiagnostics,
      publishabilityScore: publishabilityMap.get(candidate.id),
      finalStatus: finalStatusFor({
        candidate,
        entry: enrichment,
        gateDetails,
        complete,
        scaffold,
        aiInvoked,
        aiErrorCode: aiResult.errorCode,
        reviews
      })
    });
  }

  const resultIds = new Set(results.map((entry) => entry.candidateId));
  for (const candidate of queue.candidates) {
    if (resultIds.has(candidate.id)) continue;
    const published = publishedSlugs.has(candidateDraftSlug(candidate, options.articleTypeDefault));
    results.push(skippedQueueCandidateResult({
      candidate,
      articleType: options.articleTypeDefault,
      finalStatus: published ? "duplicate" : "skipped-after-target-reached",
      reason: published
        ? "Duplicate uebersprungen: Zielslug ist bereits als veroeffentlichter Artikel vorhanden."
        : "skipped-after-target-reached: Kandidat war in der Queue, wurde aber nicht fuer die aktive Batch-Verarbeitung ausgewaehlt."
    }));
  }

  const reportDirectory = join(rootDirectory, "docs", "editorial", "batch-reports");
  await mkdir(reportDirectory, { recursive: true });
  const reportPath = join(reportDirectory, `${reportDate}-${runId}.md`);
  const rejected = results.filter((entry) => entry.status === "rejected");
  const researchStubs = results.filter((entry) => entry.status === "needs-source-review");
  const skippedDuplicates = results.filter((entry) => /Duplicate uebersprungen/i.test(entry.decisionReason));
  const noNewsEventCandidates = results.filter((entry) => entry.finalStatus === "steam-ranking-without-news").length;
  const entityErrorCandidates = results.filter((entry) => entry.finalStatus === "entity-needs-resolution").length;
  const sourceErrorCandidates = results.filter((entry) => entry.finalStatus === "source-gate-rejected").length;
  const insufficientFactCandidates = results.filter((entry) => entry.finalStatus === "insufficient-verified-facts").length;
  const secondaryArticlesChecked = results.reduce((sum, entry) =>
    sum + (entry.secondarySourceReview?.articlesChecked ?? 0), 0);
  const secondaryArticlesRead = results.reduce((sum, entry) =>
    sum + (entry.secondarySourceReview?.fullTextReadCount ?? 0), 0);
  const secondarySourceReviewDrafts = results.filter((entry) => entry.status === "secondary-source-review").length;
  const rejectedReportPath = rejected.length
    ? join(reportDirectory, `${reportDate}-${runId}-rejected.md`)
    : undefined;
  const result: EditorialBatchResult = {
    generatedAt: timestamp,
    reportDate,
    branchName,
    checkedCandidates: results.length,
    generatedDrafts: new Set(results.flatMap((entry) => entry.filePath ? [entry.filePath] : [])).size,
    completeDrafts: new Set(results.flatMap((entry) =>
      entry.status === "draft" && entry.filePath ? [entry.filePath] : []
    )).size,
    researchStubs: researchStubs.length,
    skippedDuplicates: skippedDuplicates.length,
    rejectedCandidates: rejected.length + researchStubs.length,
    noNewsEventCandidates,
    entityErrorCandidates,
    sourceErrorCandidates,
    insufficientFactCandidates,
    queueCandidateCount: queue.candidates.length,
    queueGeneratedAt: queue.generatedAt,
    queuePath: displayQueuePath(queuePath, rootDirectory),
    queueHash,
    secondaryArticlesChecked,
    secondaryArticlesRead,
    secondarySourceReviewDrafts,
    aiCallsAttempted: aiResult.attempts ?? 0,
    aiCallsSuccessful: aiDraftMap.size,
    aiCallsFailed: Math.max(0, (aiResult.attempts ?? 0) - (aiResult.drafts.length ? 1 : 0)),
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
    selectionMode = "manual",
    fallbackToQueue = "true"
  ] = process.argv.slice(2);
  const result = await createEditorialBatch({
    candidateIds: candidateInput.split(","),
    selectionMode: selectionMode as BatchSelectionMode,
    articleTypeDefault: articleType as BatchArticleType,
    primarySourceGroups: parseSourceGroups(sourceInput),
    editorialNote,
    maxArticles: Number.parseInt(maxInput, 10),
    queuePath,
    fallbackToQueue: fallbackToQueue !== "false"
  });
  console.log(JSON.stringify(result, null, 2));

  if (process.env.GITHUB_OUTPUT) {
    const output = {
      branchName: result.branchName,
      reportPath: relative(process.cwd(), result.reportPath).replace(/\\/g, "/"),
      checkedCandidates: result.checkedCandidates,
      generatedDrafts: result.generatedDrafts,
      completeDrafts: result.completeDrafts,
      researchStubs: result.researchStubs,
      skippedDuplicates: result.skippedDuplicates,
      rejectedCandidates: result.rejectedCandidates,
      secondaryArticlesChecked: result.secondaryArticlesChecked,
      secondaryArticlesRead: result.secondaryArticlesRead,
      secondarySourceReviewDrafts: result.secondarySourceReviewDrafts,
      queueCandidateCount: result.queueCandidateCount,
      queueGeneratedAt: result.queueGeneratedAt,
      queuePath: result.queuePath,
      queueHash: result.queueHash,
      aiCallsAttempted: result.aiCallsAttempted,
      aiCallsSuccessful: result.aiCallsSuccessful,
      aiCallsFailed: result.aiCallsFailed,
      aiStatus: result.ai.reason,
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
