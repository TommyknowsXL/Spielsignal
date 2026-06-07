import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NewsSource } from "../src/config/newsSources";
import type { AggregatedNewsItem } from "../src/lib/newsFeed";
import {
  agentRoles,
  MAX_DAILY_CANDIDATES
} from "./agents/agentConfig";
import { buildEditorialQueue } from "./agents/editorialAgent";
import { classifyFreeReference } from "./agents/freeReference";
import { extractGameTitle } from "./agents/gameTitle";
import {
  prepareImageCandidate,
  prepareOfficialSteamImageCandidate,
  resolveLocalFallback
} from "./agents/imageScout";
import { hasPcGamingReference } from "./agents/newsScout";
import { prepareEditorialAiDrafts } from "./agents/providers/editorialAiProvider";
import { runDailyEditorialQueue } from "./agents/runDailyEditorialQueue";
import { runSteamScout } from "./agents/steamScout";
import {
  collectSteamScoutData,
  enrichRssCandidatesWithSteam
} from "./agents/providers/steamScoutProvider";
import {
  findUniqueSteamApp
} from "../src/lib/steam/steamAppCatalog";
import { STEAM_APP_LIST_CACHE_TTL_MS } from "../src/lib/steam/steamCache";
import {
  getOfficialSteamReleases,
  STEAM_RELEASE_CACHE_TTL_MS
} from "../src/lib/steam/steamReleaseProvider";
import {
  getSteamMostPlayed,
  STEAM_TREND_CACHE_TTL_MS
} from "../src/lib/steam/steamMostPlayedProvider";
import {
  getSteamTopSellers,
  parseSteamTopSellersHtml,
  STEAM_TOP_SELLER_CACHE_TTL_MS,
  STEAM_TOP_SELLERS_DE_URL,
  STEAM_TOP_SELLERS_GLOBAL_URL
} from "../src/lib/steam/steamTopSellersProvider";
import type { EditorialCandidate } from "./agents/types";
import {
  createEditorialDraft,
  isSuitablePrimarySource
} from "./agents/createEditorialDraft";

const baseCandidate: EditorialCandidate = {
  id: "candidate-1",
  createdAt: "2026-06-06T10:00:00.000Z",
  sourceType: "rss-news",
  sourceName: "Testquelle",
  sourceUrl: "https://example.test/news/1",
  title: "Neues PC-Spiel erhält ein großes Update",
  articleType: "news-overview",
  score: 20,
  scoreReasons: ["Erkennbarer PC-Gaming-Bezug"],
  imageStatus: "fallback",
  imagePath: "/images/categories/news-default.svg",
  editorialStatus: "needs-review",
  openChecks: ["Originalquelle prüfen."],
  recommendedNextAction: "Redaktionell prüfen."
};

assert.equal(agentRoles.steamScout.automaticPublishing, false);
assert.equal(agentRoles.newsScout.automaticPublishing, false);
assert.equal(agentRoles.imageScout.automaticApproval, false);
assert.equal(agentRoles.editorialAgent.automaticPublishing, false);
assert.equal(agentRoles.editorialAgent.automaticMainMerge, false);

const manyCandidates = Array.from({ length: 15 }, (_, index) => ({
  ...baseCandidate,
  id: `candidate-${index}`,
  sourceUrl: `https://example.test/news/${index}`,
  sourceName: `Testquelle ${index % 3}`,
  title: `PC Meldung Kennung${index} Thema${index} Detail${index}`,
  score: index
}));
const queue = buildEditorialQueue(manyCandidates);
assert.equal(queue.length <= MAX_DAILY_CANDIDATES, true);
assert.equal(queue.length, 5);
assert.equal(queue.every((candidate) => Boolean(candidate.sourceUrl)), true);
assert.equal(queue.every((candidate) => candidate.editorialStatus === "needs-review"), true);
assert.equal(queue.some((candidate) => (candidate.articleType as string) === "test"), false);
assert.equal(queue.some((candidate) => candidate.editorialStatus === "published"), false);
assert.equal(
  Math.max(
    ...[...new Set(queue.map((candidate) => candidate.sourceName))].map(
      (sourceName) =>
        queue.filter((candidate) => candidate.sourceName === sourceName).length
    )
  ) <= 6,
  true
);

