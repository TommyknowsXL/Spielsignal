import type { FreeReferenceType } from "./types";

export type FreeReferenceClassification = {
  type: FreeReferenceType;
  requiresReview: boolean;
};

export function classifyFreeReference(title: string): FreeReferenceClassification {
  if (/\b(demo|prologue)\b/i.test(title)) {
    return { type: "demo", requiresReview: true };
  }
  if (/\b(free[- ]?to[- ]?keep|dauerhaft kostenlos|für immer behalten)\b/i.test(title)) {
    return { type: "free-to-keep", requiresReview: true };
  }
  if (/\b(free weekend|gratis[- ]?wochenende|kostenlos(?:es)? wochenende)\b/i.test(title)) {
    return { type: "free-weekend", requiresReview: true };
  }
  if (/\b(play for free|kostenlos spielbar bis|gratis spielbar bis)\b/i.test(title)) {
    return { type: "play-for-free", requiresReview: true };
  }
  if (/\b(free[- ]?to[- ]?play|f2p)\b/i.test(title)) {
    return { type: "free-to-play", requiresReview: true };
  }
  if (/\b(kostenlos|gratis|free|verschenkt|geschenk)\b/i.test(title)) {
    return { type: "unknown-free-reference", requiresReview: true };
  }
  return { type: "none", requiresReview: false };
}
