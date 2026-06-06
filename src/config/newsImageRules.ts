import { approvedNewsImages } from "./approvedNewsImages";
import { approvedSteamImages } from "./approvedSteamImages";

export type PublicImageStatus = "approved" | "fallback";

export type ResolvedContentImage = {
  src: string;
  alt: string;
  status: PublicImageStatus;
  sourceType: "approved-news" | "approved-steam" | "category-fallback" | "general-fallback";
};

const GENERAL_FALLBACK = "/images/categories/news-default.svg";
const STEAM_FALLBACK = "/images/categories/news-default.svg";

const categoryFallbacks: Record<string, string> = {
  Rollenspiele: "/images/categories/rollenspiele.svg",
  Fantasy: "/images/categories/fantasy.svg",
  Survival: "/images/categories/survival.svg",
  Strategie: "/images/categories/strategie.svg",
  Shooter: "/images/categories/shooter.svg",
  Simulation: "/images/categories/strategie.svg",
  Indie: "/images/categories/news-default.svg",
  Updates: "/images/categories/updates.svg",
  News: "/images/categories/news-default.svg",
  Hardware: "/images/categories/hardware.svg",
  Deals: "/images/categories/deals.svg",
  Steam: STEAM_FALLBACK
};

export function resolveNewsImage(input: {
  articleUrl: string;
  title: string;
  category?: string;
}): ResolvedContentImage {
  const priority = {
    "own-image": 1,
    "own-screenshot": 1,
    "publisher-presskit": 2,
    "official-game-site": 2,
    "official-steam": 3
  } as const;
  const approved = approvedNewsImages
    .filter(
      (image) => image.status === "approved" && image.articleUrl === input.articleUrl
    )
    .sort((left, right) => priority[left.sourceType] - priority[right.sourceType])[0];

  if (approved) {
    return {
      src: approved.imageUrl,
      alt: approved.alt,
      status: "approved",
      sourceType: "approved-news"
    };
  }

  const categoryImage = input.category ? categoryFallbacks[input.category] : undefined;
  return {
    src: categoryImage ?? GENERAL_FALLBACK,
    alt: `SpielSignal-Bildfläche zu ${input.title}`,
    status: "fallback",
    sourceType: categoryImage ? "category-fallback" : "general-fallback"
  };
}

export function resolveSteamImage(input: {
  appId?: number;
  gameTitle: string;
  category?: string;
}): ResolvedContentImage {
  const approved = input.appId
    ? approvedSteamImages[String(input.appId)]
    : undefined;

  if (approved) {
    return {
      src: approved.imageUrl,
      alt: approved.alt ?? `Offizielles Steam-Bild zu ${input.gameTitle}`,
      status: "approved",
      sourceType: "approved-steam"
    };
  }

  const categoryImage = input.category ? categoryFallbacks[input.category] : undefined;
  return {
    src: categoryImage ?? STEAM_FALLBACK,
    alt: `SpielSignal-Steam-Bildfläche zu ${input.gameTitle}`,
    status: "fallback",
    sourceType: categoryImage ? "category-fallback" : "general-fallback"
  };
}

export function isPublicImageStatus(status: string): status is PublicImageStatus {
  return status === "approved" || status === "fallback";
}
