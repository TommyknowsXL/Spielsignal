import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function GET(context) {
  const ownEntries = [
    ...(await getCollection("tests")),
    ...(await getCollection("recommendations")),
    ...(await getCollection("deals")),
    ...(await getCollection("releases"))
  ].sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  return rss({
    title: "SpielSignal",
    description: "Eigene Tests, Empfehlungen, Deals und Release-Einträge von SpielSignal.",
    site: context.site,
    language: "de-de",
    items: ownEntries.map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      pubDate: entry.data.date,
      link: `/artikel/${entry.id}/`
    })),
    customData: "<copyright>SpielSignal</copyright>"
  });
}
