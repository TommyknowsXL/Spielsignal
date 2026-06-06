export type ApprovedSteamImage = {
  appId: number;
  imageUrl: string;
  alt: string;
  status: "approved";
  sourcePageUrl: string;
  rightsBasis: string;
  checkedAt: string;
};

/**
 * Only documented official Steam assets with manual approval belong here.
 * SteamDB is not a permitted source.
 */
export const approvedSteamImages: ApprovedSteamImage[] = [];
