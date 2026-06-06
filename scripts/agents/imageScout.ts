import { resolveNewsImage, resolveSteamImage } from "../../src/config/newsImageRules";
import type { EditorialImageCandidate } from "../../src/data/editorialImageQueue";
import type { EditorialCandidate } from "./types";

export function applySafeImage(candidate: EditorialCandidate): EditorialCandidate {
  const image = candidate.steamAppId
    ? resolveSteamImage({
        appId: Number(candidate.steamAppId),
        gameTitle: candidate.gameTitle ?? candidate.title,
        category: "Steam"
      })
    : resolveNewsImage({
        articleUrl: candidate.sourceUrl,
        title: candidate.title
      });

  return {
    ...candidate,
    imageStatus: image.status,
    imagePath: image.src,
    rightsNotes:
      image.status === "approved"
        ? candidate.rightsNotes
        : "Lokales SpielSignal-Fallback bis Quelle und Nutzungsgrundlage manuell geprüft sind."
  };
}

export function prepareImageCandidate(
  candidate: Omit<EditorialImageCandidate, "status">
): EditorialImageCandidate {
  return { ...candidate, status: "pending-review" };
}
