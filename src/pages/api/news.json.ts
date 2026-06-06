import type { APIRoute } from "astro";
import { demoNews } from "../../data/demoNews";
import { getAggregatedNews } from "../../lib/newsFeed";

export const prerender = false;

export const GET: APIRoute = async () => {
  const result = await getAggregatedNews();
  const hasExternalItems = result.items.length > 0;

  return new Response(
    JSON.stringify(
      {
        mode: hasExternalItems ? "feeds" : "demo",
        ...result,
        items: hasExternalItems ? result.items : demoNews
      },
      null,
      2
    ),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
        "x-content-type-options": "nosniff",
        "x-spielsignal-feed-mode": hasExternalItems ? "feeds" : "demo"
      }
    }
  );
};