for (const [headline, expected] of [
  ["Goals - Das neue Gratis-FIFA?", "Goals"],
  ["Star Wars Zero Company: Das neue Taktik-Rollenspiel", "Star Wars Zero Company"],
  ["Gothic 1 Remake - Eines der besten Spiele", "Gothic 1 Remake"],
  ["1666: Amsterdam - Die ersten 10 Minuten", "1666: Amsterdam"],
  ["Haex: Im neuen Sci-Fi-Survival-Shooter", "Haex"],
  ["Crossfire: Neuer Singleplayer-Shooter", "Crossfire"]
] as const) {
  assert.equal(extractGameTitle(headline), expected);
}
assert.equal(
  extractGameTitle("Warum dieses neue PC-Spiel gerade viele Fans überrascht"),
  undefined
);
assert.equal(
  extractGameTitle("Mech-Fans aufgepasst: Endlich kommt ein neues Spiel"),
  undefined
);
assert.equal(
  extractGameTitle("Strategie-Rollenspiel im Early Access: Noch 2026"),
  undefined
);
assert.equal(extractGameTitle("PC-Gaming - Mein Rechner im Wohnzimmer"), undefined);

assert.equal(
  classifyFreeReference("Goals - Das neue Gratis-FIFA?").type,
  "unknown-free-reference"
);
assert.equal(classifyFreeReference("Jetzt ist eine Demo verfügbar").type, "demo");
assert.equal(classifyFreeReference("Free Weekend bis Montag").type, "free-weekend");
assert.equal(classifyFreeReference("Free-to-Keep für kurze Zeit").type, "free-to-keep");
assert.equal(classifyFreeReference("Free Weekend bis Montag").requiresReview, true);
assert.equal(
  buildEditorialQueue([
    {
      ...baseCandidate,
      title: "Großes Update für 1666 Amsterdam bringt neue Inhalte",
      sourceUrl: "https://example.test/a"
    },
    {
      ...baseCandidate,
      title: "1666: Das große Update bringt viele neue Inhalte",
      sourceUrl: "https://example.test/b"
    },
    {
      ...baseCandidate,
      title: "1666 Amsterdam zeigt die ersten Minuten der Demo",
      sourceUrl: "https://example.test/c"
    }
  ]).length,
  1
);
assert.equal(
  hasPcGamingReference({
    title: "iOS 27: Dieses Update kommt auf das iPhone"
  } as AggregatedNewsItem),
  false
);
assert.equal(
  hasPcGamingReference({
    title: "Steam-Demo: Neues PC-Strategiespiel ist jetzt spielbar"
  } as AggregatedNewsItem),
  true
);

const withoutSource = buildEditorialQueue([
  { ...baseCandidate, sourceUrl: "" }
]);
assert.equal(withoutSource.length, 0);

const pendingImage = prepareImageCandidate({
  articleUrl: baseCandidate.sourceUrl,
  articleTitle: baseCandidate.title,
  candidateImageUrl: "https://official.example.test/press/image.jpg",
  sourcePageUrl: "https://official.example.test/press/",
  sourceType: "publisher-presskit",
  rightsNotes: "Nutzungsgrundlage muss manuell geprüft werden."
});
assert.equal(pendingImage.status, "pending-review");
assert.equal(
  resolveLocalFallback("Star Wars Zero Company: Taktik-Rollenspiel"),
  "/images/categories/strategie.svg"
);
assert.equal(
  resolveLocalFallback("Gothic 1 Remake"),
  "/images/categories/rollenspiele.svg"
);
assert.equal(
  resolveLocalFallback("Haex: Sci-Fi-Survival-Shooter"),
  "/images/categories/survival.svg"
);
assert.equal(
  resolveLocalFallback("Crossfire: Neuer Shooter"),
  "/images/categories/shooter.svg"
);
const officialSteamImage = prepareOfficialSteamImageCandidate(
  "123456",
  "https://store.steampowered.com/app/123456/Test/"
);
assert.equal(officialSteamImage.status, "pending-review");
assert.equal(officialSteamImage.sourceType, "steam-store");

