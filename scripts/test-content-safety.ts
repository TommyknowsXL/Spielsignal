import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveNewsImage, resolveSteamImage, isPublicImageStatus } from "../src/config/newsImageRules";
import { approvedNewsImages } from "../src/config/approvedNewsImages";
import { approvedSteamImages } from "../src/config/approvedSteamImages";
import { getSteamReleases, getSteamTrends, officialSteamFallback } from "../src/lib/steamData";
import { getTrendingItems } from "../src/lib/trending";
import type { AggregatedNewsItem } from "../src/lib/newsFeed";
import { newsSources } from "../src/config/newsSources";
import { prepareNewsItems } from "../src/lib/newsPresentation";

const news: AggregatedNewsItem[] = Array.from({ length: 5 }, (_, index) => ({
  id: `item-${index}`,
  title: `Aktuelle Meldung ${index + 1}`,
  url: `https://example.test/news/${index + 1}`,
  date: new Date(Date.UTC(2026, 5, 6, 12, index)).toISOString(),
  category: "News",
  sourceName: "Geprüfte Quelle",
  sourceHomepageUrl: "https://example.test/"
}));

const presentedNews = await prepareNewsItems(news, {
  fetchImpl: async () => new Response(JSON.stringify({ results_html: "" }), {
    status: 200,
    headers: { "content-type": "application/json" }
  })
});
const trending = await getTrendingItems(presentedNews);
assert.equal(trending.heading, "Neu eingetroffen");
assert.equal(trending.usesClickData, false);
assert.equal(trending.items.length, 3);
assert.equal(trending.items.every((item) => Boolean(item.image)), true);
assert.equal(trending.items.every((item) => item.clickCount === undefined), true);
assert.equal(trending.items.every((item) => item.external), true);

const enabledSources = newsSources.filter((source) => source.enabled);
assert.deepEqual(enabledSources.map((source) => source.name), ["GameStar Gaming-News"]);
assert.equal(enabledSources[0].feedUrl, "https://www.gamestar.de/rss/gaming.rss");
for (const disabledName of ["GameStar News", "GameStar Hardware", "GameStar Deals"]) {
  assert.equal(newsSources.find((source) => source.name === disabledName)?.enabled, false);
}

assert.equal((await getSteamTrends()).length <= 5, true);
assert.equal((await getSteamReleases()).length <= 30, true);
const trendFallback = officialSteamFallback("trends");
const releaseFallback = officialSteamFallback("releases");
assert.ok(trendFallback.image);
assert.ok(releaseFallback.image);
assert.equal(trendFallback.source, "Steam");
assert.equal(trendFallback.url, "https://store.steampowered.com/charts/topselling/DE");
assert.match(trendFallback.title, /Steam-Topseller/);

const unknownNews = resolveNewsImage({
  articleUrl: "https://example.test/unknown",
  title: "Unbekannte Meldung",
  category: "Unbekannt"
});
assert.equal(unknownNews.status, "fallback");
assert.equal(unknownNews.src, "/images/categories/news-default.svg");
assert.equal(resolveSteamImage({ gameTitle: "Unbekannt" }).status, "fallback");
assert.equal(isPublicImageStatus("pending-review"), false);
assert.equal(
  approvedNewsImages.every((image) => image.status === "approved") &&
    Object.values(approvedSteamImages).every(
      (image) => image.sourceType === "steam-store"
    ),
  true
);

const files = [
  "src/lib/newsFeed.ts",
  "src/lib/steamData.ts",
  "src/config/newsImageRules.ts",
  "src/config/approvedNewsImages.ts",
  "src/config/approvedSteamImages.ts"
].map((path) => readFileSync(path, "utf8"));
const runtimeCode = files.join("\n");
assert.equal(runtimeCode.includes("steamdb.info"), false);
assert.equal(/\bfetch\s*\([^)]*steamdb/i.test(runtimeCode), false);
assert.equal(/\b(enclosure|media:content|og:image)\b/i.test(readFileSync("src/lib/newsFeed.ts", "utf8")), false);

const rightsDoc = readFileSync("docs/content-image-rights.md", "utf8");
assert.match(rightsDoc, /Freigabestatus/);
assert.match(rightsDoc, /pending-review/);
assert.match(rightsDoc, /fallback/);

for (const component of [
  "src/components/NewsCard.astro",
  "src/components/ExternalNewsCard.astro",
  "src/components/ReviewCard.astro",
  "src/components/RecommendationCard.astro",
  "src/components/DealCard.astro"
]) {
  const source = readFileSync(component, "utf8");
  assert.match(source, /<img/);
  assert.match(source, /card-link/);
}

const trendingComponent = readFileSync("src/components/TrendingSidebar.astro", "utf8");
assert.match(trendingComponent, /slice\(0, 3\)/);
assert.match(trendingComponent, /<img/);
assert.match(trendingComponent, /class="sidebar-entry"/);

const steamTrendsComponent = readFileSync("src/components/SteamTrendsSidebar.astro", "utf8");
assert.match(steamTrendsComponent, /slice\(0, 5\)/);
assert.match(steamTrendsComponent, /Top-Seller in Deutschland/);
assert.match(steamTrendsComponent, /target="_blank"/);
assert.match(steamTrendsComponent, /Quelle: Steam/);
assert.match(steamTrendsComponent, /<img/);

const homePage = readFileSync("src/pages/index.astro", "utf8");
assert.doesNotMatch(homePage, /demoNews|example\.com|Beispielpreis|DealCard|ReleaseCalendar|Newsletter/i);
assert.match(homePage, /slice\(0, 6\)/);
assert.match(homePage, /imageKind === "fallback"/);
assert.match(homePage, /ExternalNewsCard/);
const newsPage = readFileSync("src/pages/news/index.astro", "utf8");
assert.match(newsPage, /limit: 24/);
assert.doesNotMatch(newsPage, /demoNews|import NewsCard/);
const hero = readFileSync("src/components/Hero.astro", "utf8");
assert.match(hero, /spielsignal-gaming-hero\.svg/);
assert.equal(readFileSync("public/images/hero/spielsignal-gaming-hero.svg", "utf8").includes("<svg"), true);

const widget = readFileSync("src/components/SteamStoreWidgetPlaceholder.astro", "utf8");
assert.equal(widget.includes("<iframe"), false);
assert.match(widget, /Steam-Inhalt laden/);
assert.match(widget, /addEventListener\("click"/);
assert.match(widget, /document\.createElement\("iframe"\)/);

console.log(
  "Content-Safety-Tests erfolgreich: Trending, Steam-Fallbacks, Bildfreigabe, klickbare Karten und Zwei-Klick-Widget."
);
