import { failed, passed, type DraftReviewInput, type EditorialReviewResult } from "./types";

const forbiddenClaims = [
  { pattern: /\b\d+\s*(stunden|std\.)\s+gespielt\b/i, fix: "Keine Spielzeit ohne belastbare Gameplay-Notizen behaupten." },
  { pattern: /\bunsere wertung\b|\berhält\s+\d+(?:[,.]\d+)?\s*\/\s*(?:10|100)\b|\b\d{1,3}\s*\/\s*100\b/i, fix: "Keine Wertung im Entwurf verwenden." },
  { pattern: /\b\d+(?:[.,]\d+)?\s*(?:millionen|mio\.?|tausend)\s+(?:verkäufe|spieler|aufrufe|leser)\b/i, fix: "Keine unbelegten Zahlen oder Reichweiten nennen." },
  { pattern: /src\/data\/editorial|archive\/\d{4}-\d{2}-\d{2}\.json/i, fix: "Interne Snapshot-Dateien nicht öffentlich anzeigen." },
  { pattern: /\d{2}:\d{2}:\d{2}(?:\.\d+)?Z|\bUTC\b/i, fix: "Keine exakten UTC-Rohdaten im Lesertext anzeigen." }
];

export function runFactCheck(input: DraftReviewInput): EditorialReviewResult {
  const requiredFixes = forbiddenClaims
    .filter((rule) => rule.pattern.test(input.readerText))
    .map((rule) => rule.fix);
  const warnings: string[] = [];

  if (!input.primarySources.length) {
    requiredFixes.push("Mindestens eine offizielle Primärquelle ist für einen vollständigen Entwurf erforderlich.");
  }
  if (input.externalTipSources.length && !input.primarySources.length) {
    requiredFixes.push("RSS allein reicht nicht als Primärquelle.");
  }
  if (/rang\s+\d+|topseller/i.test(input.readerText) && !/Momentaufnahme|verändert sich laufend/i.test(input.readerText)) {
    warnings.push("Steam-Rankings nur als Momentaufnahme formulieren.");
  }

  return requiredFixes.length
    ? failed(45, requiredFixes, warnings)
    : passed(90, ["Alle zentralen Aussagen sind an Primärquellen gebunden oder bewusst offen formuliert."]);
}
