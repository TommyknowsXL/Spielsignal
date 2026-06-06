import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  deduplicateAndMarkSimilar,
  getAggregatedNews,
  parseFeedXml,
  type AggregatedNewsItem
} from "../src/lib/newsFeed";
import type { NewsSource } from "../src/config/newsSources";

const source: NewsSource = {
  name: "Lokale Testquelle",
  homepageUrl: "https://example.test/",
  feedUrl: "https://example.test/feed.xml",
  enabled: false,
  usageNotes: "Nur automatischer lokaler Test.",
  categoryMapping: {
    updates: "Updates",
    news: "News"
  }
};

const rss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Lokaler Test</title>
    <item>
      <title>Großes Update für das Beispielspiel</title>
      <link>https://example.test/news/update?utm_source=test</link>
      <pubDate>Sat, 06 Jun 2026 10:00:00 GMT</pubDate>
      <category>updates</category>
      <description>Dieser fremde Text darf nicht übernommen werden.</description>
    </item>
  </channel>
</rss>`;

const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Lokaler Test</title>
  <entry>
    <title>Neues Beispielspiel wurde angekündigt</title>
    <link rel="alternate" href="https://example.test/news/ankuendigung" />
    <updated>2026-06-06T11:00:00Z</updated>
  </entry>
</feed>`;

const rssItems = parseFeedXml(rss, source);
const atomItems = parseFeedXml(atom, source);

assert.equal(rssItems.length, 1);
assert.equal(rssItems[0].category, "Updates");
assert.equal(rssItems[0].url, "https://example.test/news/update");
assert.equal("description" in rssItems[0], false);
assert.equal(atomItems.length, 1);
assert.equal(atomItems[0].category, "News");

const duplicate: AggregatedNewsItem = {
  ...rssItems[0],
  id: "duplicate",
  url: "https://example.test/news/update?utm_campaign=duplicate"
};
const similar: AggregatedNewsItem = {
  ...rssItems[0],
  id: "similar",
  url: "https://example.test/news/anderer-artikel",
  title: "Großes Update für das Beispielspiel jetzt verfügbar"
};

const processed = deduplicateAndMarkSimilar([...rssItems, duplicate, similar, ...atomItems]);
assert.equal(processed.length, 3);
assert.equal(processed.some((item) => Boolean(item.similarTo)), true);

const inactiveResult = await getAggregatedNews();
assert.equal(inactiveResult.activeSourceCount, 0);
assert.equal(inactiveResult.items.length, 0);
assert.deepEqual(inactiveResult.statuses, []);

const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
  response.end(rss);
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const localSource: NewsSource = {
  ...source,
  feedUrl: `http://127.0.0.1:${address.port}/feed.xml`,
  enabled: true
};

const fetchedResult = await getAggregatedNews({ sources: [localSource] });
assert.equal(fetchedResult.items.length, 1);
assert.equal(fetchedResult.statuses[0].ok, true);
assert.equal(fetchedResult.statuses[0].fromCache, false);

await new Promise<void>((resolve, reject) =>
  server.close((error) => (error ? reject(error) : resolve()))
);

const cachedResult = await getAggregatedNews({ sources: [localSource] });
assert.equal(cachedResult.statuses[0].ok, true);
assert.equal(cachedResult.statuses[0].fromCache, true);

const fallbackResult = await getAggregatedNews({
  sources: [localSource],
  forceRefresh: true
});
assert.equal(fallbackResult.items.length, 1);
assert.equal(fallbackResult.statuses[0].ok, false);
assert.equal(fallbackResult.statuses[0].fromCache, true);
assert.equal(fallbackResult.usedFallbackCache, true);

console.log(
  "Feed-Tests erfolgreich: RSS, Atom, Abruf, Cache, Ausfall-Fallback, Deduplizierung und Titelähnlichkeit."
);
