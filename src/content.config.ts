import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { articleSchema, draftSchema } from "./content/config";

const articles = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/articles" }),
  schema: articleSchema
});

const drafts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/drafts" }),
  schema: draftSchema
});

export const collections = { articles, drafts };
