import { failed, passed, type DraftReviewInput, type EditorialReviewResult } from "./types";

const blockedImageSources = /gamestar\.de|pcgames\.de|pcgameshardware\.de|mein-mmo\.de|gamepro\.de|steamdb\.info|google\./i;

export function runImageCheck(input: DraftReviewInput): EditorialReviewResult {
  const requiredFixes: string[] = [];
  const warnings: string[] = [];

  if (!input.heroImage) requiredFixes.push("Hero-Bild fehlt.");
  if (blockedImageSources.test(input.heroImage)) {
    requiredFixes.push("Unzulässige Bildquelle erkannt.");
  }
  if (input.imageStatus !== "approved" && !input.hasOfficialFallbackImage) {
    requiredFixes.push("Nicht freigegebenes Bild ohne SpielSignal-Fallback.");
  }
  if (input.imageStatus !== "approved") {
    warnings.push("Fallback oder manuelle Bildfreigabe vor Veröffentlichung prüfen.");
  }

  return requiredFixes.length
    ? failed(45, requiredFixes, warnings)
    : passed(input.imageStatus === "approved" ? 92 : 72, ["Bildquelle dokumentiert oder Fallback vorhanden."], warnings);
}
