import { createHash } from "node:crypto";
import type { NewsSource } from "../../src/config/newsSources";
import {
  getAggregatedNews,
  type AggregatedNewsItem,
  type FeedSourceStatus
} from "../../src/lib/newsFeed";
import {
  pcGamingKeywords,
  recommendArticleType,
  scoreCandidate,
  unrelatedTopicKeywords
} from "./agentConfig";
import { classifyFreeReference } from "./freeReference";
import { extractGameTitle } from "./gameTitle";
import { resolveLocalFallback } from "./imageScout";
import type { EditorialCandidate } from "./types";

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

export async function runNewsScout(options: {
  sources?: NewsSource[];
  forceRefresh?: boolean;
} = {}): Promise<NewsScoutResult> {
  const result = await getAggregatedNews(options);
  const candidates = result.items
    .filter(hasPcGamingReference)
    .map((item): EditorialCandidate => {
      const freeReference = classifyFreeReference(item.title);
      const gameTitle = extractGameTitle(item.title);
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
