import { normalizeTitle, normalizeUrl } from "../../src/config/newsSources";
import { MAX_DAILY_CANDIDATES } from "./agentConfig";
import { applySafeImage } from "./imageScout";
import { classifyEditorialTopic } from "./newsScout";
import type { EditorialCandidate, EditorialTopicClassification } from "./types";

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

const lowPriorityTypes: EditorialTopicClassification[] = [
  "opinion",
  "column",
  "special",
  "listicle",
  "buying-guide",
  "sale-roundup",
  "paywalled-plus-content",
  "community-discussion",
  "steam-ranking-without-news"
];

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function clusterKey(candidate: EditorialCandidate): string {
  const entity = normalizeTitle(candidate.gameTitle ?? candidate.title)
    .split(" ")
    .filter((token) => token.length > 2)
    .slice(0, 4)
    .join(" ");
  const topic = candidate.topicClassification ?? classifyEditorialTopic(candidate.title, candidate.sourceName);
  return `${entity || normalizeTitle(candidate.title).slice(0, 48)}:${topic}`;
}

function officialPrimarySource(candidate: EditorialCandidate): string | undefined {
  const url = candidate.officialPrimarySourceUrl ?? candidate.steamStoreUrl;
  if (url) return url;
  const host = sourceHost(candidate.sourceUrl);
  if (/\b(xbox wire|playstation blog|ubisoft news|ea news|epic games news|gog news|nintendo news)\b/i.test(candidate.sourceName)) {
    return candidate.sourceUrl;
  }
  if (
    candidate.sourceType !== "rss-news" ||
    /steampowered\.com|xbox\.com|playstation\.com|nintendo\.com|ea\.com|ubisoft\.com|epicgames\.com|gog\.com/i.test(host)
  ) {
    return candidate.sourceUrl;
  }
  return undefined;
}

function classifyCandidate(candidate: EditorialCandidate): EditorialTopicClassification {
  if (candidate.sourceType === "steam-top-seller" && !/(update|patch|release|demo|dlc|trailer|event|erh[a-zÃ¤ä]+lt|angekuendigt|angekündigt)/i.test(candidate.title)) {
    return "steam-ranking-without-news";
  }
  return candidate.topicClassification ?? classifyEditorialTopic(candidate.title, candidate.sourceName);
}

function buildClusters(candidates: EditorialCandidate[]): EditorialCandidate[] {
  const clusters: EditorialCandidate[][] = [];
  for (const candidate of candidates) {
    const key = clusterKey(candidate);
    const existing = clusters.find((cluster) =>
      cluster.some((entry) =>
        clusterKey(entry) === key ||
        titleSimilarity(entry.title, candidate.title) >= 0.42 ||
        sharesNamedAnchor(entry.title, candidate.title)
      )
    );
    if (existing) existing.push(candidate);
    else clusters.push([candidate]);
  }

  return clusters.map((cluster) => {
    const representative = [...cluster].sort((left, right) =>
      right.score - left.score || Date.parse(right.createdAt) - Date.parse(left.createdAt)
    )[0];
    const sourceUrls = [...new Set(cluster.map((entry) => normalizeUrl(entry.sourceUrl)))];
    const sourceNames = [...new Set(cluster.map((entry) => entry.sourceName))];
    const hosts = [...new Set(sourceUrls.map(sourceHost).filter(Boolean))];
    const officialUrl = cluster.map(officialPrimarySource).find(Boolean);
    const classification = classifyCandidate(representative);
    const clustered: EditorialCandidate = {
      ...representative,
      topicClassification: classification,
      clusterId: `cluster-${normalizeTitle(clusterKey(representative)).replace(/\s+/g, "-").slice(0, 64)}`,
      clusterTitle: representative.title,
      clusterSourceUrls: sourceUrls,
      clusterSourceNames: sourceNames,
      independentSourceCount: hosts.length,
      officialPrimarySourceUrl: officialUrl,
      officialPrimarySourceFound: Boolean(officialUrl),
      queueDiagnostics: [
        `${cluster.length} Meldung(en) im Themencluster`,
        `${hosts.length} unabhaengige Domain(s)`,
        officialUrl ? "Offizielle Primaerquelle im Cluster vorhanden" : "Keine offizielle Primaerquelle im Cluster erkannt"
      ]
    };
    const baseScore = clustered.score + (officialUrl ? 22 : 0) + (hosts.length >= 2 ? 16 : 0);
    const penalty = lowPriorityTypes.includes(classification) ? 45 : 0;
    return {
      ...clustered,
      score: baseScore - penalty,
      scoreReasons: [
        ...clustered.scoreReasons,
        ...(officialUrl ? ["Offizielle Primaerquelle im Cluster vorhanden"] : []),
        ...(hosts.length >= 2 ? ["Mehrere unabhaengige Quellen im Cluster"] : []),
        ...(penalty ? ["Als niedrige Queue-Prioritaet klassifiziert"] : [])
      ]
    };
  });
}

export function buildEditorialQueue(
  candidates: EditorialCandidate[],
  limit = MAX_DAILY_CANDIDATES
): EditorialCandidate[] {
  const urls = new Set<string>();
  const titles = new Set<string>();
  const acceptedTitles: { title: string; host: string }[] = [];
  const unique: EditorialCandidate[] = [];

  for (const candidate of candidates) {
    if (!candidate.sourceUrl) continue;
    const url = normalizeUrl(candidate.sourceUrl);
    const title = normalizeTitle(candidate.title);
    const host = sourceHost(candidate.sourceUrl);
    const isSimilar = acceptedTitles.some(
      (acceptedTitle) =>
        acceptedTitle.host === host &&
        (titleSimilarity(candidate.title, acceptedTitle.title) >= 0.5 ||
          sharesNamedAnchor(candidate.title, acceptedTitle.title))
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
    acceptedTitles.push({ title: candidate.title, host });
  }

  const clustered = buildClusters(unique);
  const ranked = clustered
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
    if (candidate.topicClassification === "steam-ranking-without-news") return false;
    if (lowPriorityTypes.includes(candidate.topicClassification ?? "general-news") && selected.length < 10) return false;
    if (candidate.sourceType === "steam-top-seller" && steamTopSellerCount >= 2) {
      return false;
    }
    if (candidate.sourceType === "steam-most-played" && steamMostPlayedCount >= 2) {
      return false;
    }
    if (candidate.sourceType !== "rss-news") return true;
    if (rssCount >= 12) return false;
    return (rssSourceCounts.get(candidate.sourceName) ?? 0) < 3;
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
    .filter((candidate) => candidate.officialPrimarySourceFound)
    .slice(0, 3)
    .forEach((candidate) => {
      if (selected.length < maximum && canSelect(candidate)) select(candidate);
    });
  ranked
    .filter((candidate) => (candidate.independentSourceCount ?? 1) >= 2)
    .slice(0, 3)
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
