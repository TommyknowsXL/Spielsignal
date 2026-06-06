export type EditorialImageCandidate = {
  articleUrl: string;
  articleTitle: string;
  gameTitle?: string;
  steamAppId?: string;
  candidateImageUrl?: string;
  sourcePageUrl: string;
  sourceType:
    | "steam-store"
    | "publisher-presskit"
    | "official-game-site"
    | "own-screenshot"
    | "licensed-library";
  rightsNotes: string;
  status: "pending-review" | "approved" | "rejected";
  checkedAt?: string;
};

export const editorialImageQueue: EditorialImageCandidate[] = [];
