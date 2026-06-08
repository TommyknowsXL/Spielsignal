import { failed, passed, type DraftReviewInput, type EditorialReviewResult } from "./types";

export function runQualityCheck(input: DraftReviewInput): EditorialReviewResult {
  const requiredFixes: string[] = [];
  const warnings: string[] = [];
  const headings = input.readerText.match(/^## /gm) ?? [];

  if (!input.title || input.title.length < 12) requiredFixes.push("Überschrift ist zu unklar.");
  if (!input.summary || input.summary.includes("ergänzen")) requiredFixes.push("Teaser/Zusammenfassung fehlt.");
  if (!headings.length) requiredFixes.push("Zwischenüberschriften fehlen.");
  if (/src\/|Repository|Snapshot-Datei|UTC|22:\d{2}:\d{2}/i.test(input.readerText)) {
    requiredFixes.push("Interne technische Begriffe oder Rohdaten im Lesertext entfernen.");
  }
  if (/unglaublich|irre|krass|du glaubst nicht/i.test(input.title)) {
    requiredFixes.push("Clickbait-Formulierung entfernen.");
  }
  if (input.wordCount < 120) warnings.push("Entwurf ist sehr kurz und sollte redaktionell ausgebaut werden.");
  if (input.wordCount > 1000) warnings.push("Entwurf ist länger als das Ziel von 500 bis 1.000 Wörtern.");
  if (input.wordCount >= 500 && input.wordCount <= 1000) {
    warnings.push("Wortlänge liegt im Zielbereich.");
  }

  return requiredFixes.length ? failed(55, requiredFixes, warnings) : passed(82, ["Sachlicher, lesbarer Entwurf."],);
}
