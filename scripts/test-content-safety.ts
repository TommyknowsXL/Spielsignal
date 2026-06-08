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
import { articleSchema, draftSchema } from "../src/content/config";

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

const articleBase = {
  title: "Geprüfter Artikel",
  slug: "gepruefter-artikel",
  articleType: "news-overview",
  status: "published",
  createdAt: "2026-06-08T10:00:00.000Z",
  updatedAt: "2026-06-08T10:00:00.000Z",
  author: "SpielSignal-Redaktion",
  tags: ["PC"],
  summary: "Zusammenfassung",
  seoTitle: "Geprüfter Artikel | SpielSignal",
  seoDescription: "Geprüfter Artikel mit offizieller Quelle.",
  heroImage: "/images/categories/news-default.svg",
  heroImageAlt: "SpielSignal-Fallback für den geprüften Artikel",
  heroImageSourceName: "SpielSignal",
  heroImageSourceType: "spielsignal-fallback",
  imageRightsStatus: "fallback",
  externalTipSources: [],
  primarySources: ["https://store.steampowered.com/app/123456/"]
} as const;
assert.equal(articleSchema.safeParse(articleBase).success, true);
assert.equal(
  articleSchema.safeParse({ ...articleBase, articleType: "test" }).success,
  false
);
assert.equal(
  articleSchema.safeParse({ ...articleBase, primarySources: [] }).success,
  false
);
assert.equal(
  draftSchema.safeParse({
    ...articleBase,
    status: "needs-source-review",
    primarySources: []
  }).success,
  true
);
assert.equal(
  articleSchema.safeParse({
    ...articleBase,
    contentBlocks: [
      { type: "paragraph", text: "Kurzer Artikel mit visueller Struktur." },
      { type: "ad", slot: "article-inline-1" },
      { type: "ad", slot: "article-inline-2" }
    ]
  }).success,
  false
);
assert.equal(
  articleSchema.safeParse({
    ...articleBase,
    contentBlocks: [{
      type: "image",
      imageUrl: "/images/categories/news-default.svg",
      alt: "Lokales SpielSignal-Fallback",
      sourceName: "SpielSignal",
      sourceUrl: "https://spielsignal.de/",
      sourceType: "spielsignal-fallback",
      rightsStatus: "fallback"
    }]
  }).success,
  true
);
const normalArticleText = Array.from({ length: 520 }, () => "Inhalt").join(" ");
assert.equal(
  articleSchema.safeParse({
    ...articleBase,
    contentBlocks: [
      { type: "paragraph", text: normalArticleText },
      { type: "ad", slot: "article-inline-1" },
      { type: "ad", slot: "article-inline-2" }
    ]
  }).success,
  true
);
assert.equal(
  articleSchema.safeParse({
    ...articleBase,
    contentBlocks: [{
      type: "image",
      imageUrl: "https://steamdb.info/unsafe.jpg",
      alt: "Nicht zulässiges Bild",
      sourceName: "SteamDB",
      sourceUrl: "https://steamdb.info/",
      sourceType: "steam-store",
      rightsStatus: "approved"
    }]
  }).success,
  false
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
  "src/components/ExternalNewsCard.astro",
  "src/components/ArticleCard.astro",
  "src/components/SteamTrendsSidebar.astro",
  "src/components/TrendingSidebar.astro"
]) {
  const source = readFileSync(component, "utf8");
  assert.match(source, /<img/);
  assert.match(source, /card-link|sidebar-entry/);
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
assert.match(homePage, /slice\(0, 8\)/);
assert.match(homePage, /HeroNews/);
assert.match(homePage, /ExternalNewsList/);
assert.doesNotMatch(homePage, /ExternalNewsCard/);
assert.match(homePage, /getCollection\("articles"/);
assert.match(homePage, /data\.status === "published"/);
const newsPage = readFileSync("src/pages/news/index.astro", "utf8");
assert.match(newsPage, /limit: 5/);
assert.doesNotMatch(newsPage, /demoNews|ExternalNewsCard/);

const articleIndex = readFileSync("src/pages/artikel/index.astro", "utf8");
const articleDetail = readFileSync("src/pages/artikel/[slug].astro", "utf8");
assert.match(articleIndex, /getCollection\("articles"/);
assert.match(articleDetail, /getCollection\("articles"/);
assert.doesNotMatch(articleIndex + articleDetail, /getCollection\("drafts"/);
assert.match(articleDetail, /data\.status === "published"/);
assert.match(articleDetail, /application\/ld\+json|jsonLd/);
assert.match(articleDetail, /noopener noreferrer/);

for (const publicPage of [
  "src/pages/index.astro",
  "src/pages/tests/index.astro",
  "src/pages/deals/index.astro",
  "src/pages/lohnt-sich-das/index.astro",
  "src/pages/artikel/index.astro",
  "src/pages/artikel/[slug].astro"
]) {
  const source = readFileSync(publicPage, "utf8");
  assert.doesNotMatch(source, /example\.com|Demo-Test|Demo-Deal|Beispielpreis/i);
}

const widget = readFileSync("src/components/SteamStoreWidgetPlaceholder.astro", "utf8");
assert.equal(widget.includes("<iframe"), false);
assert.match(widget, /Steam-Inhalt laden/);
assert.match(widget, /addEventListener\("click"/);
assert.match(widget, /document\.createElement\("iframe"\)/);

console.log(
  "Content-Safety-Tests erfolgreich: Trending, Steam-Fallbacks, Bildfreigabe, klickbare Karten und Zwei-Klick-Widget."
);
