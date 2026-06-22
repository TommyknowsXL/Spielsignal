export type EditorialSourceType =
  | "steam-release"
  | "steam-top-seller"
  | "steam-most-played"
  | "rss-news"
  | "free-promotion";

export type EditorialArticleType =
  | "release-check"
  | "first-impression"
  | "news-overview"
  | "free-promotion"
  | "free-promotion-candidate"
  | "steam-top-seller"
  | "steam-most-played"
  | "test-candidate";

export type EditorialTopicClassification =
  | "patchnotes"
  | "game-update"
  | "release-date"
  | "demo-release"
  | "new-game-announcement"
  | "trailer"
  | "DLC"
  | "expansion"
  | "studio-news"
  | "publisher-news"
  | "legal/regulatory"
  | "platform-update"
  | "event-announcement"
  | "confirmed-delay"
  | "confirmed-cancellation"
  | "official-roadmap"
  | "opinion"
  | "column"
  | "special"
  | "listicle"
  | "buying-guide"
  | "sale-roundup"
  | "paywalled-plus-content"
  | "community-discussion"
  | "steam-ranking-without-news"
  | "general-news";

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
  concurrentPlayers?: number;
  steamRank?: number;
  steamRegion?: "DE" | "global";
  steamFetchedAt?: string;
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
  imageSourceType?: ImageCandidateSourceType;
  rightsNotes?: string;
  editorialStatus: "draft" | "needs-review" | "approved" | "rejected" | "published";
  openChecks: string[];
  recommendedNextAction: string;
  topicClassification?: EditorialTopicClassification;
  clusterId?: string;
  clusterTitle?: string;
  clusterSourceUrls?: string[];
  clusterSourceNames?: string[];
  independentSourceCount?: number;
  officialPrimarySourceUrl?: string;
  officialPrimarySourceFound?: boolean;
  queueDiagnostics?: string[];
};

export type EditorialQueueSummary = {
  rssCandidates: number;
  steamReleaseCandidates: number;
  steamTopSellerCandidates: number;
  steamMostPlayedCandidates: number;
  possibleFreePromotions: number;
  confirmedFreePromotions: number;
  imageCandidates: number;
  rssCandidatesWithSteamAppId: number;
  officialSteamImageCandidates: number;
  fallbackOnlyCandidates: number;
  sourceErrors: number;
  sourceCount: number;
  successfulSources: number;
  failedSources: number;
  inputCandidates: number;
  clusterCount: number;
  officialPrimarySourceClusters: number;
  multiSourceClusters: number;
  excludedColumns: number;
  excludedSpecialsListicles: number;
  excludedPaywalled: number;
  excludedSteamRankingsWithoutNews: number;
};

export type EditorialQueueReport = {
  generatedAt: string;
  reportDate: string;
  candidates: EditorialCandidate[];
  sourceErrors: string[];
  sourceDiagnostics?: {
    requested: string[];
    successful: string[];
    failed: string[];
    candidatesBySource: Record<string, number>;
    clusters: {
      id: string;
      title: string;
      sourceNames: string[];
      sourceUrls: string[];
      independentSourceCount: number;
      officialPrimarySourceUrl?: string;
      selected: boolean;
      classification: EditorialTopicClassification;
      score: number;
      reason: string;
    }[];
  };
  steamScoutStatus: string;
  steamReleaseStatus: string;
  steamTopSellerStatus: string;
  steamMostPlayedStatus: string;
  steamTopSellerRegion: "DE" | "global";
  steamTopSellerFetchedAt: string;
  steamTopSellerSource: "Steam";
  steamApiKeyPresent: boolean;
  summary: EditorialQueueSummary;
  safeguards: {
    automaticPublishing: false;
    automaticMainMerge: false;
    automaticImageApproval: false;
    paidAiEnabled: false;
  };
};
