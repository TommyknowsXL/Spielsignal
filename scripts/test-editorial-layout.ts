import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parse as parseYaml } from "yaml";
import { approvedPcGamePassEntries, pcGamePassEntries } from "../src/data/pcGamePassEntries";

const read = (path: string) => readFileSync(path, "utf8");
const header = read("src/components/Header.astro");
const footer = read("src/components/Footer.astro");
const home = read("src/pages/index.astro");
const news = read("src/pages/news/index.astro");
const article = read("src/pages/artikel/[slug].astro");
const gothic = read("src/content/articles/gothic-1-remake-news-overview.md");
const releases = read("src/pages/releases/index.astro");
const gamePass = read("src/pages/pc-game-pass.astro");
const contentBlocks = read("src/components/ArticleContentBlocks.astro");
const adSlot = read("src/components/AdSlot.astro");
const contentConfig = read("src/content/config.ts");
const imageRights = read("docs/content-image-rights.md");
const aiProvider = read("scripts/agents/providers/editorialAiProvider.ts");
const globalCss = read("src/styles/global.css");
const gothicFrontmatterEnd = gothic.indexOf("\n---", 4);
const gothicData = parseYaml(gothic.slice(4, gothicFrontmatterEnd)) as {
  contentBlocks: Array<{ type: string; text?: string; slot?: string; rightsStatus?: string }>;
};
const gothicReaderText = gothicData.contentBlocks
  .flatMap((block) => block.text ? [block.text] : [])
  .join("\n");

assert.match(header, /News/);
assert.match(header, /Steam-Releases/);
assert.match(header, /PC Game Pass/);
assert.doesNotMatch(header, />Artikel<|>Tests<|Lohnt sich das\?|Über SpielSignal/);
assert.match(footer, /Über SpielSignal/);
assert.match(footer, /RSS-Feed/);

assert.match(home, /HeroNews/);
assert.match(home, /Aktuelle SpielSignal-News/);
assert.match(home, /ExternalNewsList/);
assert.doesNotMatch(home, /ExternalNewsCard|example\.com|demoNews/i);
assert.ok(home.indexOf("<HeroNews") < home.indexOf("<ExternalNewsList"));
assert.match(home, /AdSlot/);

