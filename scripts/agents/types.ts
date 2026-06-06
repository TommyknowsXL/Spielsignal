export type EditorialSourceType =
  | "steam-release"
  | "steam-trend"
  | "rss-news"
  | "free-promotion";

export type EditorialArticleType =
  | "release-check"
  | "first-impression"
  | "news-overview"
  | "free-promotion"
  | "free-promotion-candidate"
  | "steam-trend"
  | "test-candidate";

export type FreeReferenceType =
  | "none"
  | "free-to-play"
  | "free-to-keep"
  | "play-for-free"
  | "demo"
  | "free-weekend"
  | "unknown-free-reference";

export type ImageCandidateSourceType =
  | "steam-store"
  | "publisher-presskit"
  | "official-game-site"
  | "own-screenshot"
  | "licensed-library";

export type EditorialCandidate = {
  id: string;
  createdAt: string;
  sourceType: EditorialSourceType;
  sourceName: string;
  sourceUrl: string;
  title: string;
  gameTitle?: string;
  steamAppId?: string;
  steamStoreUrl?: string;
  genre?: string;
  category?: string;
  releaseDate?: string;
  summary?: string;
  freeReferenceType?: FreeReferenceType;
  freePromotionConfirmed?: boolean;
  articleType: EditorialArticleType;
  score: number;
  scoreReasons: string[];
  imageStatus: "approved" | "pending-review" | "fallback";
  imagePath?: string;
  imageCandidateUrl?: string;
  imageSourcePageUrl?: string;
  imageCandidateSourceType?: ImageCandidateSourceType;
  rightsNotes?: string;
  editorialStatus: "draft" | "needs-review" | "approved" | "rejected" | "published";
  openChecks: string[];
  recommendedNextAction: string;
};

export type EditorialQueueSummary = {
  rssCandidates: number;
  steamReleaseCandidates: number;
  steamTrendCandidates: number;
  possibleFreePromotions: number;
  confirmedFreePromotions: number;
  imageCandidates: number;
  fallbackOnlyCandidates: number;
  sourceErrors: number;
};

export type EditorialQueueReport = {
  generatedAt: string;
  reportDate: string;
  candidates: EditorialCandidate[];
  sourceErrors: string[];
  steamScoutStatus: string;
  summary: EditorialQueueSummary;
  safeguards: {
    automaticPublishing: false;
    automaticMainMerge: false;
    automaticImageApproval: false;
    paidAiEnabled: false;
  };
};
