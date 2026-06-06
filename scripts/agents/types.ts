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
  | "steam-trend"
  | "test-candidate";

export type EditorialCandidate = {
  id: string;
  createdAt: string;
  sourceType: EditorialSourceType;
  sourceName: string;
  sourceUrl: string;
  title: string;
  gameTitle?: string;
  steamAppId?: string;
  genre?: string;
  releaseDate?: string;
  summary?: string;
  articleType: EditorialArticleType;
  score: number;
  scoreReasons: string[];
  imageStatus: "approved" | "pending-review" | "fallback";
  imagePath?: string;
  imageCandidateUrl?: string;
  imageSourcePageUrl?: string;
  rightsNotes?: string;
  editorialStatus: "draft" | "needs-review" | "approved" | "rejected" | "published";
  openChecks: string[];
  recommendedNextAction: string;
};

export type EditorialQueueReport = {
  generatedAt: string;
  reportDate: string;
  candidates: EditorialCandidate[];
  sourceErrors: string[];
  safeguards: {
    automaticPublishing: false;
    automaticMainMerge: false;
    automaticImageApproval: false;
    paidAiEnabled: false;
  };
};
