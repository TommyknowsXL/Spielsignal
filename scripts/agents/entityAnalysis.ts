import { normalizeTitle } from "../../src/config/newsSources";
import { extractGameTitle } from "./gameTitle";
import type { EditorialCandidate } from "./types";

export type EntityType = "game" | "company" | "platform" | "event" | "developer" | "publisher" | "person" | "unknown";
export type TopicType =
  | "game-update"
  | "patchnotes"
  | "release"
  | "demo"
  | "trailer"
  | "new-game-announcement"
  | "company-news"
  | "financial-news"
  | "legal/regulatory"
  | "platform-news"
  | "event"
  | "opinion/community-topic"
  | "unknown";

export type CandidateEntityAnalysis = {
  cleanedTitle: string;
  removedTitleParts: string[];
  mainEntity?: string;
  entityType: EntityType;
  topicType: TopicType;
  searchTerms: string[];
  sourceGroups: string[];
  needsResolution: boolean;
  referenceEntities: string[];
};

const EDITORIAL_PATTERNS = [
  /^(?:news|video|plus|preview|report|test|meinung|analyse)\s*[:\-]\s*/i,
  /^["'Â»„”]?w(?:[üu]|ue)rdet ihr das spielen\??["'Â«“]?\s*(?:[-–—:]\s*)?/i,
  /^das m[üu]sst ihr wissen\s*(?:[-–—:]\s*)?/i,
  /^jetzt wird es spannend\s*(?:[-–—:]\s*)?/i,
  /^wir haben es gespielt\s*(?:[-–—:]\s*)?/i,
  /^unsere meinung\s*(?:[-–—:]\s*)?/i
];

const COMPANY_ALIASES = new Map<string, string>([
  ["electronic arts", "Electronic Arts"],
  ["ea", "Electronic Arts"],
  ["ubisoft", "Ubisoft"],
  ["microsoft", "Microsoft"],
  ["sony", "Sony"],
  ["take two", "Take-Two"],
  ["take-two", "Take-Two"],
  ["activision blizzard", "Activision Blizzard"],
  ["capcom", "Capcom"],
  ["valve", "Valve"]
]);

const PLATFORM_ALIASES = new Map<string, string>([
  ["steam", "Steam"],
  ["epic games store", "Epic Games Store"],
  ["gog", "GOG"],
  ["pc game pass", "PC Game Pass"],
  ["game pass", "Game Pass"]
]);

const EVENT_ALIASES = new Map<string, string>([
  ["steam next fest", "Steam Next Fest"],
  ["next fest", "Steam Next Fest"],
  ["gamescom", "gamescom"],
  ["summer game fest", "Summer Game Fest"],
  ["the game awards", "The Game Awards"]
]);

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function cleanEditorialTitleParts(title: string): { cleanedTitle: string; removedTitleParts: string[] } {
  let cleanedTitle = collapseWhitespace(title);
  const removedTitleParts: string[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of EDITORIAL_PATTERNS) {
      const match = cleanedTitle.match(pattern);
      if (!match?.[0]) continue;
      removedTitleParts.push(collapseWhitespace(match[0].replace(/[-–—:]+$/, "")));
      cleanedTitle = collapseWhitespace(cleanedTitle.replace(pattern, ""));
      changed = true;
    }
  }
  return { cleanedTitle, removedTitleParts };
}

function firstAlias(haystack: string, aliases: Map<string, string>): string | undefined {
  const normalized = normalizeTitle(haystack);
  for (const [alias, canonical] of aliases) {
    if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalized)) {
      return canonical;
    }
  }
  return undefined;
}

function classifyTopic(text: string): TopicType {
  if (/\b(schulden|milliarden|umsatz|gewinn|verlust|investor|earnings|quartal|gesch[aä]ftsbericht|werbung|strategie)\b/i.test(text)) {
    return /\b(schulden|milliarden|umsatz|gewinn|verlust|investor|earnings|quartal|gesch[aä]ftsbericht)\b/i.test(text)
      ? "financial-news"
      : "company-news";
  }
  if (/\b(gericht|klage|beh(?:[oö]|oe)rde|kartell|regulator|gesetz|eu-kommission|ftc|sec|untersuchung)\b/i.test(text)) return "legal/regulatory";
  if (/\b(wunschliste|welches spiel|eure meinung|community|diskussion|umfrage|kommentar)\b/i.test(text)) return "opinion/community-topic";
  if (/\b(next fest|festival|showcase|gamescom|summer game fest|the game awards)\b/i.test(text)) return "event";
  if (/\b(patchnotes|changelog|hotfix)\b/i.test(text)) return "patchnotes";
  if (/\b(update|patch)\b/i.test(text)) return "game-update";
  if (/\b(demo|spielbar)\b/i.test(text)) return "demo";
  if (/\b(trailer|video)\b/i.test(text)) return "trailer";
  if (/\b(release|erscheint|termin|launch|early access|vollversion)\b/i.test(text)) return "release";
  if (/\b(neues mittelalter-rollenspiel|angek[üu]ndigt|ank[üu]ndigung|enth[üu]llt|vorgestellt)\b/i.test(text)) return "new-game-announcement";
  if (/\b(steam|epic games store|gog|game pass)\b/i.test(text)) return "platform-news";
  return "unknown";
}

