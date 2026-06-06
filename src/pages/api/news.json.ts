import type { APIRoute } from "astro";
import { getAggregatedNews } from "../../lib/newsFeed";

export const prerender = false;

export const GET: APIRoute = async () => {
  const result = await getAggregatedNews();
  return new Response(
    JSON.stringify(
      {
        mode: "feeds",
        ...result,
        items: result.items
      },
      null,
      2
    ),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
        "x-content-type-options": "nosniff",
        "x-spielsignal-feed-mode": "feeds"
      }
    }
  );
};
