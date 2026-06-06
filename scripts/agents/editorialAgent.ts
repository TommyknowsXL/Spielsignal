import { normalizeTitle, normalizeUrl } from "../../src/config/newsSources";
import { MAX_DAILY_CANDIDATES } from "./agentConfig";
import { applySafeImage } from "./imageScout";
import type { EditorialCandidate } from "./types";

function titleSimilarity(left: string, right: string): number {
  const leftTokens = new Set(
    normalizeTitle(left).split(" ").filter((token) => token.length > 2)
  );
  const rightTokens = new Set(
    normalizeTitle(right).split(" ").filter((token) => token.length > 2)
  );
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token)
  ).length;
  return intersection / new Set([...leftTokens, ...rightTokens]).size;
}

function sharesNamedAnchor(left: string, right: string): boolean {
  const leftTokens = new Set(normalizeTitle(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeTitle(right).split(" ").filter(Boolean));
  const shared = [...leftTokens].filter((token) => rightTokens.has(token));

  return (
    shared.some((token) => /^\d{3,}$/.test(token)) &&
    shared.some((token) => /^[a-z]{5,}$/.test(token))
  );
}

export function buildEditorialQueue(
  candidates: EditorialCandidate[],
  limit = MAX_DAILY_CANDIDATES
): EditorialCandidate[] {
  const urls = new Set<string>();
  const titles = new Set<string>();
  const acceptedTitles: string[] = [];
  const unique: EditorialCandidate[] = [];

  for (const candidate of candidates) {
    if (!candidate.sourceUrl) continue;
    const url = normalizeUrl(candidate.sourceUrl);
    const title = normalizeTitle(candidate.title);
    const isSimilar = acceptedTitles.some(
      (acceptedTitle) =>
        titleSimilarity(candidate.title, acceptedTitle) >= 0.5 ||
        sharesNamedAnchor(candidate.title, acceptedTitle)
    );
    if (urls.has(url) || titles.has(title) || isSimilar) continue;

    const safe = applySafeImage(candidate);
    unique.push({
      ...safe,
      articleType:
        safe.articleType === "test-candidate" ? "test-candidate" : safe.articleType,
      editorialStatus:
        safe.editorialStatus === "rejected" ? "rejected" : "needs-review"
    });
    urls.add(url);
    titles.add(title);
    acceptedTitles.push(candidate.title);
  }

  const ranked = unique
    .filter((candidate) => candidate.editorialStatus !== "rejected")
    .sort(
      (left, right) =>
        right.score - left.score ||
        Date.parse(right.createdAt) - Date.parse(left.createdAt)
    );
  const selected: EditorialCandidate[] = [];
  const rssSourceCounts = new Map<string, number>();
  let rssCount = 0;
  let hardwareCount = 0;
  let steamReleaseCount = 0;
  let steamTopSellerCount = 0;
  let steamMostPlayedCount = 0;
  const maximum = Math.min(limit, MAX_DAILY_CANDIDATES);

  const canSelect = (candidate: EditorialCandidate): boolean => {
    if (selected.some((entry) => entry.id === candidate.id)) return false;
    if (candidate.category === "Hardware" && hardwareCount >= 2) return false;
    if (candidate.sourceType === "steam-release" && steamReleaseCount >= 5) {
      return false;
    }
    if (candidate.sourceType === "steam-top-seller" && steamTopSellerCount >= 5) {
      return false;
    }
    if (candidate.sourceType === "steam-most-played" && steamMostPlayedCount >= 2) {
      return false;
    }
    if (candidate.sourceType !== "rss-news") return true;
    if (rssCount >= 5) return false;
    return (rssSourceCounts.get(candidate.sourceName) ?? 0) < 5;
  };
  const select = (candidate: EditorialCandidate): void => {
    selected.push(candidate);
    if (candidate.category === "Hardware") hardwareCount += 1;
    if (candidate.sourceType === "steam-release") steamReleaseCount += 1;
    if (candidate.sourceType === "steam-top-seller") steamTopSellerCount += 1;
    if (candidate.sourceType === "steam-most-played") steamMostPlayedCount += 1;
    if (candidate.sourceType === "rss-news") {
      rssCount += 1;
      rssSourceCounts.set(
        candidate.sourceName,
        (rssSourceCounts.get(candidate.sourceName) ?? 0) + 1
      );
    }
  };

  ranked
    .filter((candidate) => candidate.sourceType === "steam-release")
    .slice(0, 2)
    .forEach((candidate) => {
      if (canSelect(candidate)) select(candidate);
    });
  ranked
    .filter((candidate) => candidate.sourceType === "steam-top-seller")
    .sort((left, right) => (left.steamRank ?? 999) - (right.steamRank ?? 999))
    .slice(0, 5)
    .forEach((candidate) => {
      if (selected.length < maximum && canSelect(candidate)) select(candidate);
    });
  ranked
    .filter((candidate) => candidate.sourceType === "steam-most-played")
    .slice(0, 2)
    .forEach((candidate) => {
      if (selected.length < maximum && canSelect(candidate)) select(candidate);
    });

  for (const candidate of ranked) {
    if (selected.length >= maximum) break;
    if (canSelect(candidate)) select(candidate);
  }

  return selected.sort(
    (left, right) =>
      right.score - left.score ||
      Date.parse(right.createdAt) - Date.parse(left.createdAt)
  );
}
