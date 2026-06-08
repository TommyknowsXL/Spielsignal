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

export const articleImageSourceTypes = [
  "steam-store",
  "publisher-presskit",
  "official-game-site",
  "own-screenshot",
  "spielsignal-fallback"
] as const;

const blockedImageHost = /steamdb\.info|google\.|gamestar\.de|pcgames\.de|pcgameshardware\.de|gamepro\.de|mein-mmo\.de/i;
const safeImageLocation = z.string().min(1).refine(
  (value) => (value.startsWith("/images/") || /^https:\/\//i.test(value)) && !blockedImageHost.test(value),
  "Artikelbilder müssen lokale SpielSignal-Dateien oder freigegebene HTTPS-Quellen verwenden."
);

export const articleContentBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("paragraph"),
    text: z.string().min(1)
  }),
  z.object({
    type: z.literal("heading"),
    level: z.union([z.literal(2), z.literal(3)]),
    text: z.string().min(1)
  }),
  z.object({
    type: z.literal("list"),
    items: z.array(z.string().min(1)).min(1)
  }),
  z.object({
    type: z.literal("image"),
    imageUrl: safeImageLocation,
    alt: z.string().min(1),
    caption: z.string().min(1).optional(),
    sourceName: z.string().min(1),
    sourceUrl: z.string().url().refine((value) => !blockedImageHost.test(value), "Unzulässige Bildquelle."),
    sourceType: z.enum(articleImageSourceTypes),
    rightsStatus: z.enum(["approved", "fallback"])
  }),
  z.object({
    type: z.literal("ad"),
    slot: z.enum(["article-inline-1", "article-inline-2"])
  })
]);

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
    heroImage: safeImageLocation,
    heroImageAlt: z.string().min(1),
    heroImageSourceName: z.string().min(1),
    heroImageSourceType: z.enum(articleImageSourceTypes),
    heroImageSourceUrl: z.string().url().optional(),
    imageRightsStatus: z.enum(["approved", "fallback"]),
    contentBlocks: z.array(articleContentBlockSchema).optional(),
    externalTipSources: z.array(z.string().url()).default([]),
    primarySources: z.array(z.string().url()).min(1),
    editorialNotes: z.array(z.string()).optional(),
    playedMinutes: z.number().int().positive().optional()
  });

const hasTestPlaytime = <T extends { articleType: string; playedMinutes?: number }>(entry: T) =>
  entry.articleType !== "test" || Boolean(entry.playedMinutes);

const hasValidAdDensity = <T extends {
  contentBlocks?: Array<
    | { type: "paragraph"; text: string }
    | { type: "heading"; text: string }
    | { type: "list"; items: string[] }
    | { type: "image" }
    | { type: "ad"; slot: string }
  >
}>(entry: T) => {
  if (!entry.contentBlocks) return true;
  const words = entry.contentBlocks
    .flatMap((block) => {
      if (block.type === "paragraph" || block.type === "heading") return [block.text];
      if (block.type === "list") return block.items;
      return [];
    })
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const inlineAds = entry.contentBlocks.filter((block) => block.type === "ad");
  const uniqueSlots = new Set(inlineAds.map((block) => block.type === "ad" ? block.slot : ""));
  const maximum = words < 500 ? 1 : 2;
  return inlineAds.length <= maximum && uniqueSlots.size === inlineAds.length;
};

export const articleSchema = articleFields
  .refine(hasTestPlaytime, {
    message: "Ein Test benötigt eine dokumentierte Spielzeit größer als 0.",
    path: ["playedMinutes"]
  })
  .refine(hasValidAdDensity, {
    message: "Zu viele oder doppelte Inline-Werbeplätze für die Artikellänge.",
    path: ["contentBlocks"]
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
  })
  .refine(hasValidAdDensity, {
    message: "Zu viele oder doppelte Inline-Werbeplätze für die Artikellänge.",
    path: ["contentBlocks"]
  });

export type ArticleContentBlock = z.infer<typeof articleContentBlockSchema>;
export type ArticleData = z.infer<typeof articleSchema>;
export type DraftData = z.infer<typeof draftSchema>;
