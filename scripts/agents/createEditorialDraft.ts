import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { EditorialCandidate, EditorialQueueReport } from "./types";

const ALLOWED_ARTICLE_TYPES = [
  "news-overview",
  "release-check",
  "first-impression",
  "free-promotion"
] as const;

type DraftArticleType = (typeof ALLOWED_ARTICLE_TYPES)[number];

export type CreateEditorialDraftOptions = {
  candidateId: string;
  articleType?: DraftArticleType;
  primarySourceUrls?: string[];
  editorialNote?: string;
  allowSecondarySourceReview?: boolean;
  allowResearchStub?: boolean;
  rootDirectory?: string;
  generatedAt?: string;
  runId?: string;
};

export type CreatedEditorialDraft = {
  candidate: EditorialCandidate;
  slug: string;
  title: string;
  filePath: string;
  branchName: string;
  status: "draft" | "secondary-source-review" | "needs-source-review";
  primarySources: string[];
  secondarySources: string[];
  openChecks: string[];
};

const MAGAZINE_HOSTS = [
  "gamestar.de",
  "pcgames.de",
  "pcgameshardware.de",
  "mein-mmo.de",
  "gamepro.de",
  "xboxdynasty.de",
  "reddit.com",
  "wikipedia.org",
  ["steamdb", "info"].join("."),
  "google.com",
  "google.de",
  "fandom.com",
  "wiki.gg",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com"
];

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

function uniqueHttpUrls(values: string[]): string[] {
  return [...new Set(values.flatMap((value) => {
    try {
      const url = new URL(value.trim());
      return ["http:", "https:"].includes(url.protocol) ? [url.toString()] : [];
    } catch {
      return [];
    }
  }))];
}

export function isSuitablePrimarySource(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "").toLocaleLowerCase("de");
    const blockedHost = MAGAZINE_HOSTS.some((magazineHost) =>
      host === magazineHost || host.endsWith(`.${magazineHost}`)
    );
    const forumPath = /\/(?:forum|forums|community|discussions?)(?:\/|$)/i.test(url.pathname);
    return !blockedHost && !forumPath;
  } catch {
    return false;
  }
}

function articleSections(articleType: DraftArticleType): string {
  if (articleType === "release-check") {
    return `## Was ist das für ein Spiel?

_Mit Fakten aus den offiziellen Quellen ergänzen._

## Für wen könnte es interessant sein?

_Zielgruppe sachlich einordnen._

## Was wissen wir bereits?

- Offiziell bestätigte Fakten ergänzen.

## Was ist noch offen?

- Unbestätigte oder fehlende Angaben dokumentieren.

## Unsere vorläufige Einschätzung

_Redaktionelle Einordnung klar von Fakten trennen._
`;
  }
  if (articleType === "free-promotion") {
    return `## Was ist kostenlos?

_Art und Umfang der Aktion anhand der offiziellen Quelle prüfen._

## Wie lange gilt die Aktion?

_Start, Ende und Zeitzone ergänzen._

## Bleibt das Spiel dauerhaft in der Bibliothek oder ist es nur testbar?

_Free-to-keep, Free Weekend, Demo oder Free-to-play eindeutig benennen._

## Steam-Link

_Offiziellen Store-Link prüfen und ergänzen._
`;
  }
  return `## Was ist passiert?

_Ereignis ausschließlich anhand belegbarer Fakten aus Primärquellen zusammenfassen._

## Die wichtigsten Fakten

- Offiziell bestätigte Fakten ergänzen.

## Was bedeutet das für PC-Spieler?

_Konkrete Auswirkungen auf die PC-Version erklären._

## Unsere Einordnung

_Eigene sachliche Einordnung ergänzen und offene Fragen sichtbar lassen._
`;
}

function normalizeArticleType(candidate: EditorialCandidate, requested?: DraftArticleType): DraftArticleType {
  if (requested) return requested;
  if (candidate.articleType === "free-promotion" || candidate.articleType === "free-promotion-candidate") {
    return "free-promotion";
  }
  if (candidate.articleType === "release-check" || candidate.articleType === "first-impression") {
    return candidate.articleType;
  }
  return "news-overview";
}