const steamCandidates = await runSteamScout([
  {
    sourceType: "steam-release",
    sourceName: "Offizieller Steam Store",
    sourceUrl: "https://store.steampowered.com/app/123456/Test/",
    title: "Test Strategy erscheint auf Steam",
    gameTitle: "Test Strategy",
    steamAppId: "123456",
    genre: "Strategie",
    sourceReviewed: true
  },
  {
    sourceType: "free-promotion",
    sourceName: "Offizieller Steam Store",
    sourceUrl: "https://store.steampowered.com/app/654321/Test_Free/",
    title: "Test Free Weekend",
    gameTitle: "Test Free",
    steamAppId: "654321",
    sourceReviewed: true,
    freeReferenceType: "free-weekend",
    freePromotionConfirmed: false
  }
]);
assert.equal(steamCandidates.length, 2);
assert.equal(steamCandidates[0].imageStatus, "pending-review");
assert.equal(steamCandidates[1].articleType, "free-promotion-candidate");
assert.equal(
  steamCandidates.every((candidate) => candidate.editorialStatus === "needs-review"),
  true
);

const aiResult = await prepareEditorialAiDrafts([baseCandidate], {
  AI_EDITORIAL_ENABLED: "false",
  OPENAI_API_KEY: undefined
});
assert.equal(aiResult.enabled, false);
assert.deepEqual(aiResult.drafts, []);

assert.equal(isSuitablePrimarySource("https://store.steampowered.com/app/123/"), true);
assert.equal(isSuitablePrimarySource("https://www.gamestar.de/artikel/test.html"), false);

const draftRoot = await mkdtemp(join(tmpdir(), "spielsignal-draft-"));
await mkdir(join(draftRoot, "src/data/editorial"), { recursive: true });
await writeFile(
  join(draftRoot, "src/data/editorial/latest-queue.json"),
  JSON.stringify({
    candidates: [baseCandidate]
  }),
  "utf8"
);
const blockedDraft = await createEditorialDraft({
  rootDirectory: draftRoot,
  candidateId: baseCandidate.id,
  articleType: "news-overview",
  generatedAt: "2026-06-08T10:00:00.000Z"
});
assert.equal(blockedDraft.status, "needs-source-review");
const blockedDraftMarkdown = await readFile(blockedDraft.filePath, "utf8");
assert.match(blockedDraftMarkdown, /Offizielle Primärquelle fehlt/);
assert.match(blockedDraftMarkdown, /externalTipSources/);
assert.doesNotMatch(blockedDraftMarkdown, /status: "published"/);

const sourcedDraft = await createEditorialDraft({
  rootDirectory: draftRoot,
  candidateId: baseCandidate.id,
  articleType: "release-check",
  primarySourceUrls: ["https://store.steampowered.com/app/123456/Test/"],
  generatedAt: "2026-06-08T11:00:00.000Z"
});
assert.equal(sourcedDraft.status, "draft");
assert.equal(sourcedDraft.primarySources.length, 1);

const workflow = await readFile(
  ".github/workflows/daily-editorial-queue.yml",
  "utf8"
);
assert.doesNotMatch(workflow, /\bgit\s+(push|commit|merge)\b/i);
assert.doesNotMatch(workflow, /\bdeploy\b/i);
assert.match(workflow, /permissions:\s*\n\s*contents: read/);
assert.match(workflow, /workflow_dispatch/);
assert.match(workflow, /schedule/);
assert.match(workflow, /STEAM_WEB_API_KEY: \$\{\{ secrets\.STEAM_WEB_API_KEY \}\}/);
assert.match(workflow, /STEAM_SCOUT_ENABLED: "true"/);
assert.match(workflow, /STEAM_TOP_SELLERS_ENABLED: "true"/);
assert.match(workflow, /PUBLIC_STEAM_MOST_PLAYED_ENABLED: "false"/);
const queueStep = workflow.match(
  /- name: Tagesqueue erzeugen[\s\S]*?(?=\n\s+- name: Tests ausführen)/
)?.[0];
assert.ok(queueStep);
assert.match(
  queueStep,
  /STEAM_WEB_API_KEY: \$\{\{ secrets\.STEAM_WEB_API_KEY \}\}/
);
assert.equal(
  (workflow.match(/STEAM_WEB_API_KEY:/g) ?? []).length,
  1
);
assert.match(workflow, /GITHUB_STEP_SUMMARY|Summary bestätigen/);

