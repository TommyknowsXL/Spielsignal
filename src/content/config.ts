import { z } from "astro/zod";

export const articleTypes = [
  "news-overview",
  "release-check",
  "first-impression",
  "guide",
  "free-promotion",
  "test"
] as const;

export const articleStatuses = ["draft", "review", "published"] as const;

const articleFields = z.object({
    title: z.string().min(1),
    slug: z.string().min(1),
    articleType: z.enum(articleTypes),
    status: z.enum(articleStatuses),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    author: z.literal("SpielSignal-Redaktion"),
    gameTitle: z.string().optional(),
    steamAppId: z.string().regex(/^\d+$/).optional(),
    tags: z.array(z.string()).default([]),
    summary: z.string().min(1),
    seoTitle: z.string().min(1),
    seoDescription: z.string().min(1),
    heroImage: z.string().min(1),
    heroImageSourceType: z.enum([
      "steam-store",
      "publisher-presskit",
      "official-game-site",
      "own-screenshot",
      "spielsignal-fallback"
    ]),
    heroImageSourceUrl: z.string().url().optional(),
    imageRightsStatus: z.enum(["approved", "fallback"]),
    externalTipSources: z.array(z.string().url()).default([]),
    primarySources: z.array(z.string().url()).min(1),
    editorialNotes: z.array(z.string()).optional(),
    playedMinutes: z.number().int().positive().optional()
  });

const hasTestPlaytime = <T extends { articleType: string; playedMinutes?: number }>(entry: T) =>
  entry.articleType !== "test" || Boolean(entry.playedMinutes);

export const articleSchema = articleFields
  .refine(hasTestPlaytime, {
    message: "Ein Test benötigt eine dokumentierte Spielzeit größer als 0.",
    path: ["playedMinutes"]
  });

export const draftSchema = articleFields
  .omit({ status: true, primarySources: true })
  .extend({
    status: z.enum(["draft", "review", "needs-source-review"]),
    primarySources: z.array(z.string().url()).default([])
  })
  .refine((entry) => entry.articleType !== "test" || Boolean(entry.playedMinutes), {
    message: "Ein Test benötigt eine dokumentierte Spielzeit größer als 0.",
    path: ["playedMinutes"]
  });

export type ArticleData = z.infer<typeof articleSchema>;
export type DraftData = z.infer<typeof draftSchema>;
