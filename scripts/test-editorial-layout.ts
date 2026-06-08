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
assert.match(article, /Bildquelle: Steam \/ THQ Nordic/);
assert.match(article, /return "Steam"/);
assert.match(article, /return "THQ Nordic"/);
assert.match(article, /Weitere News/);
assert.match(article, /SteamTrendsSidebar/);
assert.match(article, /AdSlot/);
assert.match(gothic, /^status: "published"$/m);
assert.match(gothic, /^heroImage: "https:\/\/shared\.fastly\.steamstatic\.com\/store_item_assets\/steam\/apps\/1297900\/header\.jpg"$/m);
assert.equal((gothic.match(/^# /gm) ?? []).length, 0);
assert.equal((gothic.match(/^## Quellen$/gm) ?? []).length, 0);
assert.doesNotMatch(gothic.split("---").slice(2).join("---"), /src\/data\/editorial|22:54:09|UTC|SpielSignal-Erhebung/);

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