function sourceGroupsFor(entityType: EntityType, topicType: TopicType): string[] {
  if (topicType === "financial-news" || topicType === "company-news" || entityType === "company" || entityType === "publisher") {
    return ["investor-relations", "company-newsroom", "annual-reports", "earnings-releases", "sec-filings", "official-statements"];
  }
  if (topicType === "legal/regulatory") {
    return ["regulator-sites", "court-documents", "company-statements", "legal-procedure-pages"];
  }
  if (topicType === "platform-news" || topicType === "event" || entityType === "platform" || entityType === "event") {
    return ["platform-news", "event-pages", "rules-and-date-announcements", "official-blog"];
  }
  return ["steam-store", "steam-appdetails", "steam-news", "developer-site", "publisher-site", "patchnotes", "official-trailer", "official-social"];
}

function searchTermsFor(entity: string | undefined, topicType: TopicType, title: string): string[] {
  const base = entity ? [entity] : [];
  if (!entity) return [title].filter(Boolean);
  if (topicType === "financial-news") {
    return [...base, `${entity} investor relations`, `${entity} earnings`, `${entity} annual report`, `${entity} SEC filings`];
  }
  if (topicType === "company-news") return [...base, `${entity} newsroom`, `${entity} press release`, `${entity} official statement`];
  if (topicType === "legal/regulatory") return [...base, `${entity} regulator`, `${entity} court filing`, `${entity} official statement`];
  if (topicType === "event") return [...base, `${entity} official`, `${entity} dates`, `${entity} rules`];
  if (topicType === "platform-news") return [...base, `${entity} news`, `${entity} blog`, `${entity} official`];
  return [...base, `${entity} Steam`, `${entity} patch notes`, `${entity} official`];
}

function titleFromUrlSlug(sourceUrl: string | undefined): string | undefined {
  if (!sourceUrl) return undefined;
  try {
    const url = new URL(sourceUrl);
    const slug = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ");
    const cleaned = collapseWhitespace(slug
      .replace(/\b(update|patch|hotfix|release|trailer|demo|news|artikel|review|test)\b.*$/i, "")
      .replace(/\b\d{3,}\b/g, ""));
    if (/^[a-z0-9][a-z0-9\s:'&]+$/i.test(cleaned) && cleaned.split(/\s+/).length <= 6 && cleaned.length >= 3) {
      return cleaned.replace(/\b\w/g, (char) => char.toLocaleUpperCase("de"));
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function analyzeEditorialCandidate(candidate: Pick<EditorialCandidate, "title" | "gameTitle" | "sourceUrl" | "summary" | "category" | "scoreReasons">): CandidateEntityAnalysis {
  const { cleanedTitle, removedTitleParts } = cleanEditorialTitleParts(candidate.title);
  const haystack = [cleanedTitle, candidate.summary, candidate.category, candidate.scoreReasons?.join(" "), candidate.sourceUrl].filter(Boolean).join(" ");
  const topicType = classifyTopic(haystack);
  const event = firstAlias(haystack, EVENT_ALIASES);
  const platform = firstAlias(haystack, PLATFORM_ALIASES);
  const company = firstAlias(haystack, COMPANY_ALIASES);
  const referenceEntities = [...new Set([event, platform, company].filter((value): value is string => Boolean(value)))];

  let mainEntity = candidate.gameTitle?.trim();
  let entityType: EntityType = mainEntity ? "game" : "unknown";
  if (!mainEntity && (topicType === "financial-news" || topicType === "company-news") && company) {
    mainEntity = company;
    entityType = company === "Electronic Arts" ? "publisher" : "company";
  } else if (!mainEntity && topicType === "event" && event) {
    mainEntity = event;
    entityType = "event";
  } else if (!mainEntity && (topicType === "platform-news" || platform) && platform && !event) {
    mainEntity = platform;
    entityType = "platform";
  } else if (!mainEntity) {
    const extracted = extractGameTitle(cleanedTitle);
    if (extracted && !firstAlias(extracted, PLATFORM_ALIASES) && !firstAlias(extracted, EVENT_ALIASES) && !firstAlias(extracted, COMPANY_ALIASES)) {
      mainEntity = extracted;
      entityType = "game";
    }
  }
  if (!mainEntity && ["game-update", "patchnotes", "release", "demo", "trailer"].includes(topicType)) {
    const slugTitle = titleFromUrlSlug(candidate.sourceUrl);
    if (slugTitle && !firstAlias(slugTitle, PLATFORM_ALIASES) && !firstAlias(slugTitle, EVENT_ALIASES) && !firstAlias(slugTitle, COMPANY_ALIASES)) {
      mainEntity = slugTitle;
      entityType = "game";
    }
  }

  const needsResolution = !mainEntity || (
    entityType === "game" &&
    /^(steam|steam next fest|electronic arts|ea|w(?:[üu]|ue)rdet ihr das spielen\??)$/i.test(mainEntity)
  );
  if (needsResolution && entityType === "game") {
    mainEntity = undefined;
    entityType = "unknown";
  }

  return {
    cleanedTitle,
    removedTitleParts,
    mainEntity,
    entityType,
    topicType,
    searchTerms: searchTermsFor(mainEntity, topicType, cleanedTitle),
    sourceGroups: sourceGroupsFor(entityType, topicType),
    needsResolution,
    referenceEntities
  };
}
