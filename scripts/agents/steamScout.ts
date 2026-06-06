import { createHash } from "node:crypto";
import { recommendArticleType, scoreCandidate } from "./agentConfig";
import {
  prepareOfficialSteamImageCandidate,
  resolveLocalFallback
} from "./imageScout";
import type {
  EditorialCandidate,
  EditorialSourceType,
  FreeReferenceType
} from "./types";

export type SteamScoutRecord = {
  sourceType: Extract<
    EditorialSourceType,
    "steam-release" | "steam-trend" | "free-promotion"
  >;
  sourceName: string;
  sourceUrl: string;
  title: string;
  gameTitle?: string;
  steamAppId: string;
  genre?: string;
  releaseDate?: string;
  sourceReviewed: boolean;
  freeReferenceType?: FreeReferenceType;
  freePromotionConfirmed?: boolean;
};

function isOfficialSteamStoreUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "store.steampowered.com";
  } catch {
    return false;
  }
}

export async function runSteamScout(
  records: SteamScoutRecord[] = []
): Promise<EditorialCandidate[]> {
  return records
    .filter(
      (record) =>
        record.sourceReviewed &&
        /^\d+$/.test(record.steamAppId) &&
        isOfficialSteamStoreUrl(record.sourceUrl)
    )
    .map((record): EditorialCandidate => {
      const imageCandidate = prepareOfficialSteamImageCandidate(
        record.steamAppId,
        record.sourceUrl
      );
      const isConfirmedPromotion =
        record.sourceType === "free-promotion" &&
        record.freePromotionConfirmed === true;
      const sourceType = isConfirmedPromotion
        ? "free-promotion"
        : record.sourceType === "free-promotion"
          ? "steam-release"
          : record.sourceType;
      const freeReferenceType = record.freeReferenceType ??
        (record.sourceType === "free-promotion"
          ? "unknown-free-reference"
          : "none");
      const base = {
        id: `steam-${createHash("sha256").update(record.sourceUrl).digest("hex").slice(0, 16)}`,
        createdAt: new Date().toISOString(),
        sourceType,
        sourceName: record.sourceName,
        sourceUrl: record.sourceUrl,
        title: record.title,
        gameTitle: record.gameTitle,
        steamAppId: record.steamAppId,
        steamStoreUrl: record.sourceUrl,
        genre: record.genre,
        category: record.genre ?? "Steam",
        releaseDate: record.releaseDate,
        freeReferenceType,
        freePromotionConfirmed: isConfirmedPromotion,
        articleType: recommendArticleType({
          sourceType,
          title: record.title,
          freePromotionConfirmed: isConfirmedPromotion,
          hasFreeReference: freeReferenceType !== "none"
        }),
        score: 0,
        scoreReasons: [],
        imageStatus: "pending-review",
        imagePath: resolveLocalFallback(record.title, record.genre ?? "Steam"),
        imageCandidateUrl: imageCandidate.candidateImageUrl,
        imageSourcePageUrl: imageCandidate.sourcePageUrl,
        imageCandidateSourceType: imageCandidate.sourceType,
        rightsNotes: imageCandidate.rightsNotes,
        editorialStatus: "needs-review",
        openChecks: [
          "Store-Angaben, Veröffentlichungsdatum und Genre redaktionell prüfen.",
          "Offizielles Steam-Bild und dessen Nutzungsgrundlage manuell freigeben.",
          ...(!record.gameTitle
            ? ["Spielname fehlt und muss anhand der Store-Seite bestätigt werden."]
            : []),
          ...(record.sourceType === "free-promotion" && !isConfirmedPromotion
            ? ["Gratis-Aktion ist unbestätigt und darf nicht als bestätigt erscheinen."]
            : [])
        ],
        recommendedNextAction:
          "Offizielle Steam-Store-Seite prüfen und Bildfreigabe separat dokumentieren."
      } satisfies EditorialCandidate;
      const scoring = scoreCandidate(base);
      return { ...base, score: scoring.score, scoreReasons: scoring.reasons };
    });
}
