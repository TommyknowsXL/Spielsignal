import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
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
import type { EditorialCandidate } from "./agents/types";

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
  imagePath: "/images/demo/general.svg",
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
assert.equal(queue.length, MAX_DAILY_CANDIDATES);
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
  PUBLIC_AI_EDITORIAL_ENABLED: "false",
  OPENAI_API_KEY: undefined
});
assert.equal(aiResult.enabled, false);
assert.deepEqual(aiResult.drafts, []);

const workflow = await readFile(
  ".github/workflows/daily-editorial-queue.yml",
  "utf8"
);
assert.doesNotMatch(workflow, /\bgit\s+(push|commit|merge)\b/i);
assert.doesNotMatch(workflow, /\bdeploy\b/i);
assert.match(workflow, /permissions:\s*\n\s*contents: read/);
assert.match(workflow, /workflow_dispatch/);
assert.match(workflow, /schedule/);

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
      sourceType: "steam-trend",
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

console.log(
  "Agenten-Tests erfolgreich: sichere Basis, Top-10, Berichte, Teil-Ausfall und keine automatische Veröffentlichung."
);
