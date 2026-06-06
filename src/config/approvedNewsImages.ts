export type ApprovedNewsImage = {
  articleUrl: string;
  imageUrl: string;
  alt: string;
  status: "approved";
  sourcePageUrl: string;
  sourceType:
    | "own-image"
    | "own-screenshot"
    | "publisher-presskit"
    | "official-game-site"
    | "official-steam";
  rightsBasis: string;
  checkedAt: string;
};

/**
 * Only manually approved images belong here. RSS and Open Graph images are
 * never added automatically.
 */
export const approvedNewsImages: ApprovedNewsImage[] = [];
