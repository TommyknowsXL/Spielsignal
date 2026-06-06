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
import { prepareImageCandidate } from "./agents/imageScout";
import { hasPcGamingReference } from "./agents/newsScout";
import { prepareEditorialAiDrafts } from "./agents/providers/editorialAiProvider";
import { runDailyEditorialQueue } from "./agents/runDailyEditorialQueue";
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
assert.equal(partialReport.candidates[0].sourceUrl, "https://example.test/news/pc-update");
assert.equal(partialReport.candidates[0].imageStatus, "fallback");
assert.equal(partialReport.candidates[0].editorialStatus, "needs-review");
await new Promise<void>((resolve, reject) =>
  server.close((error) => (error ? reject(error) : resolve()))
);

console.log(
  "Agenten-Tests erfolgreich: sichere Basis, Top-10, Berichte, Teil-Ausfall und keine automatische Veröffentlichung."
);
