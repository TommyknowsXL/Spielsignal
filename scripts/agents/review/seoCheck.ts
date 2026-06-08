import { failed, passed, type DraftReviewInput, type EditorialReviewResult } from "./types";

export function runSeoCheck(input: DraftReviewInput): EditorialReviewResult {
  const requiredFixes: string[] = [];
  const warnings: string[] = [];

  if (!input.seoTitle || input.seoTitle.length < 20) requiredFixes.push("SEO-Titel fehlt oder ist zu kurz.");
  if (!input.seoDescription || input.seoDescription.length < 50) requiredFixes.push("Meta-Beschreibung fehlt oder ist zu kurz.");
  if (!input.summary || input.summary.length < 40) requiredFixes.push("Zusammenfassung fehlt oder ist zu kurz.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) requiredFixes.push("Slug ist nicht sauber normalisiert.");
  if (!input.articleType) requiredFixes.push("Artikeltyp fehlt.");

  const titleWords = input.title.toLocaleLowerCase("de").split(/\W+/).filter((word) => word.length > 4);
  const repeated = titleWords.find((word) => (input.readerText.toLocaleLowerCase("de").match(new RegExp(`\\b${word}\\b`, "g")) ?? []).length > 25);
  if (repeated) warnings.push(`Keyword-Wiederholung prüfen: ${repeated}`);

  return requiredFixes.length ? failed(50, requiredFixes, warnings) : passed(86, ["SEO-Basisdaten vorhanden."]);
}
