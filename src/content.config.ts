import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const base = z.object({
  title: z.string(),
  description: z.string(),
  date: z.coerce.date(),
  author: z.string().default("SpielSignal-Redaktion"),
  category: z.string(),
  seoTitle: z.string(),
  seoDescription: z.string(),
  image: z.string().optional(),
  imageAlt: z.string().optional(),
  imageSource: z.string().optional(),
  demo: z.boolean().default(true)
});

const reviewSchema = base.extend({
    articleType: z.enum(["Test", "Ersteindruck"]),
    genre: z.string(),
    platform: z.string(),
    playtime: z.string(),
    score: z.number().min(0).max(100).optional(),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    verdict: z.string(),
    sources: z
      .array(z.object({ name: z.string(), url: z.url() }))
      .default([])
});

const tests = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/tests" }),
  schema: reviewSchema
});

const recommendations = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/recommendations" }),
  schema: base.extend({
    articleType: z.literal("Empfehlung").default("Empfehlung"),
    genre: z.string(),
    platform: z.string(),
    playtime: z.string(),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    verdict: z.string(),
    sources: z
      .array(z.object({ name: z.string(), url: z.url() }))
      .default([])
  })
});

const news = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/news" }),
  schema: base.extend({
    sourceName: z.string(),
    sourceUrl: z.url(),
    articleType: z.literal("News-Überblick").default("News-Überblick")
  })
});

const deals = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/deals" }),
  schema: base.extend({
    articleType: z.literal("Deal").default("Deal"),
    affiliate: z.boolean().default(false),
    offerUrl: z.url().optional()
  })
});

const releases = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/releases" }),
  schema: base.extend({
    articleType: z.literal("Release-Check").default("Release-Check"),
    genre: z.string(),
    platform: z.string().default("PC"),
    releaseDate: z.string(),
    status: z.string()
  })
});

const steamSuggestions = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/steam-suggestions" }),
  schema: z
    .object({
      title: z.string(),
      gameName: z.string(),
      genre: z.string(),
      releaseDate: z.string(),
      price: z.string(),
      developer: z.string(),
      publisher: z.string(),
      steamUrl: z.url(),
      shortDescription: z.string().max(400),
      category: z.string(),
      officialImageUrl: z.url().nullable(),
      articleType: z.enum(["Release-Check", "Ersteindruck", "Test"]),
      status: z.enum(["Entwurf", "geprüft", "veröffentlicht"]),
      played: z.boolean().default(false),
      gameplayNotes: z.string().optional(),
      collectedAt: z.coerce.date(),
      demo: z.boolean().default(true)
    })
    .refine(
      (entry) =>
        entry.articleType !== "Test" ||
        entry.played ||
        Boolean(entry.gameplayNotes?.trim()),
      {
        message:
          "Ein Test benötigt played: true oder belastbare gameplayNotes."
      }
    )
});

export const collections = {
  tests,
  recommendations,
  news,
  deals,
  releases,
  steamSuggestions
};
