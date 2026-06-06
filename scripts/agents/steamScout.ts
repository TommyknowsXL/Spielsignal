import { createHash } from "node:crypto";
import { resolveSteamImage } from "../../src/config/newsImageRules";
import { recommendArticleType, scoreCandidate } from "./agentConfig";
import type { EditorialCandidate, EditorialSourceType } from "./types";

export type SteamScoutRecord = {
  sourceType: Extract<EditorialSourceType, "steam-release" | "steam-trend" | "free-promotion">;
  sourceName: string;
  sourceUrl: string;
  title: string;
  gameTitle?: string;
  steamAppId: string;
  genre?: string;
  releaseDate?: string;
  sourceReviewed: boolean;
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
        Boolean(record.steamAppId) &&
        isOfficialSteamStoreUrl(record.sourceUrl)
    )
    .map((record): EditorialCandidate => {
      const appId = Number(record.steamAppId);
      const image = resolveSteamImage({
        appId: Number.isInteger(appId) ? appId : undefined,
        gameTitle: record.gameTitle ?? record.title,
        category: "Steam"
      });
      const sourceType =
        record.sourceType === "free-promotion" && !record.freePromotionConfirmed
          ? "free-promotion"
          : record.sourceType;
      const base = {
        id: `steam-${createHash("sha256").update(record.sourceUrl).digest("hex").slice(0, 16)}`,
        createdAt: new Date().toISOString(),
        sourceType,
        sourceName: record.sourceName,
        sourceUrl: record.sourceUrl,
        title: record.title,
        gameTitle: record.gameTitle,
        steamAppId: record.steamAppId,
        genre: record.genre,
        releaseDate: record.releaseDate,
        articleType: recommendArticleType({ sourceType, title: record.title }),
        score: 0,
        scoreReasons: [],
        imageStatus: image.status,
        imagePath: image.src,
        imageSourcePageUrl: record.sourceUrl,
        rightsNotes:
          image.status === "approved"
            ? "Manuell freigegebenes offizielles Steam-Asset."
            : "Lokales SpielSignal-Fallback; offizielles Steam-Asset noch nicht freigegeben.",
        editorialStatus: "needs-review",
        openChecks: [
          "Store-Angaben, Veröffentlichungsdatum und Genre redaktionell prüfen.",
          ...(record.sourceType === "free-promotion" && !record.freePromotionConfirmed
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
