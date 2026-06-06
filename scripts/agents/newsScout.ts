import { createHash } from "node:crypto";
import type { NewsSource } from "../../src/config/newsSources";
import { resolveNewsImage } from "../../src/config/newsImageRules";
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

function isPossibleFreePromotion(title: string): boolean {
  return /\b(kostenlos|gratis|free weekend|free-to-play|verschenkt)\b/i.test(title);
}

export async function runNewsScout(options: {
  sources?: NewsSource[];
  forceRefresh?: boolean;
} = {}): Promise<NewsScoutResult> {
  const result = await getAggregatedNews(options);
  const candidates = result.items
    .filter(hasPcGamingReference)
    .map((item): EditorialCandidate => {
      const sourceType = isPossibleFreePromotion(item.title)
        ? "free-promotion"
        : "rss-news";
      const image = resolveNewsImage({
        articleUrl: item.url,
        title: item.title,
        category: item.category
      });
      const base = {
        id: stableId(item.url),
        createdAt: item.date,
        sourceType,
        sourceName: item.sourceName,
        sourceUrl: item.url,
        title: item.title,
        articleType: recommendArticleType({ sourceType, title: item.title }),
        score: 0,
        scoreReasons: [],
        imageStatus: image.status,
        imagePath: image.src,
        rightsNotes:
          image.status === "fallback"
            ? "Lokales SpielSignal-Fallback bis zur manuellen Bildfreigabe."
            : "Manuell freigegebene Bildquelle.",
        editorialStatus: "needs-review",
        openChecks:
          sourceType === "free-promotion"
            ? ["Laufzeit und Bedingungen der möglichen Gratis-Aktion bestätigen."]
            : ["Inhalt und PC-Bezug anhand der Originalquelle redaktionell prüfen."],
        recommendedNextAction:
          "Originalmeldung öffnen, Fakten prüfen und bei Interesse einen eigenen Entwurf beauftragen."
      } satisfies EditorialCandidate;
      const scoring = scoreCandidate(base);
      return { ...base, score: scoring.score, scoreReasons: scoring.reasons };
    });

  return { candidates, statuses: result.statuses };
}