const draftWorkflow = await readFile(
  ".github/workflows/create-editorial-draft.yml",
  "utf8"
);
assert.match(draftWorkflow, /name: Create Editorial Draft/);
assert.match(draftWorkflow, /candidate_id:[\s\S]*required: true/);
assert.match(draftWorkflow, /contents: write/);
assert.match(draftWorkflow, /pull-requests: write/);
assert.match(draftWorkflow, /git checkout -b/);
assert.match(draftWorkflow, /gh pr create/);
assert.doesNotMatch(draftWorkflow, /\bgh\s+pr\s+merge\b|\bgit\s+merge\b/i);
assert.doesNotMatch(draftWorkflow, /\bvercel\b|\bdeploy\b/i);
assert.doesNotMatch(draftWorkflow, /run:\s*[^\n]*\$\{\{\s*inputs\./);

const agentFiles = await readdir("scripts/agents", {
  recursive: true,
  withFileTypes: true
});
const sourceFiles = agentFiles
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => join(entry.parentPath, entry.name));
const agentCode = (
  await Promise.all(sourceFiles.map((path) => readFile(path, "utf8")))
).join("\n");
assert.doesNotMatch(agentCode, /steamdb\.info/i);
assert.doesNotMatch(agentCode, /\bfetch\s*\([^)]*steamdb/i);
assert.doesNotMatch(agentCode, /\b(sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,})\b/);
assert.doesNotMatch(agentCode, /console\.log\([^)]*(API_KEY|TOKEN)/i);
assert.doesNotMatch(agentCode, /src[\\/]content[\\/].*(writeFile|mkdir)/i);
assert.doesNotMatch(agentCode, /\bfetch\w*\s*\([^)]*steamapi\.xpaw\.me/i);

