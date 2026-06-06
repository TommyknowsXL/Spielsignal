import type { EditorialImageCandidate } from "../../src/data/editorialImageQueue";
import { resolveNewsImage, resolveSteamImage } from "../../src/config/newsImageRules";
import type { EditorialCandidate, ImageCandidateSourceType } from "./types";

const fallbackRules: Array<{ pattern: RegExp; path: string }> = [
  { pattern: /\b(hardware|grafikkarte|gpu|cpu|monitor|prozessor)\b/i, path: "/images/categories/hardware.svg" },
  { pattern: /\b(deal|angebot|rabatt|sale|günstig)\b/i, path: "/images/categories/deals.svg" },
  { pattern: /\b(strategie|taktik|rts|aufbau)\b/i, path: "/images/categories/strategie.svg" },
  { pattern: /\b(rollenspiel|rpg|gothic)\b/i, path: "/images/categories/rollenspiele.svg" },
  { pattern: /\b(fantasy|ritter|magie)\b/i, path: "/images/categories/fantasy.svg" },
  { pattern: /\b(survival|überleben|open world)\b/i, path: "/images/categories/survival.svg" },
  { pattern: /\b(shooter|crossfire|gun|mech)\b/i, path: "/images/categories/shooter.svg" },
  { pattern: /\b(update|patch|dlc|erweiterung)\b/i, path: "/images/categories/updates.svg" }
];

export function resolveLocalFallback(title: string, category?: string): string {
  const titleMatch = fallbackRules.find((rule) => rule.pattern.test(title));
  if (titleMatch) return titleMatch.path;
  return fallbackRules.find((rule) => rule.pattern.test(category ?? ""))?.path ??
    "/images/categories/news-default.svg";
}

export function prepareOfficialSteamImageCandidate(
  steamAppId: string,
  sourcePageUrl: string
): {
  candidateImageUrl: string;
  sourcePageUrl: string;
  sourceType: ImageCandidateSourceType;
  rightsNotes: string;
  status: "pending-review";
} {
  return {
    candidateImageUrl:
      `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`,
    sourcePageUrl,
    sourceType: "steam-store",
    rightsNotes:
      "Offizielles Steam-Store-Asset; Nutzungsgrundlage und Zuordnung vor Veröffentlichung manuell prüfen.",
    status: "pending-review"
  };
}

export function applySafeImage(candidate: EditorialCandidate): EditorialCandidate {
  const approved = candidate.steamAppId
    ? resolveSteamImage({
        appId: Number(candidate.steamAppId),
        gameTitle: candidate.gameTitle ?? candidate.title,
        category: candidate.category
      })
    : resolveNewsImage({
        articleUrl: candidate.sourceUrl,
        title: candidate.title,
        category: candidate.category
      });
  if (approved.status === "approved") {
    return {
      ...candidate,
      imageStatus: "approved",
      imagePath: approved.src
    };
  }

  const fallback = resolveLocalFallback(candidate.title, candidate.category);
  return {
    ...candidate,
    imageStatus: candidate.imageStatus === "approved"
      ? "approved"
      : candidate.imageCandidateUrl
        ? "pending-review"
        : "fallback",
    imagePath: candidate.imageStatus === "approved" ? candidate.imagePath : fallback,
    rightsNotes: candidate.imageStatus === "approved"
      ? candidate.rightsNotes
      : candidate.rightsNotes ??
        "Lokales SpielSignal-Fallback bis Quelle und Nutzungsgrundlage manuell geprüft sind."
  };
}

export function prepareImageCandidate(
  candidate: Omit<EditorialImageCandidate, "status">
): EditorialImageCandidate {
  return { ...candidate, status: "pending-review" };
}
