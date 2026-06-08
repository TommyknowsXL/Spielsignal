import type { EditorialCandidate } from "../types";
import { clampScore, type EditorialReviewResult } from "./types";

const positiveRules = [
  { score: 12, pattern: /\b(heute|neu|angekündigt|erscheint|release|startet|jetzt|update|patch)\b/i, reason: "Aktualität oder konkreter Anlass" },
  { score: 12, pattern: /\b(pc|steam|windows|game pass|pc game pass)\b/i, reason: "Klarer PC-Bezug" },
  { score: 10, pattern: /\b(systemanforderungen|gratis|kostenlos|demo|patch|update|termin|release)\b/i, reason: "Konkreter Nutzwert für PC-Spieler" },
  { score: 8, pattern: /\b(remake|fortsetzung|dlc|early access|erweiterung)\b/i, reason: "Neuheitswert oder Release-Nähe" },
  { score: 8, pattern: /\b(steam-topseller|topseller|rang|charts)\b/i, reason: "Steam-Topseller-Relevanz" },
  { score: 8, pattern: /\b(game pass|xbox)\b/i, reason: "Game-Pass-Relevanz" },
  { score: 8, pattern: /\b(gratis|kostenlos|free weekend|free-to-keep)\b/i, reason: "Gratis-Aktion" }
];

const negativeRules = [
  { score: -20, pattern: /\b(kino|film|serie|netflix|schauspieler|smartphone|iphone|tennis)\b/i, reason: "Kein klarer PC-Gaming-Nutzen" },
  { score: -12, pattern: /\b(gerücht|leak|angeblich)\b/i, reason: "Gerücht ohne offizielle Quelle möglich" },
  { score: -8, pattern: /\b(meinung|ranking|topliste)\b/i, reason: "Potenzielle Wiederholung ohne konkrete neue Information" }
];

export function runReaderInterestCheck(candidate: EditorialCandidate): EditorialReviewResult {
  const haystack = [
    candidate.title,
    candidate.gameTitle,
    candidate.category,
    candidate.genre,
    candidate.sourceName,
    candidate.scoreReasons.join(" ")
  ].filter(Boolean).join(" ");
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 35;

  if (candidate.gameTitle || candidate.steamAppId) {
    score += 12;
    reasons.push("Spiel oder Steam-App eindeutig erkennbar");
  }
  if (candidate.sourceType === "steam-release") {
    score += 14;
    reasons.push("Neue Steam-Veröffentlichung");
  }
  if (candidate.sourceType === "steam-top-seller" || candidate.steamRank) {
    score += 12;
    reasons.push("Steam-Topseller-Momentaufnahme vorhanden");
  }
  if (candidate.sourceType === "free-promotion" || candidate.freePromotionConfirmed) {
    score += 14;
    reasons.push("Mögliche Gratis-Aktion");
  }
  if (candidate.releaseDate) {
    score += 8;
    reasons.push("Release-Datum vorhanden");
  }

  for (const rule of positiveRules) {
    if (rule.pattern.test(haystack)) {
      score += rule.score;
      reasons.push(rule.reason);
    }
  }
  for (const rule of negativeRules) {
    if (rule.pattern.test(haystack)) {
      score += rule.score;
      warnings.push(rule.reason);
    }
  }

  if (!/\b(pc|steam|windows|game pass|xbox)\b/i.test(haystack)) {
    score -= 18;
    warnings.push("PC-Bezug muss redaktionell geprüft werden");
  }
  if (!candidate.gameTitle && !candidate.steamAppId) {
    score -= 10;
    warnings.push("Spielbezug ist noch nicht eindeutig genug");
  }

  const finalScore = clampScore(score);
  return {
    passed: finalScore >= 60,
    score: finalScore,
    reasons,
    warnings,
    requiredFixes: finalScore < 60 ? ["Leserinteresse unter 60 Punkten; keinen vollständigen Artikel erzeugen."] : []
  };
}
