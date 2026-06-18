import { createHash } from "node:crypto";
import type { NewsSource } from "../../src/config/newsSources";
import {
  getAggregatedNews,
  type AggregatedNewsItem,
  type FeedSourceStatus
} from "../../src/lib/newsFeed";
import {
  MAX_SCOUT_INPUT_CANDIDATES,
  pcGamingKeywords,
  recommendArticleType,
  scoreCandidate,
  unrelatedTopicKeywords
} from "./agentConfig";
import { classifyFreeReference } from "./freeReference";
import { extractGameTitle } from "./gameTitle";
import { resolveLocalFallback } from "./imageScout";
import type { EditorialCandidate, EditorialTopicClassification } from "./types";

export type NewsScoutResult = {
  candidates: EditorialCandidate[];
  statuses: FeedSourceStatus[];
};

function stableId(url: string): string {
  return `rss-${createHash("sha256").update(url).digest("hex").slice(0, 16)}`;
}

export function hasPcGamingReference(item: AggregatedNewsItem): boolean {
  const title = item.title.toLocaleLowerCase("de").normalize("NFKD");
  const tokens = new Set(title.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const positive = pcGamingKeywords.some((keyword) => tokens.has(keyword));
  const unrelated = unrelatedTopicKeywords.some((keyword) => tokens.has(keyword));
  return positive && !unrelated;
}

export function classifyEditorialTopic(title: string, sourceName = ""): EditorialTopicClassification {
  const value = `${title} ${sourceName}`.toLocaleLowerCase("de");
  if (/\b(plus|abo|premium)\b/.test(value)) return "paywalled-plus-content";
  if (/\b(kolumne|column|meinung|opinion|kommentar)\b/.test(value)) return "column";
  if (/\b(special|liste|listicle|die besten|top \d+|ranking|rangliste)\b/.test(value)) return "special";
  if (/\b(kaufberatung|buying guide|beste angebote|angebot|deals)\b/.test(value)) return "buying-guide";
  if (/\b(sale|rabatt|sale-roundup|steam sale)\b/.test(value)) return "sale-roundup";
  if (/\b(community|reddit|fans diskutieren|frage der woche)\b/.test(value)) return "community-discussion";
  if (/\b(patchnotes|patch notes|changelog|hotfix)\b/.test(value)) return "patchnotes";
  if (/\b(update|aktualisierung|season|saison)\b/.test(value)) return "game-update";
  if (/\b(demo|spielbar)\b/.test(value)) return "demo-release";
  if (/\b(release[- ]?termin|erscheint am|release date|veroeffentlichungsdatum|veröffentlichungsdatum)\b/.test(value)) return "release-date";
  if (/\b(angekuendigt|angekündigt|ankuendigung|ankündigung|announced|neues spiel)\b/.test(value)) return "new-game-announcement";
  if (/\b(trailer|gameplay-video|video)\b/.test(value)) return "trailer";
  if (/\b(dlc)\b/.test(value)) return "DLC";
  if (/\b(erweiterung|expansion|addon)\b/.test(value)) return "expansion";
  if (/\b(studio|entlassung|uebernahme|übernahme|gekauft|schliesst|schließt)\b/.test(value)) return "studio-news";
  if (/\b(publisher|investor|quartal|geschaeftszahlen|geschäftszahlen)\b/.test(value)) return "publisher-news";
  if (/\b(klage|gericht|kartell|regulier|legal|lawsuit)\b/.test(value)) return "legal/regulatory";
  if (/\b(xbox|playstation|steam|epic games store|gog|plattform)\b/.test(value)) return "platform-update";
  if (/\b(event|showcase|direct|gamescom|summer game fest)\b/.test(value)) return "event-announcement";
  if (/\b(verschoben|delay|delayed)\b/.test(value)) return "confirmed-delay";
  if (/\b(eingestellt|cancelled|canceled|abgebrochen)\b/.test(value)) return "confirmed-cancellation";
  if (/\b(roadmap|fahrplan)\b/.test(value)) return "official-roadmap";
  return "general-news";
}

export function isRecentEnoughForQueue(item: AggregatedNewsItem, now = Date.now()): boolean {
  const ageMs = now - Date.parse(item.date);
  if (Number.isNaN(ageMs)) return false;
  if (ageMs <= 48 * 60 * 60 * 1000) return true;
  return ageMs <= 7 * 24 * 60 * 60 * 1000 && [
    "patchnotes",
    "game-update",
    "demo-release",
    "release-date",
    "new-game-announcement",
    "trailer",
    "DLC",
    "expansion"
  ].includes(classifyEditorialTopic(item.title, item.sourceName));
}

export async function runNewsScout(options: {
  sources?: NewsSource[];
  forceRefresh?: boolean;
} = {}): Promise<NewsScoutResult> {
  const result = await getAggregatedNews(options);
  const candidates = result.items
    .filter((item) => isRecentEnoughForQueue(item))
    .filter(hasPcGamingReference)
    .slice(0, MAX_SCOUT_INPUT_CANDIDATES)
    .map((item): EditorialCandidate => {
      const freeReference = classifyFreeReference(item.title);
      const gameTitle = extractGameTitle(item.title);
      const topicClassification = classifyEditorialTopic(item.title, item.sourceName);
      const base = {
        id: stableId(item.url),
        createdAt: item.date,
        sourceType: "rss-news",
        sourceName: item.sourceName,
        sourceUrl: item.url,
        title: item.title,
        gameTitle,
        category: item.category,
        freeReferenceType: freeReference.type,
        freePromotionConfirmed: false,
        articleType: recommendArticleType({
          sourceType: "rss-news",
          title: item.title,
          hasFreeReference: freeReference.type !== "none"
        }),
        score: 0,
        scoreReasons: [],
        topicClassification,
        imageStatus: "fallback",
        imagePath: resolveLocalFallback(item.title, item.category),
        rightsNotes: "Lokales SpielSignal-Fallback bis zur manuellen Bildfreigabe.",
        editorialStatus: "needs-review",
        openChecks: [
          "Inhalt und PC-Bezug anhand der Originalquelle redaktionell prüfen.",
          ...(gameTitle
            ? []
            : ["Spielname konnte nicht sicher aus der Überschrift ermittelt werden."]),
          ...(freeReference.requiresReview
            ? ["Gratis-Art, offizielle Quelle und gegebenenfalls Laufzeit bestätigen."]
            : [])
        ],
        recommendedNextAction:
          "Originalmeldung öffnen, Fakten prüfen und bei Interesse einen eigenen Entwurf beauftragen."
      } satisfies EditorialCandidate;
      const scoring = scoreCandidate(base);
      return { ...base, score: scoring.score, scoreReasons: scoring.reasons };
    });

  return { candidates, statuses: result.statuses };
}