const safeRoot = await mkdtemp(join(tmpdir(), "spielsignal-agent-safe-"));
const safeReport = await runDailyEditorialQueue({
  reportDate: "2026-06-06",
  rootDirectory: safeRoot,
  newsSources: [],
  steamRecords: []
});
assert.equal(safeReport.candidates.length, 0);
assert.equal(safeReport.safeguards.automaticPublishing, false);
assert.equal(safeReport.safeguards.automaticMainMerge, false);
await readFile(join(safeRoot, "src/data/editorial/latest-queue.json"), "utf8");
await readFile(
  join(safeRoot, "src/data/editorial/archive/2026-06-06.json"),
  "utf8"
);
const safeMarkdown = await readFile(
  join(safeRoot, "docs/editorial/daily-reports/2026-06-06.md"),
  "utf8"
);
assert.doesNotMatch(safeMarkdown, /## 0\./);
assert.match(safeMarkdown, /## Zusammenfassung/);
assert.match(safeMarkdown, /Steam-Scout/);
assert.equal(safeReport.summary.rssCandidates, 0);
assert.match(safeMarkdown, /veröffentlicht keine Artikel/);

const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Agententest</title>
<item><title>Neues PC-Spiel erhält großes Update</title>
<link>https://example.test/news/pc-update</link>
<pubDate>Sat, 06 Jun 2026 10:00:00 GMT</pubDate>
<category>news</category></item></channel></rss>`;
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "application/rss+xml" });
  response.end(rss);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const goodSource: NewsSource = {
  name: "Lokale Agenten-Testquelle",
  homepageUrl: "https://example.test/",
  feedUrl: `http://127.0.0.1:${address.port}/feed.xml`,
  enabled: true,
  categoryMapping: "News",
  usageNotes: "Nur automatischer Test."
};
const brokenSource: NewsSource = {
  ...goodSource,
  name: "Defekte Agenten-Testquelle",
  feedUrl: "http://127.0.0.1:1/feed.xml"
};
const partialRoot = await mkdtemp(join(tmpdir(), "spielsignal-agent-partial-"));
const partialReport = await runDailyEditorialQueue({
  reportDate: "2026-06-07",
  rootDirectory: partialRoot,
  newsSources: [goodSource, brokenSource],
  forceRefresh: true
});
assert.equal(partialReport.candidates.length, 1);
assert.equal(partialReport.sourceErrors.length, 1);
assert.equal(partialReport.summary.sourceErrors, 1);
assert.equal(partialReport.candidates[0].sourceUrl, "https://example.test/news/pc-update");
assert.equal(partialReport.candidates[0].imageStatus, "fallback");
assert.equal(partialReport.candidates[0].editorialStatus, "needs-review");

const mixedRoot = await mkdtemp(join(tmpdir(), "spielsignal-agent-mixed-"));
const mixedReport = await runDailyEditorialQueue({
  reportDate: "2026-06-08",
  rootDirectory: mixedRoot,
  newsSources: [goodSource],
  steamRecords: [
    {
      sourceType: "steam-release",
      sourceName: "Offizieller Steam Store",
      sourceUrl: "https://store.steampowered.com/app/111111/Strategy_One/",
      title: "Strategy One erscheint auf Steam",
      gameTitle: "Strategy One",
      steamAppId: "111111",
      genre: "Strategie",
      sourceReviewed: true
    },
    {
      sourceType: "steam-top-seller",
      sourceName: "Offizieller Steam Store",
      sourceUrl: "https://store.steampowered.com/app/222222/Survival_Two/",
      title: "Survival Two erhält großes Update",
      gameTitle: "Survival Two",
      steamAppId: "222222",
      genre: "Survival",
      sourceReviewed: true
    }
  ],
  forceRefresh: true
});
assert.equal(
  mixedReport.candidates.filter((candidate) => candidate.sourceType !== "rss-news").length,
  2
);
assert.equal(mixedReport.summary.imageCandidates, 2);
assert.match(mixedReport.steamScoutStatus, /2 verwertbare/);
await new Promise<void>((resolve, reject) =>
  server.close((error) => (error ? reject(error) : resolve()))
);

assert.equal(STEAM_RELEASE_CACHE_TTL_MS >= 6 * 60 * 60 * 1000, true);
assert.equal(STEAM_TREND_CACHE_TTL_MS >= 60 * 60 * 1000, true);
assert.equal(STEAM_TOP_SELLER_CACHE_TTL_MS, 60 * 60 * 1000);
assert.match(STEAM_TOP_SELLERS_DE_URL, /topselling\/DE$/);
assert.match(STEAM_TOP_SELLERS_GLOBAL_URL, /topselling\/global$/);
assert.equal(STEAM_APP_LIST_CACHE_TTL_MS >= 6 * 60 * 60 * 1000, true);
let releaseLoadCount = 0;
const releaseCacheRoot = await mkdtemp(
  join(tmpdir(), "spielsignal-release-cache-")
);
const loadReleaseFixture = async () => {
  releaseLoadCount += 1;
  return [
    ...Array.from({ length: 7 }, (_, index) => ({
      appId: String(7000 + index),
      name: `Release ${index}`,
      releaseDate: `2026-06-${String(10 + index).padStart(2, "0")}`,
      genre: "Action",
      storeUrl: `https://store.steampowered.com/app/${7000 + index}/Release_${index}/`
    })),
    {
      appId: "7999",
      name: "Release Soundtrack DLC",
      releaseDate: "2026-06-30",
      genre: "DLC",
      storeUrl: "https://store.steampowered.com/app/7999/Release_DLC/"
    }
  ];
};
const cachedReleases = await getOfficialSteamReleases({
  loadOfficialSource: loadReleaseFixture,
  cacheDirectory: releaseCacheRoot
});
await getOfficialSteamReleases({
  loadOfficialSource: loadReleaseFixture,
  cacheDirectory: releaseCacheRoot
});
assert.equal(releaseLoadCount, 1);
assert.equal(cachedReleases.records.length, 5);
assert.equal(
  cachedReleases.records.some((record) => /dlc|soundtrack/i.test(record.name)),
  false
);
assert.equal(
  findUniqueSteamApp("Goals", [
    { appid: 10, name: "Goals" },
    { appid: 11, name: "Unrelated" }
  ])?.appid,
  10
);
assert.equal(
  findUniqueSteamApp("Goals", [
    { appid: 10, name: "Goals" },
    { appid: 12, name: "GOALS" }
  ]),
  undefined
);

let steamFetchCount = 0;
const secretSentinel = ["STEAM", "TEST", "SENTINEL"].join("_");
const topSellerFixture = `
<a href="https://store.steampowered.com/app/1001/Alpha/" data-ds-appid="1001" class="search_result_row">
  <div class="search_capsule"><img src="https://shared.fastly.steamstatic.com/alpha.jpg"></div>
  <div class="search_name"><span class="title">Alpha Strategy</span></div>
  <div class="discount_pct">-20%</div><div class="discount_final_price">31,99€</div>
</a>
<a href="https://store.steampowered.com/app/1002/Tool/" data-ds-appid="1002" class="search_result_row">
  <span class="title">Wallpaper Engine</span>
</a>
<a href="https://store.steampowered.com/app/1003/Beta/" data-ds-appid="1003" class="search_result_row">
  <div class="search_capsule"><img src="https://shared.fastly.steamstatic.com/beta.jpg"></div>
  <span class="title">Beta Survival</span><div class="search_price">19,99€</div>
</a>
<a href="https://store.steampowered.com/app/1004/Deck/" data-ds-appid="1004" class="search_result_row">
  <span class="title">Steam Deck</span>
</a>
<a href="https://store.steampowered.com/app/1005/DLC/" data-ds-appid="1005" class="search_result_row">
  <span class="title">Beta Survival DLC</span>
</a>
<a href="https://store.steampowered.com/app/1006/Hardware/" data-ds-appid="1006" class="search_result_row">
  <span class="title">Gaming Hardware</span>
</a>`;
const parsedTopSellers = parseSteamTopSellersHtml(topSellerFixture, {
  region: "DE",
  fetchedAt: "2026-06-06T10:00:00.000Z",
  sourceUrl: STEAM_TOP_SELLERS_DE_URL
});
assert.deepEqual(parsedTopSellers.map((record) => record.rank), [1, 3]);
assert.deepEqual(parsedTopSellers.map((record) => record.title), [
  "Alpha Strategy",
  "Beta Survival"
]);
assert.equal(parsedTopSellers[0].discountText, "-20%");
assert.equal(parsedTopSellers[0].priceText, "31,99€");
assert.equal(parsedTopSellers.every((record) => Boolean(record.imageUrl)), true);
const topSellerProviderSource = await readFile(
  "src/lib/steam/steamTopSellersProvider.ts",
  "utf8"
);
assert.doesNotMatch(topSellerProviderSource, /Gothic/i);

const globalFallback = await getSteamTopSellers({
  cacheDirectory: await mkdtemp(join(tmpdir(), "spielsignal-top-global-")),
  fetchImpl: async (input) => {
    const url = new URL(String(input));
    return url.searchParams.get("cc") === "DE"
      ? new Response("Fehler", { status: 503 })
      : new Response(
          JSON.stringify({ success: 1, results_html: topSellerFixture }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
  }
});
assert.equal(globalFallback.region, "global");
assert.equal(globalFallback.records[0].region, "global");

const failedTopSellers = await getSteamTopSellers({
  cacheDirectory: await mkdtemp(join(tmpdir(), "spielsignal-top-failure-")),
  fetchImpl: async () => new Response("Fehler", { status: 503 })
});
assert.deepEqual(failedTopSellers.records, []);
assert.match(failedTopSellers.status, /derzeit nicht verfügbar/);

const mockSteamFetch: typeof fetch = async (input) => {
  steamFetchCount += 1;
  const url = new URL(String(input));
  if (url.pathname.includes("IStoreService/GetAppList")) {
    return new Response(
      JSON.stringify({
        response: {
          apps: [
            { appid: 1001, name: "Goals" },
            { appid: 1002, name: "Star Wars Zero Company" }
          ],
          more_results: false
        }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
  if (url.pathname.includes("ISteamChartsService/GetMostPlayedGames")) {
    return new Response(
      JSON.stringify({
        response: {
          ranks: [
            {
              rank: 1,
              appid: 1001,
              concurrent_in_game: 123,
              item: { id: 1001, name: "Goals" }
            }
          ]
        }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
  if (url.pathname.includes("/search/results/")) {
    return new Response(
      JSON.stringify({ success: 1, results_html: topSellerFixture }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
  return new Response("{}", { status: 404 });
};
const steamCacheRoot = await mkdtemp(join(tmpdir(), "spielsignal-steam-cache-"));
const providerResult = await collectSteamScoutData({
  env: {
    STEAM_WEB_API_KEY: secretSentinel,
    STEAM_SCOUT_ENABLED: "true",
    STEAM_RELEASES_ENABLED: "true",
    STEAM_TOP_SELLERS_ENABLED: "true",
    PUBLIC_STEAM_MOST_PLAYED_ENABLED: "false"
  },
  fetchImpl: mockSteamFetch,
  cacheDirectory: steamCacheRoot
});
assert.equal(providerResult.keyPresent, true);
assert.equal(providerResult.records.length, 2);
assert.match(providerResult.releaseStatus, /derzeit nicht verfügbar/);
assert.match(providerResult.topSellerStatus, /aktiv/);
assert.match(providerResult.mostPlayedStatus, /deaktiviert/);
assert.equal(providerResult.topSellerRegion, "DE");

const noKeyProvider = await collectSteamScoutData({
  env: {
    STEAM_SCOUT_ENABLED: "true",
    STEAM_RELEASES_ENABLED: "true",
    STEAM_TOP_SELLERS_ENABLED: "true",
    PUBLIC_STEAM_MOST_PLAYED_ENABLED: "false"
  },
  fetchImpl: mockSteamFetch,
  cacheDirectory: await mkdtemp(join(tmpdir(), "spielsignal-steam-no-key-"))
});
assert.equal(noKeyProvider.keyPresent, false);
assert.match(noKeyProvider.scoutStatus, /API-Key fehlt/);

const failedTrend = await getSteamMostPlayed({
  enabled: true,
  apiKey: "test-key",
  fetchImpl: async () => new Response("Fehler", { status: 503 }),
  cacheDirectory: await mkdtemp(join(tmpdir(), "spielsignal-steam-failure-"))
});
assert.deepEqual(failedTrend.records, []);
assert.match(failedTrend.status, /derzeit nicht verfügbar/);

const enriched = enrichRssCandidatesWithSteam(
  [{ ...baseCandidate, gameTitle: "Goals" }],
  providerResult.appCatalog
);
assert.equal(enriched[0].steamAppId, "1001");
assert.equal(enriched[0].imageStatus, "pending-review");
assert.equal(enriched[0].imageSourceType, "steam-store");
assert.equal(enriched[0].imagePath, "/images/categories/news-default.svg");

const beforeCachedTopSellers = steamFetchCount;
await getSteamTopSellers({
  enabled: true,
  fetchImpl: mockSteamFetch,
  cacheDirectory: steamCacheRoot
});
assert.equal(steamFetchCount, beforeCachedTopSellers);

const secretReportRoot = await mkdtemp(join(tmpdir(), "spielsignal-secret-report-"));
const secretReport = await runDailyEditorialQueue({
  reportDate: "2026-06-09",
  rootDirectory: secretReportRoot,
  newsSources: [],
  env: {
    STEAM_WEB_API_KEY: secretSentinel,
    STEAM_SCOUT_ENABLED: "true",
    STEAM_RELEASES_ENABLED: "true",
    STEAM_TOP_SELLERS_ENABLED: "true",
    PUBLIC_STEAM_MOST_PLAYED_ENABLED: "false"
  },
  fetchImpl: mockSteamFetch,
  steamCacheDirectory: steamCacheRoot
});
const secretJson = await readFile(
  join(secretReportRoot, "src/data/editorial/latest-queue.json"),
  "utf8"
);
const secretMarkdown = await readFile(
  join(secretReportRoot, "docs/editorial/daily-reports/2026-06-09.md"),
  "utf8"
);
assert.equal(secretReport.steamApiKeyPresent, true);
assert.equal(secretJson.includes(secretSentinel), false);
assert.equal(secretMarkdown.includes(secretSentinel), false);
assert.match(secretMarkdown, /Steam-API-Key vorhanden:\*\* ja/);

const releaseRecords = Array.from({ length: 7 }, (_, index) => ({
  sourceType: "steam-release" as const,
  sourceName: "Steam",
  sourceUrl: `https://store.steampowered.com/app/${3000 + index}/Game_${index}/`,
  title: `UniqueTitle${index} Genre${index} Launch${index}`,
  gameTitle: `UniqueTitle${index}`,
  steamAppId: String(3000 + index),
  sourceReviewed: true
}));
const releasesWithDlc = await runSteamScout([
  ...releaseRecords,
  {
    ...releaseRecords[0],
    steamAppId: "9999",
    sourceUrl: "https://store.steampowered.com/app/9999/Game_DLC/",
    title: "Game DLC Soundtrack"
  }
]);
assert.equal(releasesWithDlc.some((candidate) => /soundtrack/i.test(candidate.title)), false);
assert.equal(
  buildEditorialQueue(releasesWithDlc).filter(
    (candidate) => candidate.sourceType === "steam-release"
  ).length,
  5
);

const hardwareQueue = buildEditorialQueue(
  Array.from({ length: 4 }, (_, index) => ({
    ...baseCandidate,
    id: `hardware-${index}`,
    sourceName: `Hardware ${index}`,
    sourceUrl: `https://example.test/hardware/${index}`,
    title: `PC Hardware Kennung${index}`,
    category: "Hardware"
  }))
);
assert.equal(
  hardwareQueue.filter((candidate) => candidate.category === "Hardware").length,
  2
);

console.log(
  "Agenten-Tests erfolgreich: sichere Basis, Top-10, Berichte, Teil-Ausfall und keine automatische Veröffentlichung."
);