assert.match(news, /getCollection\("articles"/);
assert.match(news, /ExternalNewsList/);
assert.doesNotMatch(news, /ExternalNewsCard/);

assert.match(article, /article-hero-image/);
assert.match(article, /heroImageAlt/);
assert.match(article, /heroImageSourceName/);
assert.match(article, /data-fallback-src="\/images\/categories\/news-default\.svg"/);
assert.match(article, /return "Steam"/);
assert.match(article, /return "THQ Nordic"/);
assert.match(article, /Weitere News/);
assert.equal((article.match(/data-article-more-news/g) ?? []).length, 1);
assert.match(article, /SteamTrendsSidebar/);
assert.match(article, /AdSlot/);
assert.match(article, /placement="article-bottom"/);
assert.ok(article.indexOf('placement="article-bottom"') < article.indexOf("data-article-more-news"));
assert.ok(article.indexOf("</aside>") < article.indexOf("data-article-more-news"));
assert.match(article, /placement="article-sidebar"/);
assert.match(contentBlocks, /article-content-image/);
assert.match(contentBlocks, /Bildquelle:/);
assert.match(contentBlocks, /data-article-content-image/);
assert.match(contentBlocks, /rightsStatus/);
assert.match(contentBlocks, /placement=\{block\.slot\}/);
assert.match(adSlot, />WERBUNG</);
assert.match(adSlot, /privacyConfig\.adsEnabled/);
assert.doesNotMatch(adSlot, /adsbygoogle|googlesyndication|<script[^>]+src=/i);
assert.match(contentConfig, /article-inline-1/);
assert.match(contentConfig, /article-inline-2/);
assert.match(contentConfig, /words < 500 \? 1 : 2/);
assert.match(contentConfig, /blockedImageHost/);
assert.match(globalCss, /@media \(max-width: 720px\)/);
assert.match(globalCss, /\.article-layout > \.article-sidebar/);
assert.match(globalCss, /\.article-content-image img[\s\S]*object-fit: cover/);
assert.match(gothic, /^status: "published"$/m);
assert.match(gothic, /^heroImage: "https:\/\/shared\.fastly\.steamstatic\.com\/store_item_assets\/steam\/apps\/1297900\/header\.jpg"$/m);
assert.match(gothic, /^heroImageAlt: ".+"$/m);
assert.match(gothic, /^heroImageSourceName: "Steam \/ THQ Nordic"$/m);
assert.match(gothic, /type: "ad"\n    slot: "article-inline-1"/);
assert.match(gothic, /contentBlocks:/);
const gothicHeadings = gothicData.contentBlocks
  .filter((block) => block.type === "heading")
  .map((block) => block.text);
assert.equal(new Set(gothicHeadings).size, gothicHeadings.length);
assert.equal(gothicData.contentBlocks.filter((block) => block.type === "ad").length, 1);
assert.equal(
  gothicData.contentBlocks.every(
    (block) => block.type !== "image" || ["approved", "fallback"].includes(block.rightsStatus ?? "")
  ),
  true
);
assert.equal(gothicData.contentBlocks.filter((block) => block.type === "heading").length >= 5, true);
assert.equal((gothic.match(/^# /gm) ?? []).length, 0);
assert.equal((gothic.match(/^## Quellen$/gm) ?? []).length, 0);
assert.doesNotMatch(gothic.split("---").slice(2).join("---"), /src\/data\/editorial|22:54:09|UTC|SpielSignal-Erhebung/);
assert.doesNotMatch(gothicReaderText, /Snapshot|UTC|Entwurf|Workflow|Repository|src\/|docs\/|redaktionelle Notiz|interne/i);
assert.match(gothicReaderText, /Die starke Platzierung in den Steam-Topsellern ist ein nachvollziehbares Signal/);
assert.doesNotMatch(gothic, /steamdb\.info|gamestar\.de|pcgames\.de|gamepro\.de/i);
assert.match(imageRights, /Gothic 1 Remake \| Hero/);
assert.match(imageRights, /Steam-App-ID/);
assert.match(imageRights, /keine zusätzlichen externen Bilder freigegeben/);
assert.match(aiProvider, /recommendedImages/);
assert.match(aiProvider, /"hero", "after-intro", "mid-article"/);
assert.match(aiProvider, /Erteile niemals eine Bildfreigabe/);

assert.match(releases, /SteamReleaseGrid/);
assert.match(read("src/components/SteamReleaseGrid.astro"), /automatische Steam-Release-Übersicht wird derzeit vorbereitet/);

assert.match(gamePass, /Neu im PC Game Pass/);
assert.match(gamePass, /Demnächst im PC Game Pass/);
assert.match(gamePass, /Bald nicht mehr verfügbar/);
assert.equal(approvedPcGamePassEntries.every((entry) => entry.status === "approved"), true);
assert.equal(approvedPcGamePassEntries.every((entry) => entry.platform === "PC"), true);
assert.equal(pcGamePassEntries.some((entry) => entry.status === "draft" && approvedPcGamePassEntries.includes(entry)), false);

const textExtensions = new Set([".astro", ".ts", ".md", ".css", ".json", ".mjs", ".yml", ".yaml"]);
const trackedTextFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter((path) => path && textExtensions.has(extname(path)));
const forbiddenUnicode = /[\u00A0\u202A-\u202E\u2066-\u2069\uFEFF]/;

for (const path of trackedTextFiles) {
  const bytes = readFileSync(path);
  assert.equal(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, false, `${path} enthält einen UTF-8-BOM.`);
  const source = bytes.toString("utf8");
  assert.deepEqual(Buffer.from(source, "utf8"), bytes, `${path} ist nicht als gültiges UTF-8 gespeichert.`);
  assert.doesNotMatch(source, forbiddenUnicode, `${path} enthält verbotene oder versteckte Unicode-Zeichen.`);
}

for (const path of trackedTextFiles.filter((path) => [".yml", ".yaml"].includes(extname(path)))) {
  assert.doesNotThrow(() => parseYaml(read(path), { uniqueKeys: true }), `${path} enthält ungültiges YAML.`);
}

for (const path of trackedTextFiles.filter((path) => extname(path) === ".md")) {
  const source = read(path);
  if (!source.startsWith("---\n")) continue;
  const closingMarker = source.indexOf("\n---", 4);
  assert.notEqual(closingMarker, -1, `${path} enthält kein geschlossenes Frontmatter.`);
  assert.doesNotThrow(
    () => parseYaml(source.slice(4, closingMarker), { uniqueKeys: true }),
    `${path} enthält ungültiges Frontmatter oder doppelte Schlüssel.`
  );
}

console.log("Editorial-Layout-Tests erfolgreich: Navigation, Magazinstruktur, Datenfreigabe und Textqualität.");
