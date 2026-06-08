export type EditorialReviewResult = {
  passed: boolean;
  score: number;
  reasons: string[];
  warnings: string[];
  requiredFixes: string[];
};

export type DraftReviewInput = {
  candidateId: string;
  title: string;
  articleType: string;
  markdown: string;
  readerText: string;
  primarySources: string[];
  externalTipSources: string[];
  imageStatus: "approved" | "pending-review" | "fallback";
  imageSourceType?: string;
  heroImage: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  summary: string;
  wordCount: number;
  hasOfficialFallbackImage: boolean;
};

export function passed(
  score: number,
  reasons: string[] = [],
  warnings: string[] = []
): EditorialReviewResult {
  return { passed: true, score, reasons, warnings, requiredFixes: [] };
}

export function failed(
  score: number,
  requiredFixes: string[],
  warnings: string[] = [],
  reasons: string[] = []
): EditorialReviewResult {
  return { passed: false, score, reasons, warnings, requiredFixes };
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