function renderDraft(input: {
  candidate: EditorialCandidate;
  articleType: DraftArticleType;
  title: string;
  slug: string;
  timestamp: string;
  status: "draft" | "secondary-source-review" | "needs-source-review";
  primarySources: string[];
  secondarySources: string[];
  editorialNote?: string;
  openChecks: string[];
}): string {
  const candidate = input.candidate;
  const steamSource = candidate.steamStoreUrl && isSuitablePrimarySource(candidate.steamStoreUrl)
    ? candidate.steamStoreUrl
    : undefined;
  const allPrimarySources = uniqueHttpUrls([
    ...input.primarySources,
    ...(steamSource ? [steamSource] : [])
  ]);
  const fallbackImage = candidate.imagePath ?? "/images/categories/news-default.svg";
  const heroImage = candidate.imageStatus === "approved" && candidate.imageCandidateUrl
    ? candidate.imageCandidateUrl
    : fallbackImage;
  const imageSourceType = heroImage.startsWith("https://shared.fastly.steamstatic.com/")
    ? "steam-store"
    : "spielsignal-fallback";
  const notes = [
    ...(input.editorialNote?.trim() ? [input.editorialNote.trim()] : []),
    ...input.openChecks
  ];

  return `---
title: ${JSON.stringify(input.title)}
slug: ${JSON.stringify(input.slug)}
articleType: ${JSON.stringify(input.articleType)}
status: ${JSON.stringify(input.status)}
createdAt: ${JSON.stringify(input.timestamp)}
updatedAt: ${JSON.stringify(input.timestamp)}
author: "SpielSignal-Redaktion"
${candidate.gameTitle ? `gameTitle: ${JSON.stringify(candidate.gameTitle)}\n` : ""}${candidate.steamAppId ? `steamAppId: ${JSON.stringify(candidate.steamAppId)}\n` : ""}tags: []
summary: "Teaser nach Quellenprüfung ergänzen."
seoTitle: ${JSON.stringify(`${input.title} | SpielSignal`)}
seoDescription: "SEO-Beschreibung nach Faktenprüfung ergänzen."
heroImage: ${JSON.stringify(heroImage)}
heroImageAlt: ${JSON.stringify(`Titelbild zu ${input.title}`)}
heroImageSourceName: ${JSON.stringify(imageSourceType === "steam-store" ? "Steam" : "SpielSignal")}
heroImageSourceType: ${JSON.stringify(imageSourceType)}
${imageSourceType === "steam-store" && candidate.imageSourcePageUrl ? `heroImageSourceUrl: ${JSON.stringify(candidate.imageSourcePageUrl)}\n` : ""}imageRightsStatus: ${JSON.stringify(candidate.imageStatus === "approved" ? "approved" : "fallback")}
externalTipSources: ${JSON.stringify(candidate.sourceType === "rss-news" ? [candidate.sourceUrl] : [])}
primarySources: ${JSON.stringify(allPrimarySources)}
secondarySources: ${JSON.stringify(input.secondarySources)}
editorialNotes: ${JSON.stringify(notes)}
---

${input.status === "secondary-source-review" ? "> **Sekundaerquellen-Pruefung: Nicht veroeffentlichbar, bis eine Redaktion die Fakten und Primaerquelle geprueft hat.**\n\n" : ""}${input.status === "needs-source-review" ? "> **Offizielle Primaerquelle oder zweite belastbare Quelle fehlt. Vor Veroeffentlichung ergaenzen.**\n\n" : ""}# ${input.title}

_Teaser nach Prüfung der offiziellen Quellen formulieren._

${articleSections(input.articleType)}
## Quellen

${allPrimarySources.length
  ? allPrimarySources.map((source) => `- ${source}`).join("\n")
  : "- Offizielle Primärquelle fehlt."}

## Sekundaerquellen

${input.secondarySources.length
  ? input.secondarySources.map((source) => `- ${source}`).join("\n")
  : "- Keine zweite belastbare Quelle dokumentiert."}

## Offene Pruefpunkte

${input.openChecks.map((check) => `- ${check}`).join("\n")}
`;
}

