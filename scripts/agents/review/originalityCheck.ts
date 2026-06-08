import { failed, passed, type DraftReviewInput, type EditorialReviewResult } from "./types";

const magazineHosts = /gamestar\.de|pcgames\.de|pcgameshardware\.de|mein-mmo\.de|gamepro\.de|xboxdynasty\.de/i;

export function runOriginalityCheck(input: DraftReviewInput): EditorialReviewResult {
  const requiredFixes: string[] = [];
  const warnings: string[] = [];

  if (input.primarySources.some((source) => magazineHosts.test(source))) {
    requiredFixes.push("Magazinartikel dürfen nicht als Primärquelle verwendet werden.");
  }
  if (input.readerText.includes("laut GameStar") || input.readerText.includes("wie GameStar berichtet")) {
    requiredFixes.push("RSS- oder Magazinquelle nur als Themenhinweis dokumentieren, nicht als Artikelbasis.");
  }
  if ((input.readerText.match(/^## /gm) ?? []).length > 9) {
    warnings.push("Sehr kleinteilige Struktur prüfen; keine fremde Gliederung nachbauen.");
  }

  return requiredFixes.length
    ? failed(40, requiredFixes, warnings)
    : passed(88, ["Eigene Struktur mit Primärquellen als Basis."]);
}
