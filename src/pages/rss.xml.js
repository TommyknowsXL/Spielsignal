import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function GET(context) {
  const ownEntries = (await getCollection(
    "articles",
    ({ data }) => data.status === "published"
  )).sort((a, b) => b.data.createdAt.valueOf() - a.data.createdAt.valueOf());

  return rss({
    title: "SpielSignal",
    description: "Eigene Artikel der SpielSignal-Redaktion.",
    site: context.site,
    language: "de-de",
    items: ownEntries.map((entry) => ({
      title: entry.data.title,
      description: entry.data.summary,
      pubDate: entry.data.createdAt,
      link: `/artikel/${entry.data.slug}/`
    })),
    customData: "<copyright>SpielSignal</copyright>"
  });
}