export async function createEditorialDraft(
  options: CreateEditorialDraftOptions
): Promise<CreatedEditorialDraft> {
  const rootDirectory = options.rootDirectory ?? process.cwd();
  if (!options.candidateId.trim()) throw new Error("Candidate ID ist erforderlich.");
  const queuePath = join(rootDirectory, "src", "data", "editorial", "latest-queue.json");
  const report = JSON.parse(await readFile(queuePath, "utf8")) as EditorialQueueReport;
  const candidate = report.candidates.find((entry) => entry.id === options.candidateId);
  if (!candidate) throw new Error(`Candidate ID nicht gefunden: ${options.candidateId}`);
  const articleType = normalizeArticleType(candidate, options.articleType);
  if (!ALLOWED_ARTICLE_TYPES.includes(articleType)) {
    throw new Error(`Nicht unterstützter Artikeltyp: ${articleType}`);
  }

  const suppliedPrimarySources = uniqueHttpUrls(options.primarySourceUrls ?? [])
    .filter(isSuitablePrimarySource);
  const officialCandidateSource = candidate.officialPrimarySourceUrl && isSuitablePrimarySource(candidate.officialPrimarySourceUrl)
    ? candidate.officialPrimarySourceUrl
    : undefined;
  const steamSource = candidate.steamStoreUrl && isSuitablePrimarySource(candidate.steamStoreUrl)
    ? candidate.steamStoreUrl
    : undefined;
  const primarySources = uniqueHttpUrls([
    ...suppliedPrimarySources,
    ...(officialCandidateSource ? [officialCandidateSource] : []),
    ...(steamSource ? [steamSource] : [])
  ]);
  const secondarySources = uniqueHttpUrls([
    candidate.sourceUrl,
    ...(candidate.clusterSourceUrls ?? [])
  ]).filter((source) => !primarySources.includes(source));
  const hasSecondaryFallback = (candidate.independentSourceCount ?? secondarySources.length) >= 2 && secondarySources.length >= 2;
  const status = primarySources.length
    ? "draft"
    : hasSecondaryFallback && options.allowSecondarySourceReview !== false
      ? "secondary-source-review"
      : options.allowResearchStub !== false
        ? "needs-source-review"
        : (() => { throw new Error("Keine Primaerquelle und Review-/Stub-Erzeugung ist deaktiviert."); })();
  const timestamp = options.generatedAt ?? new Date().toISOString();
  const title = candidate.gameTitle
    ? `${candidate.gameTitle}: SpielSignal-Entwurf`
    : `${candidate.title}: SpielSignal-Entwurf`;
  const slug = slugify(`${candidate.gameTitle ?? candidate.title}-${articleType}`);
  const filePath = join(rootDirectory, "src", "content", "drafts", `${slug}.md`);
  const openChecks = [
    ...candidate.openChecks,
    ...(status === "secondary-source-review"
      ? ["Primaerquelle nachrecherchieren; Sekundaerquellen nur als Review-Basis nutzen."]
      : []),
    ...(status === "needs-source-review"
      ? ["Offizielle Primaerquelle oder zweite belastbare Quelle fehlt. Vor Veroeffentlichung ergaenzen."]
      : []),
    "Fakten, eigene Struktur, Bildquelle und SEO-Angaben manuell prüfen."
  ];

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, renderDraft({
    candidate,
    articleType,
    title,
    slug,
    timestamp,
    status,
    primarySources,
    secondarySources,
    editorialNote: options.editorialNote,
    openChecks
  }), "utf8");

  return {
    candidate,
    slug,
    title,
    filePath,
    branchName: `editorial-draft/${slug}-${options.runId ?? process.env.GITHUB_RUN_ID ?? "local"}`,
    status,
    primarySources,
    secondarySources,
    openChecks
  };
}

const executedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (executedDirectly) {
  const [
    candidateId,
    articleType = "",
    primarySourceInput = "",
    editorialNote = "",
    allowSecondarySourceReview = "true",
    allowResearchStub = "true"
  ] = process.argv.slice(2);
  const result = await createEditorialDraft({
    candidateId,
    articleType: articleType ? articleType as DraftArticleType : undefined,
    primarySourceUrls: primarySourceInput.split(",").map((value) => value.trim()).filter(Boolean),
    editorialNote,
    allowSecondarySourceReview: allowSecondarySourceReview !== "false",
    allowResearchStub: allowResearchStub !== "false"
  });
  const output = {
    candidateId: result.candidate.id,
    slug: result.slug,
    title: result.title,
    filePath: result.filePath,
    branchName: result.branchName,
    status: result.status,
    articleType: articleType || result.candidate.articleType,
    gameTitle: result.candidate.gameTitle ?? "",
    steamAppId: result.candidate.steamAppId ?? "",
    externalTipSource: result.candidate.sourceUrl,
    primarySources: result.primarySources.join(", "),
    secondarySources: result.secondarySources.join(", "),
    imageSource: result.candidate.imageSourcePageUrl ?? result.candidate.imagePath ?? "",
    imageRightsStatus: result.candidate.imageStatus,
    openChecks: result.openChecks.join("; ")
  };
  console.log(JSON.stringify(output));

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    const lines = Object.entries(output).map(([key, value]) =>
      `${key}=${String(value).replace(/\r?\n/g, " ")}`
    );
    await writeFile(githubOutput, `${lines.join("\n")}\n`, { encoding: "utf8", flag: "a" });
  }
}
