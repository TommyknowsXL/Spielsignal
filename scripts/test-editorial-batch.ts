import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  createEditorialBatch,
  DEFAULT_EDITORIAL_QUEUE_PATH,
  loadEditorialQueue
} from "./agents/createEditorialBatch";
import {
  classifyEditorialAiError,
  prepareEditorialAiDrafts
} from "./agents/providers/editorialAiProvider";
import {
  findOfficialPrimarySources
} from "./agents/sources/findOfficialPrimarySources";
import { runFactCheck } from "./agents/review/factCheck";
import { runReaderInterestCheck } from "./agents/review/readerInterestCheck";
import { runTechnicalCheck } from "./agents/review/technicalCheck";
import type { DraftReviewInput } from "./agents/review/types";
import type { EditorialCandidate, EditorialQueueReport } from "./agents/types";
import {
  prepareBatchQueue,
  renderBatchQueueDiagnostics,
  renderBatchQueueSummary
} from "./agents/writeBatchQueueSummary";

const temporaryRoots = new Set<string>();
const relevantEnvironmentKeys = [
  "AI_EDITORIAL_ENABLED",
  "AI_EDITORIAL_MODEL",
  "AI_EDITORIAL_MAX_ARTICLES",
  "AI_EDITORIAL_MAX_RETRIES",
  "AI_EDITORIAL_FAIL_WITHOUT_QUOTA",
  "GITHUB_RUN_ID",
  "OPENAI_API_KEY"
] as const;
const initialEnvironment = Object.fromEntries(
  relevantEnvironmentKeys.map((key) => [key, process.env[key]])
);

async function createTestRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.add(root);
  return root;
}

async function cleanupTestRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
  temporaryRoots.delete(root);
}

function shouldCreatePullRequest(completeDrafts: number): boolean {
  return completeDrafts > 0;
}

type ContentBlock = {
  type: string;
  slot?: string;
  text?: string;
  items?: string[];
};

function parseFrontmatter(markdown: string): Record<string, unknown> {
  assert.equal(markdown.startsWith("---\n"), true, "Markdown muss Frontmatter enthalten.");
  const closingMarker = markdown.indexOf("\n---", 4);
  assert.notEqual(closingMarker, -1, "Frontmatter muss geschlossen sein.");
  return parseYaml(markdown.slice(4, closingMarker), { uniqueKeys: true }) as Record<string, unknown>;
}

function contentBlocksFrom(markdown: string): ContentBlock[] {
  const contentBlocks = parseFrontmatter(markdown).contentBlocks;
  assert.equal(Array.isArray(contentBlocks), true, "contentBlocks muss ein Array sein.");
  return contentBlocks as ContentBlock[];
}

function hasAdSlot(contentBlocks: ContentBlock[], slot: string): boolean {
  return contentBlocks.some((block) => block.type === "ad" && block.slot === slot);
}

const inlineJsonBlocks = contentBlocksFrom(`---
contentBlocks: [{"type":"ad","slot":"article-inline-1"}]
---
`);
assert.equal(hasAdSlot(inlineJsonBlocks, "article-inline-1"), true);

const yamlBlockContentBlocks = contentBlocksFrom(`---
contentBlocks:
  - type: "ad"
    slot: "article-inline-1"
---
`);
assert.equal(hasAdSlot(yamlBlockContentBlocks, "article-inline-1"), true);

const interestingCandidate: EditorialCandidate = {
  id: "rss-interesting",
  createdAt: "2026-06-08T09:00:00.000Z",
  sourceType: "rss-news",
  sourceName: "Themenradar",
  sourceUrl: "https://example.test/radar/strategy-update",
  title: "Neues Steam-Update für PC-Strategiespiel startet heute",
  gameTitle: "Strategy Test",
  steamAppId: "123456",
  steamStoreUrl: "https://store.steampowered.com/app/123456/Strategy_Test/",
  category: "Updates",
  genre: "Strategie",
  articleType: "news-overview",
  score: 80,
  scoreReasons: ["Aktuelle Meldung", "Klarer PC-Gaming-Bezug", "Konkreter Update-Nutzen"],
  imageStatus: "fallback",
  imagePath: "/images/categories/strategie.svg",
  editorialStatus: "needs-review",
  openChecks: ["Offizielle Patchnotes prüfen."],
  recommendedNextAction: "Offizielle Primärquelle prüfen."
};

const boringCandidate: EditorialCandidate = {
  ...interestingCandidate,
  id: "rss-boring",
  title: "Schauspieler spricht über neue Netflix-Serie",
  gameTitle: undefined,
  steamAppId: undefined,
  steamStoreUrl: undefined,
  category: "Entertainment",
  score: -20,
  scoreReasons: ["Kein PC-Bezug"]
};

const report: EditorialQueueReport = {
  generatedAt: "2026-06-08T09:30:00.000Z",
  reportDate: "2026-06-08",
  candidates: [interestingCandidate, boringCandidate],
  sourceErrors: [],
  steamScoutStatus: "Test",
  steamReleaseStatus: "Test",
  steamTopSellerStatus: "Test",
  steamMostPlayedStatus: "Test",
  steamTopSellerRegion: "DE",
  steamTopSellerFetchedAt: "",
  steamTopSellerSource: "Steam",
  steamApiKeyPresent: false,
  summary: {
    rssCandidates: 2,
    steamReleaseCandidates: 0,
    steamTopSellerCandidates: 0,
    steamMostPlayedCandidates: 0,
    possibleFreePromotions: 0,
    confirmedFreePromotions: 0,
    imageCandidates: 0,
    rssCandidatesWithSteamAppId: 1,
    officialSteamImageCandidates: 0,
    fallbackOnlyCandidates: 2,
    sourceErrors: 0
  },
  safeguards: {
    automaticPublishing: false,
    automaticMainMerge: false,
    automaticImageApproval: false,
    paidAiEnabled: false
  }
};

try {
const root = await createTestRoot("spielsignal-batch-");
await mkdir(join(root, "src", "data", "editorial"), { recursive: true });
await writeFile(
  join(root, "src", "data", "editorial", "latest-queue.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);

const longBody = `## Was ist passiert?

Strategy Test erhält laut den bereitgestellten offiziellen Angaben ein neues Update für die PC-Version auf Steam. Der Entwurf beschränkt sich auf die dokumentierten Eckdaten und lässt nicht belegte Details bewusst offen.

## Die wichtigsten Fakten

Die Steam-App-ID lautet 123456. Das Thema betrifft ein Strategiespiel für PC. Weitere Änderungen müssen vor Veröffentlichung direkt mit den offiziellen Patchnotes abgeglichen werden. Der Themenhinweis aus dem RSS-Feed ist nicht die Faktenbasis.

## Warum ist das für PC-Spieler interessant?

Updates können Bedienung, Stabilität oder Inhalte verändern. Welche konkreten Punkte hier betroffen sind, bleibt ohne zusätzliche bestätigte Fakten offen. PC-Spieler sollten deshalb die offiziellen Hinweise prüfen und keine weitergehenden Versprechen aus diesem Entwurf ableiten.

## Was ist offiziell bestätigt?

Bestätigt sind nur der Spielbezug, die Steam-App-ID und die Zuordnung zur offiziellen Steam-Seite. Der Artikel behauptet weder eine bestimmte Versionsnummer noch ein Veröffentlichungsdatum, eine Wertung oder eine gemessene Reichweite.

## Was bleibt offen?

Umfang, Dateigröße, genaue Patch-Inhalte und mögliche technische Auswirkungen sind noch offen. Diese Angaben dürfen erst ergänzt werden, wenn sie in offiziellen Patchnotes oder einer Entwickler-Mitteilung belegt sind.

## Unsere Einordnung

Das Thema besitzt einen klaren Nutzen, sobald konkrete Änderungen offiziell dokumentiert sind. Bis dahin bleibt der Text zurückhaltend und trennt den Themenhinweis von belegbaren Fakten.`;

const aiFetch: typeof fetch = async (_input, init) => {
  const request = JSON.parse(String(init?.body)) as {
    model: string;
    text: { format: { type: string; strict: boolean } };
  };
  assert.equal(request.model, "gpt-5-mini");
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  return new Response(JSON.stringify({
    output_text: JSON.stringify({
      drafts: [{
        candidateId: interestingCandidate.id,
        title: "Strategy Test: Neues Steam-Update für PC angekündigt",
        summary: "Für Strategy Test steht ein neues Steam-Update im Fokus. Bestätigte Details werden vor Veröffentlichung mit den offiziellen Patchnotes abgeglichen.",
        seoTitle: "Strategy Test: Neues Steam-Update für PC | SpielSignal",
        seoDescription: "Strategy Test erhält ein neues Steam-Update. SpielSignal fasst bestätigte PC-Angaben zusammen und markiert offene Patch-Details transparent.",
        markdownBody: `${longBody}\n\nSteam\u2011News, Patch\u2010Details, Release\u2012Zeit, RSS\u2013Themenhinweise und Update\u2014Plan werden normalisiert.`,
        recommendedImages: [{
          position: "hero",
          searchTarget: "Strategy Test offizielles Key Art",
          preferredSourceType: "steam-store",
          required: true
        }],
        warnings: ["Patch-Inhalte vor Veröffentlichung ergänzen."]
      }]
    })
  }), { status: 200, headers: { "content-type": "application/json" } });
};

assert.equal(
  classifyEditorialAiError(429, { error: { code: "insufficient_quota" } }),
  "insufficient_quota"
);
assert.equal(
  classifyEditorialAiError(429, { error: { code: "rate_limit_exceeded" } }),
  "rate_limit_exceeded"
);

const aiInput = [{
  candidate: interestingCandidate,
  articleType: "news-overview",
  primarySources: ["https://store.steampowered.com/app/123456/Strategy_Test/"],
  verifiedFacts: [{
    statement: "Die offizielle Steam-App-ID lautet 123456.",
    sourceUrl: "https://store.steampowered.com/app/123456/Strategy_Test/",
    sourceType: "steam-store",
    confidence: 0.96
  }]
}];
let rateLimitAttempts = 0;
const backoffDelays: number[] = [];
const safeLogs: string[] = [];
const rateLimitThenSuccess: typeof fetch = async () => {
  rateLimitAttempts += 1;
  if (rateLimitAttempts < 3) {
    return new Response(JSON.stringify({
      error: { code: "rate_limit_exceeded", message: "Temporary request rate limit" }
    }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "0.01" }
    });
  }
  return aiFetch("", { body: JSON.stringify({
    model: "gpt-5-mini",
    text: { format: { type: "json_schema", strict: true } }
  }) });
};
const rateLimitResult = await prepareEditorialAiDrafts(
  aiInput,
  {
    AI_EDITORIAL_ENABLED: "true",
    AI_EDITORIAL_MODEL: "gpt-5-mini",
    AI_EDITORIAL_MAX_ARTICLES: "1",
    AI_EDITORIAL_MAX_RETRIES: "3",
    OPENAI_API_KEY: "secret-test-key"
  },
  rateLimitThenSuccess,
  {
    sleep: async (milliseconds) => { backoffDelays.push(milliseconds); },
    log: (message) => { safeLogs.push(message); }
  }
);
assert.equal(rateLimitAttempts, 3);
assert.deepEqual(backoffDelays, [10, 10]);
assert.equal(rateLimitResult.attempts, 3);
assert.equal(rateLimitResult.drafts.length, 1);
assert.match(safeLogs.join("\n"), /HTTP 429.*code=rate_limit_exceeded.*attempt=1/);
assert.doesNotMatch(safeLogs.join("\n"), /secret-test-key|authorization|Verbindliche Regeln/);

let quotaAttempts = 0;
const quotaLogs: string[] = [];
const quotaResult = await prepareEditorialAiDrafts(
  aiInput,
  {
    AI_EDITORIAL_ENABLED: "true",
    AI_EDITORIAL_MAX_RETRIES: "3",
    AI_EDITORIAL_FAIL_WITHOUT_QUOTA: "true",
    OPENAI_API_KEY: "secret-quota-key"
  },
  async () => {
    quotaAttempts += 1;
    return new Response(JSON.stringify({
      error: { code: "insufficient_quota", message: "No credits remain" }
    }), { status: 429, headers: { "content-type": "application/json" } });
  },
  { sleep: async () => { throw new Error("Quota darf kein Backoff auslösen."); }, log: (message) => quotaLogs.push(message) }
);
assert.equal(quotaAttempts, 1);
assert.equal(quotaResult.errorCode, "insufficient_quota");
assert.match(quotaResult.reason, /kein API-Guthaben/);
assert.doesNotMatch(quotaLogs.join("\n"), /secret-quota-key|No credits remain/);

const sourceRequests: string[] = [];
const officialSourceFetch: typeof fetch = async (input) => {
  const url = String(input);
  sourceRequests.push(url);
  if (url.includes("/api/storesearch/")) {
    return Response.json({
      items: [{ id: 1962700, name: "Subnautica 2" }]
    });
  }
  if (url.includes("/api/appdetails")) {
    return Response.json({
      "1962700": {
        success: true,
        data: {
          name: "Subnautica 2",
          website: "https://unknownworlds.com/subnautica-2/",
          developers: ["Unknown Worlds Entertainment"],
          publishers: ["Krafton"]
        }
      }
    });
  }
  if (url.includes("ISteamNews/GetNewsForApp")) {
    return Response.json({
      appnews: {
        newsitems: [{
          title: "Subnautica 2 Update 1.1",
          url: "https://store.steampowered.com/news/app/1962700/view/123456",
          contents: "Dieser vollständige Fremdtext darf nicht an die KI gelangen."
        }]
      }
    });
  }
  if (url === "https://unknownworlds.com/subnautica-2/") {
    return new Response(`
      <a href="/news/update-1-1">Patchnotes</a>
      <a href="https://www.youtube.com/watch?v=official-trailer">Trailer</a>
      <a href="https://www.xbox.com/en-US/games/store/subnautica-2/example">Xbox</a>
      <a href="/forums/community">Forum</a>
    `, { status: 200, headers: { "content-type": "text/html" } });
  }
  return new Response("", { status: 404 });
};

const subnauticaSources = await findOfficialPrimarySources({
  candidateId: "rss-0384d324f7939a2b",
  title: "Subnautica 2 Update 1.1",
  sourceUrl: "https://www.gamestar.de/artikel/subnautica-2-update,123.html"
}, { fetchImpl: officialSourceFetch });
assert.equal(subnauticaSources.steamAppId, "1962700");
assert.ok(subnauticaSources.sources.some((source) =>
  source.sourceType === "steam-store" && source.verified
));
assert.ok(subnauticaSources.sources.some((source) =>
  source.sourceType === "steam-news-hub" && source.verified
));
assert.ok(subnauticaSources.sources.some((source) =>
  source.sourceType === "official-developer-site" &&
  source.url === "https://unknownworlds.com/subnautica-2/"
));
assert.ok(subnauticaSources.sources.some((source) => source.sourceType === "official-patchnotes"));
assert.ok(subnauticaSources.sources.some((source) => source.sourceType === "official-trailer"));
assert.ok(subnauticaSources.sources.some((source) => source.sourceType === "official-xbox-page"));
assert.doesNotMatch(subnauticaSources.sources.map((source) => source.url).join(" "), /\/forums\//);
assert.ok(subnauticaSources.verifiedFacts.some((fact) =>
  fact.statement.includes("Subnautica 2 Update 1.1")
));
assert.equal(
  subnauticaSources.imageCandidateUrl,
  "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1962700/header.jpg"
);
assert.doesNotMatch(subnauticaSources.sources.map((source) => source.url).join(" "), /gamestar|steamdb|google/i);
assert.doesNotMatch(sourceRequests.join(" "), /steamdb|google/i);

const blockedOfficialSite = await findOfficialPrimarySources({
  candidateId: "blocked-magazine",
  title: "Blocked Game Update",
  gameTitle: "Blocked Game",
  steamAppId: "999999"
}, {
  fetchImpl: async (input) => {
    const url = String(input);
    if (url.includes("/api/appdetails")) {
      return Response.json({
        "999999": {
          success: true,
          data: { name: "Blocked Game", website: "https://www.pcgames.de/blocked-game/" }
        }
      });
    }
    if (url.includes("ISteamNews/GetNewsForApp")) return Response.json({ appnews: { newsitems: [] } });
    return new Response("", { status: 404 });
  }
});
assert.doesNotMatch(blockedOfficialSite.sources.map((source) => source.url).join(" "), /pcgames\.de/);

const batch = await createEditorialBatch({
  rootDirectory: root,
  candidateIds: [interestingCandidate.id, boringCandidate.id],
  selectionMode: "manual",
  articleTypeDefault: "news-overview",
  primarySourceGroups: [["https://store.steampowered.com/app/123456/Strategy_Test/"], []],
  editorialNote: "Nur bestätigte Fakten verwenden.",
  maxArticles: 5,
  generatedAt: "2026-06-08T10:00:00.000Z",
  environment: {
    GITHUB_RUN_ID: "987654",
    AI_EDITORIAL_ENABLED: "true",
    AI_EDITORIAL_MODEL: "gpt-5-mini",
    AI_EDITORIAL_MAX_ARTICLES: "5",
    OPENAI_API_KEY: "test-only-key"
  },
  fetchImpl: aiFetch
});

assert.equal(batch.branchName, "editorial-batch/987654");
assert.equal(batch.checkedCandidates, 2);
assert.equal(batch.generatedDrafts, 1);
assert.equal(batch.completeDrafts, 1);
assert.equal(batch.rejectedCandidates, 1);
assert.equal(shouldCreatePullRequest(batch.completeDrafts), true);
assert.equal(batch.results[0].status, "draft");
assert.equal(batch.results[1].status, "rejected");
assert.equal(batch.results[1].aiInvoked, false);
assert.equal(batch.results[1].filePath, undefined);
assert.ok(batch.results[0].readerInterest.score >= 60);
assert.ok(batch.results[1].readerInterest.score < 60);
assert.equal(Object.values(batch.results[0].reviews).every((review) => review.passed), true);
assert.match(await readFile(batch.reportPath, "utf8"), /SpielSignal Editorial Batch/);
assert.match(await readFile(batch.rejectedReportPath!, "utf8"), /rss-boring/);
const draft = await readFile(batch.results[0].filePath!, "utf8");
const draftContentBlocks = contentBlocksFrom(draft);
assert.match(draft, /status: "draft"/);
assert.doesNotMatch(draft, /^# /m);
assert.equal((draft.match(/^## Quellen$/gm) ?? []).length, 1);
assert.doesNotMatch(draft, /src\/data\/editorial|\bUTC\b|\d{2}:\d{2}:\d{2}Z/);
assert.equal(hasAdSlot(draftContentBlocks, "article-inline-1"), true);
assert.equal(draftContentBlocks.some((block) => block.type === "paragraph"), true);
assert.equal(draftContentBlocks.some((block) => block.type === "heading"), true);
assert.doesNotMatch(draft, /[\u2010-\u2014]/);
assert.match(draft, /Steam-News, Patch-Details, Release-Zeit, RSS-Themenhinweise und Update-Plan/);

const multipleDraftRoot = await createTestRoot("spielsignal-batch-multiple-drafts-");
await mkdir(join(multipleDraftRoot, "src", "data", "editorial"), { recursive: true });
const multipleDraftCandidates = Array.from({ length: 3 }, (_, index): EditorialCandidate => ({
  ...interestingCandidate,
  id: `multi-draft-${index + 1}`,
  title: `Batch Game ${index + 1} erhält ein neues PC-Update`,
  gameTitle: `Batch Game ${index + 1}`,
  steamAppId: `12345${index + 1}`,
  steamStoreUrl: `https://store.steampowered.com/app/12345${index + 1}/`
}));
await writeFile(
  join(multipleDraftRoot, DEFAULT_EDITORIAL_QUEUE_PATH),
  `${JSON.stringify({
    ...report,
    candidates: [...multipleDraftCandidates, boringCandidate]
  }, null, 2)}\n`,
  "utf8"
);
let multipleDraftAiCalls = 0;
const multipleDraftAiFetch: typeof fetch = async () => {
  multipleDraftAiCalls += 1;
  return Response.json({
    output_text: JSON.stringify({
      drafts: multipleDraftCandidates.map((candidate) => ({
        candidateId: candidate.id,
        title: `${candidate.gameTitle}: Das neue PC-Update im Überblick`,
        summary: `Das Update für ${candidate.gameTitle} wird anhand der offiziellen Steam-Quelle eingeordnet.`,
        seoTitle: `${candidate.gameTitle}: Neues PC-Update | SpielSignal`,
        seoDescription: `Alle bestätigten Angaben zum neuen PC-Update für ${candidate.gameTitle} im kompakten Überblick.`,
        markdownBody: longBody.replaceAll("Strategy Test", candidate.gameTitle ?? "Batch Game"),
        recommendedImages: [{
          position: "hero",
          searchTarget: `${candidate.gameTitle} offizielles Key Art`,
          preferredSourceType: "steam-store",
          required: true
        }],
        warnings: []
      }))
    })
  });
};
const multipleDraftBatch = await createEditorialBatch({
  rootDirectory: multipleDraftRoot,
  candidateIds: [...multipleDraftCandidates.map((candidate) => candidate.id), boringCandidate.id],
  selectionMode: "manual",
  articleTypeDefault: "news-overview",
  primarySourceGroups: [
    ...multipleDraftCandidates.map((candidate) => [candidate.steamStoreUrl!]),
    []
  ],
  generatedAt: "2026-06-08T10:30:00.000Z",
  environment: {
    GITHUB_RUN_ID: "three-complete-drafts",
    AI_EDITORIAL_ENABLED: "true",
    AI_EDITORIAL_MODEL: "gpt-5-mini",
    AI_EDITORIAL_MAX_ARTICLES: "3",
    OPENAI_API_KEY: "test-only-key"
  },
  fetchImpl: multipleDraftAiFetch
});
assert.equal(multipleDraftAiCalls, 2);
assert.equal(multipleDraftBatch.completeDrafts, 3);
assert.equal(multipleDraftBatch.generatedDrafts, 3);
assert.equal(multipleDraftBatch.rejectedCandidates, 1);
assert.equal(shouldCreatePullRequest(multipleDraftBatch.completeDrafts), true);
assert.equal(multipleDraftBatch.branchName, "editorial-batch/three-complete-drafts");
assert.deepEqual(
  multipleDraftBatch.results.filter((entry) => entry.status === "draft").map((entry) => entry.candidateId),
  multipleDraftCandidates.map((candidate) => candidate.id)
);
assert.equal(
  multipleDraftBatch.results.filter((entry) => entry.status === "rejected").every((entry) => !entry.filePath),
  true
);
const multipleDraftReport = await readFile(multipleDraftBatch.reportPath, "utf8");
for (const candidate of multipleDraftCandidates) {
  assert.match(multipleDraftReport, new RegExp(candidate.id));
  await readFile(multipleDraftBatch.results.find((entry) => entry.candidateId === candidate.id)!.filePath!, "utf8");
}
assert.match(await readFile(multipleDraftBatch.rejectedReportPath!, "utf8"), /rss-boring/);
await cleanupTestRoot(multipleDraftRoot);

const rejectedOnlyRoot = await createTestRoot("spielsignal-batch-rejected-only-");
await mkdir(join(rejectedOnlyRoot, "src", "data", "editorial"), { recursive: true });
await writeFile(
  join(rejectedOnlyRoot, DEFAULT_EDITORIAL_QUEUE_PATH),
  `${JSON.stringify({ ...report, candidates: [boringCandidate] }, null, 2)}\n`,
  "utf8"
);
let rejectedOnlyAiCalls = 0;
const rejectedOnlyBatch = await createEditorialBatch({
  rootDirectory: rejectedOnlyRoot,
  candidateIds: [boringCandidate.id],
  selectionMode: "manual",
  articleTypeDefault: "news-overview",
  generatedAt: "2026-06-08T10:45:00.000Z",
  environment: {
    GITHUB_RUN_ID: "rejected-only",
    AI_EDITORIAL_ENABLED: "true",
    OPENAI_API_KEY: "test-only-key"
  },
  fetchImpl: async () => {
    rejectedOnlyAiCalls += 1;
    throw new Error("KI darf für abgelehnte Kandidaten nicht aufgerufen werden.");
  }
});
assert.equal(rejectedOnlyAiCalls, 0);
assert.equal(rejectedOnlyBatch.completeDrafts, 0);
assert.equal(rejectedOnlyBatch.generatedDrafts, 0);
assert.equal(rejectedOnlyBatch.rejectedCandidates, 1);
assert.equal(rejectedOnlyBatch.results[0].status, "rejected");
assert.equal(rejectedOnlyBatch.results[0].filePath, undefined);
assert.equal(shouldCreatePullRequest(rejectedOnlyBatch.completeDrafts), false);
assert.match(await readFile(rejectedOnlyBatch.rejectedReportPath!, "utf8"), /rss-boring/);
await cleanupTestRoot(rejectedOnlyRoot);

const explicitQueueRoot = await createTestRoot("spielsignal-batch-explicit-queue-");
const explicitQueuePath = join(explicitQueueRoot, "fresh", "queue.json");
await mkdir(join(explicitQueueRoot, "fresh"), { recursive: true });
await writeFile(explicitQueuePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
const explicitQueueBatch = await createEditorialBatch({
  rootDirectory: explicitQueueRoot,
  queuePath: "fresh/queue.json",
  candidateIds: [interestingCandidate.id],
  selectionMode: "manual",
  articleTypeDefault: "news-overview",
  primarySourceGroups: [[]],
  generatedAt: "2026-06-08T10:00:00.000Z",
  environment: { GITHUB_RUN_ID: "explicit-queue", AI_EDITORIAL_ENABLED: "false" }
});
assert.equal(explicitQueueBatch.results[0].candidateId, interestingCandidate.id);
await cleanupTestRoot(explicitQueueRoot);

await assert.rejects(
  () => createEditorialBatch({
    rootDirectory: root,
    candidateIds: Array.from({ length: 6 }, (_, index) => `candidate-${index}`),
    articleTypeDefault: "news-overview"
  }),
  /Maximal 5 Candidate IDs/
);

await assert.rejects(
  () => loadEditorialQueue("missing/queue.json", root),
  /Queue-Datei nicht gefunden: missing\/queue\.json/
);
await cleanupTestRoot(root);

const invalidJsonRoot = await createTestRoot("spielsignal-batch-invalid-json-");
await mkdir(join(invalidJsonRoot, "src", "data", "editorial"), { recursive: true });
await writeFile(
  join(invalidJsonRoot, DEFAULT_EDITORIAL_QUEUE_PATH),
  "{not-json",
  "utf8"
);
await assert.rejects(
  () => loadEditorialQueue(DEFAULT_EDITORIAL_QUEUE_PATH, invalidJsonRoot),
  /Queue-Datei enthält kein valides JSON/
);
await writeFile(
  join(invalidJsonRoot, DEFAULT_EDITORIAL_QUEUE_PATH),
  JSON.stringify({ generatedAt: "2026-06-08T10:00:00.000Z", candidates: [] }),
  "utf8"
);
await assert.rejects(
  () => loadEditorialQueue(DEFAULT_EDITORIAL_QUEUE_PATH, invalidJsonRoot),
  /Queue-Datei enthält keine Kandidaten/
);
await writeFile(
  join(invalidJsonRoot, DEFAULT_EDITORIAL_QUEUE_PATH),
  JSON.stringify({ candidates: [interestingCandidate] }),
  "utf8"
);
await assert.rejects(
  () => loadEditorialQueue(DEFAULT_EDITORIAL_QUEUE_PATH, invalidJsonRoot),
  /Queue-Erzeugungszeitpunkt fehlt/
);
await cleanupTestRoot(invalidJsonRoot);

const manyCandidates = Array.from({ length: 25 }, (_, index) => ({
  ...interestingCandidate,
  id: `candidate-${String(index + 1).padStart(2, "0")}`,
  title: `Kandidat ${index + 1} mit einem bewusst langen Titel für die sichere gekürzte Queue-Ausgabe`
}));
const invalidIdRoot = await createTestRoot("spielsignal-batch-invalid-id-");
await mkdir(join(invalidIdRoot, "src", "data", "editorial"), { recursive: true });
await writeFile(
  join(invalidIdRoot, "src", "data", "editorial", "latest-queue.json"),
  `${JSON.stringify({ ...report, candidates: manyCandidates }, null, 2)}\n`,
  "utf8"
);
await assert.rejects(
  () => createEditorialBatch({
    rootDirectory: invalidIdRoot,
    candidateIds: ["rss-missing"],
    articleTypeDefault: "news-overview"
  }),
  (error: Error) => {
    assert.match(error.message, /Candidate ID nicht in der aktuell verwendeten Queue gefunden:\nrss-missing/);
    assert.match(error.message, /Verwendete Queue:\nsrc\/data\/editorial\/latest-queue\.json/);
    assert.match(error.message, /Queue erzeugt:\n2026-06-08T09:30:00\.000Z/);
    assert.match(error.message, /Verfügbare Candidate IDs:/);
    assert.match(error.message, /candidate-01/);
    assert.match(error.message, /candidate-20/);
    assert.doesNotMatch(error.message, /candidate-21/);
    assert.match(error.message, /5 weitere IDs/);
    assert.doesNotMatch(error.message, /OPENAI_API_KEY|STEAM_WEB_API_KEY|test-only-key/);
    return true;
  }
);
await cleanupTestRoot(invalidIdRoot);

const autoTopRoot = await createTestRoot("spielsignal-batch-auto-top-");
await mkdir(join(autoTopRoot, "src", "data", "editorial"), { recursive: true });
const autoCandidates = Array.from({ length: 6 }, (_, index) => ({
  ...interestingCandidate,
  id: `auto-${index + 1}`,
  score: 100 - index,
  scoreReasons: [
    "Aktuelle Meldung",
    "Klarer PC-Gaming-Bezug",
    `Konkreter Nutzen ${index + 1}`
  ]
}));
await writeFile(
  join(autoTopRoot, DEFAULT_EDITORIAL_QUEUE_PATH),
  `${JSON.stringify({ ...report, candidates: autoCandidates }, null, 2)}\n`,
  "utf8"
);
const autoTopBatch = await createEditorialBatch({
  rootDirectory: autoTopRoot,
  queuePath: DEFAULT_EDITORIAL_QUEUE_PATH,
  selectionMode: "auto-top",
  articleTypeDefault: "news-overview",
  maxArticles: 3,
  generatedAt: "2026-06-08T10:00:00.000Z",
  environment: { GITHUB_RUN_ID: "auto-top", AI_EDITORIAL_ENABLED: "false" }
});
assert.equal(autoTopBatch.checkedCandidates, 3);
assert.deepEqual(autoTopBatch.results.map((entry) => entry.candidateId), ["auto-1", "auto-2", "auto-3"]);

const hardenedSelectionRoot = await createTestRoot("spielsignal-batch-hardened-selection-");
await mkdir(join(hardenedSelectionRoot, "src", "data", "editorial"), { recursive: true });
await mkdir(join(hardenedSelectionRoot, "src", "content", "articles"), { recursive: true });
await writeFile(
  join(hardenedSelectionRoot, "src", "content", "articles", "gothic.md"),
  '---\nslug: "gothic-1-remake-news-overview"\nstatus: "published"\n---\n',
  "utf8"
);
const publishedGothic = {
  ...interestingCandidate,
  id: "steam-gothic",
  sourceType: "steam-top-seller" as const,
  title: "Gothic 1 Remake",
  gameTitle: "Gothic 1 Remake",
  scoreReasons: ["Steam-Topseller aus offizieller Quelle"]
};
const genericCounterStrike = {
  ...interestingCandidate,
  id: "steam-counter-strike",
  sourceType: "steam-top-seller" as const,
  title: "Counter-Strike 2",
  gameTitle: "Counter-Strike 2",
  scoreReasons: ["Steam-Topseller aus offizieller Quelle"]
};
const usefulRssUpdate = {
  ...interestingCandidate,
  id: "rss-subnautica-update",
  title: "Subnautica 2 Update 1.1 bringt neue PC-Verbesserungen",
  gameTitle: "Subnautica 2",
  steamAppId: "1962700",
  steamStoreUrl: "https://store.steampowered.com/app/1962700/Subnautica_2/",
  scoreReasons: ["Aktuelle Meldung", "Großes Update", "Klarer PC-Gaming-Bezug"]
};
await writeFile(
  join(hardenedSelectionRoot, DEFAULT_EDITORIAL_QUEUE_PATH),
  `${JSON.stringify({
    ...report,
    candidates: [publishedGothic, genericCounterStrike, usefulRssUpdate]
  }, null, 2)}\n`,
  "utf8"
);
const hardenedSelection = await createEditorialBatch({
  rootDirectory: hardenedSelectionRoot,
  selectionMode: "auto-top",
  articleTypeDefault: "news-overview",
  maxArticles: 3,
  generatedAt: "2026-06-08T10:00:00.000Z",
  environment: { GITHUB_RUN_ID: "hardened-selection", AI_EDITORIAL_ENABLED: "false" }
});
assert.deepEqual(hardenedSelection.results.map((entry) => entry.candidateId), ["rss-subnautica-update"]);
assert.match(
  hardenedSelection.results[0].primarySources.join(" "),
  /store\.steampowered\.com\/news\/app\/1962700/
);
assert.equal(hardenedSelection.results[0].status, "needs-source-review");
await cleanupTestRoot(hardenedSelectionRoot);

const subnauticaRoot = await createTestRoot("spielsignal-batch-subnautica-");
await mkdir(join(subnauticaRoot, "src", "data", "editorial"), { recursive: true });
const subnauticaCandidate: EditorialCandidate = {
  ...interestingCandidate,
  id: "rss-0384d324f7939a2b",
  title: "Subnautica 2 Update 1.1",
  gameTitle: undefined,
  steamAppId: undefined,
  steamStoreUrl: undefined,
  sourceName: "GameStar RSS",
  sourceUrl: "https://www.gamestar.de/artikel/subnautica-2-update,123.html",
  score: 89,
  scoreReasons: ["Aktuelles Update", "Klarer PC-Gaming-Bezug", "Konkreter Update-Nutzen"],
  imageStatus: "fallback",
  imageCandidateUrl: undefined,
  imageSourcePageUrl: undefined
};
await writeFile(
  join(subnauticaRoot, DEFAULT_EDITORIAL_QUEUE_PATH),
  `${JSON.stringify({ ...report, candidates: [subnauticaCandidate] }, null, 2)}\n`,
  "utf8"
);
let subnauticaAiCalls = 0;
const subnauticaAiFetch: typeof fetch = async (_input, init) => {
  subnauticaAiCalls += 1;
  const request = JSON.parse(String(init?.body)) as {
    input: Array<{ role: string; content: string }>;
  };
  const userPayload = request.input.find((entry) => entry.role === "user")?.content ?? "";
  assert.match(userPayload, /rss-0384d324f7939a2b/);
  assert.match(userPayload, /official-steam|steam-news-hub|Steam-App-ID/i);
  assert.doesNotMatch(userPayload, /Dieser vollständige Fremdtext|gamestar\.de\/artikel/);
  return Response.json({
    output_text: JSON.stringify({
      drafts: [{
        candidateId: "rss-0384d324f7939a2b",
        title: "Subnautica 2: Update 1.1 im offiziellen Steam-News-Hub",
        summary: "Die offizielle Steam-Meldung zu Update 1.1 bildet die Faktenbasis für den SpielSignal-Entwurf.",
        seoTitle: "Subnautica 2 Update 1.1: Offizielle Steam-Infos | SpielSignal",
        seoDescription: "Subnautica 2 Update 1.1 ist im offiziellen Steam-News-Hub dokumentiert. SpielSignal ordnet die bestätigte PC-Meldung ein.",
        markdownBody: longBody.replaceAll("Strategy Test", "Subnautica 2"),
        recommendedImages: [{
          position: "hero",
          searchTarget: "Subnautica 2 offizielles Steam-Key-Art",
          preferredSourceType: "steam-store",
          required: true
        }],
        warnings: []
      }]
    })
  });
};
const subnauticaBatch = await createEditorialBatch({
  rootDirectory: subnauticaRoot,
  candidateIds: ["rss-0384d324f7939a2b"],
  selectionMode: "manual",
  articleTypeDefault: "news-overview",
  generatedAt: "2026-06-08T11:00:00.000Z",
  sourceFetchImpl: officialSourceFetch,
  fetchImpl: subnauticaAiFetch,
  environment: {
    GITHUB_RUN_ID: "subnautica-source-enrichment",
    AI_EDITORIAL_ENABLED: "true",
    AI_EDITORIAL_MODEL: "gpt-5-mini",
    AI_EDITORIAL_MAX_ARTICLES: "1",
    OPENAI_API_KEY: "test-only-key"
  }
});
assert.equal(subnauticaAiCalls, 2);
assert.equal(subnauticaBatch.completeDrafts, 1);
assert.equal(subnauticaBatch.results[0].status, "draft");
assert.equal(subnauticaBatch.results[0].steamAppId, "1962700");
assert.equal(subnauticaBatch.results[0].sourceGatePassed, true);
assert.equal(subnauticaBatch.results[0].aiInvoked, true);
assert.ok(subnauticaBatch.results[0].readerInterest.score >= 75);
assert.ok(subnauticaBatch.results[0].verifiedPrimarySources >= 2);
assert.match(subnauticaBatch.results[0].heroImageStatus, /Steam-Bildkandidat/);
const subnauticaReport = await readFile(subnauticaBatch.reportPath, "utf8");
assert.match(subnauticaReport, /## Fertige Entwürfe/);
assert.match(subnauticaReport, /Verifizierte Primärquellen/);
assert.match(subnauticaReport, /Erwarteter Artikelpfad:\*\* \/artikel\/subnautica-2-news-overview\//);
assert.match(subnauticaReport, /Preview-Pfad:\*\* \/redaktion\/vorschau\/subnautica-2-news-overview\//);
assert.match(subnauticaReport, /Reader-Edit wurde nach der Fakten- und Writer-Stufe ausgeführt/);
const subnauticaDraft = await readFile(subnauticaBatch.results[0].filePath!, "utf8");
assert.match(subnauticaDraft, /externalTipSources: \["https:\/\/www\.gamestar\.de\/artikel\//);
assert.doesNotMatch(
  subnauticaDraft.match(/primarySources: \[[^\n]+\]/)?.[0] ?? "",
  /gamestar\.de/
);
assert.equal(shouldCreatePullRequest(subnauticaBatch.completeDrafts), true);
assert.match(subnauticaBatch.branchName, /^editorial-batch\/subnautica-source-enrichment$/);
await cleanupTestRoot(subnauticaRoot);

const sourceGateRoot = await createTestRoot("spielsignal-batch-source-gate-");
await mkdir(join(sourceGateRoot, "src", "data", "editorial"), { recursive: true });
const sourceLessCandidate: EditorialCandidate = {
  ...interestingCandidate,
  id: "rss-source-less",
  gameTitle: undefined,
  steamAppId: undefined,
  steamStoreUrl: undefined,
  title: "Neues PC-Game-Pass-Update startet heute",
  sourceUrl: "https://www.gamestar.de/artikel/ohne-offizielle-quelle,456.html"
};
await writeFile(
  join(sourceGateRoot, DEFAULT_EDITORIAL_QUEUE_PATH),
  `${JSON.stringify({ ...report, candidates: [sourceLessCandidate] }, null, 2)}\n`,
  "utf8"
);
let forbiddenAiCalls = 0;
const sourceGateBatch = await createEditorialBatch({
  rootDirectory: sourceGateRoot,
  candidateIds: [sourceLessCandidate.id],
  articleTypeDefault: "news-overview",
  sourceFetchImpl: async () => Response.json({ items: [] }),
  fetchImpl: async () => {
    forbiddenAiCalls += 1;
    throw new Error("KI darf ohne bestandenes Source-Gate nicht aufgerufen werden.");
  },
  environment: {
    GITHUB_RUN_ID: "source-gate",
    AI_EDITORIAL_ENABLED: "true",
    OPENAI_API_KEY: "test-only-key"
  }
});
assert.equal(forbiddenAiCalls, 0);
assert.equal(sourceGateBatch.results[0].sourceGatePassed, false);
assert.equal(sourceGateBatch.results[0].aiInvoked, false);
assert.equal(sourceGateBatch.results[0].status, "needs-source-review");
assert.equal(sourceGateBatch.completeDrafts, 0);
assert.equal(shouldCreatePullRequest(sourceGateBatch.completeDrafts), false);
assert.doesNotMatch(
  await readFile(sourceGateBatch.results[0].filePath!, "utf8"),
  /^status: "draft"$/m
);
await cleanupTestRoot(sourceGateRoot);

const summaryPath = join(autoTopRoot, "summary.md");
const outputPath = join(autoTopRoot, "output.txt");
const preparedAutoTop = await prepareBatchQueue({
  rootDirectory: autoTopRoot,
  queuePath: DEFAULT_EDITORIAL_QUEUE_PATH,
  selectionMode: "auto-top",
  maxArticles: 3,
  summaryPath,
  outputPath
});
assert.deepEqual(preparedAutoTop.selectedCandidateIds, ["auto-1", "auto-2", "auto-3"]);
assert.match(await readFile(summaryPath, "utf8"), /Automatisch ausgewählte Kandidaten/);
assert.match(await readFile(outputPath, "utf8"), /selectedCandidateIds=auto-1,auto-2,auto-3/);
const diagnostics = renderBatchQueueDiagnostics({
  report: {
    ...report,
    candidates: autoCandidates,
    sourceErrors: ["OPENAI_API_KEY=secret-value"]
  },
  queuePath: DEFAULT_EDITORIAL_QUEUE_PATH,
  selectedCandidateIds: preparedAutoTop.selectedCandidateIds
});
assert.match(diagnostics, /Queue-Pfad: src\/data\/editorial\/latest-queue\.json/);
assert.match(diagnostics, /Queue-Erzeugungszeit: 2026-06-08T09:30:00\.000Z/);
assert.doesNotMatch(diagnostics, /OPENAI_API_KEY|secret-value|sourceErrors/);

const queueSummary = renderBatchQueueSummary({
  ...report,
  candidates: manyCandidates.map((candidate, index) => index === 0
    ? { ...candidate, title: `${candidate.title} <script>secret-value-must-not-appear</script>` }
    : candidate),
  sourceErrors: ["secret-value-must-not-appear"]
});
assert.match(queueSummary, /# SpielSignal Batch-Auswahl/);
assert.match(queueSummary, /Anzahl Kandidaten:\*\* 25/);
assert.match(queueSummary, /candidate-01/);
assert.match(queueSummary, /candidate-20/);
assert.doesNotMatch(queueSummary, /candidate-21/);
assert.match(queueSummary, /5 Kandidaten sind/);
assert.doesNotMatch(queueSummary, /<script>|secret-value-must-not-appear|sourceUrl|OPENAI_API_KEY|STEAM_WEB_API_KEY/);
await cleanupTestRoot(autoTopRoot);

const noAiRoot = await createTestRoot("spielsignal-batch-no-ai-");
await mkdir(join(noAiRoot, "src", "data", "editorial"), { recursive: true });
await writeFile(
  join(noAiRoot, "src", "data", "editorial", "latest-queue.json"),
  `${JSON.stringify({ ...report, candidates: [interestingCandidate] }, null, 2)}\n`,
  "utf8"
);
const noAiBatch = await createEditorialBatch({
  rootDirectory: noAiRoot,
  candidateIds: [interestingCandidate.id],
  articleTypeDefault: "news-overview",
  primarySourceGroups: [[]],
  generatedAt: "2026-06-08T10:00:00.000Z",
  environment: { GITHUB_RUN_ID: "987655", AI_EDITORIAL_ENABLED: "false" }
});
assert.equal(noAiBatch.results[0].status, "needs-source-review");
assert.match(await readFile(noAiBatch.results[0].filePath!, "utf8"), /Kein fertiger Artikel/);
assert.match(
  await readFile(noAiBatch.reportPath, "utf8"),
  /Keine vollständigen Artikel erzeugt[\s\S]*ausschließlich der Diagnose/
);
assert.equal(noAiBatch.completeDrafts, 0);
assert.equal(shouldCreatePullRequest(noAiBatch.completeDrafts), false);
await cleanupTestRoot(noAiRoot);

const interestAccepted = runReaderInterestCheck(interestingCandidate);
const interestRejected = runReaderInterestCheck(boringCandidate);
const everrailInterest = runReaderInterestCheck({
  ...interestingCandidate,
  id: "everrail",
  title: "Everrail für PC",
  gameTitle: "Everrail",
  steamAppId: undefined,
  steamStoreUrl: undefined,
  scoreReasons: []
});
const solarpunkInterest = runReaderInterestCheck({
  ...interestingCandidate,
  id: "solarpunk",
  title: "Solarpunk",
  gameTitle: "Solarpunk",
  steamAppId: undefined,
  steamStoreUrl: undefined,
  scoreReasons: []
});
assert.ok(interestAccepted.score >= 60);
assert.ok(interestRejected.score < 60);
assert.equal(everrailInterest.score, 59);
assert.ok(solarpunkInterest.score < 60);
assert.doesNotMatch(JSON.stringify(interestAccepted), /Reichweite:\s*\d/i);

const reviewFixture: DraftReviewInput = {
  candidateId: "fixture",
  title: "Fixture für technische Prüfung",
  articleType: "news-overview",
  markdown: "---\ntitle: Fixture\n---\n\n## Inhalt\n\nText",
  readerText: "## Inhalt\n\nText",
  primarySources: [],
  externalTipSources: ["https://example.test/rss"],
  imageStatus: "fallback",
  heroImage: "/images/categories/news-default.svg",
  slug: "fixture",
  seoTitle: "Fixture für technische Prüfung | SpielSignal",
  seoDescription: "Diese ausreichend lange Meta-Beschreibung dient ausschließlich der technischen Testprüfung.",
  summary: "Diese ausreichend lange Zusammenfassung dient ausschließlich der technischen Testprüfung.",
  wordCount: 20,
  hasOfficialFallbackImage: true
};
assert.equal(runFactCheck(reviewFixture).passed, false);
assert.match(runFactCheck(reviewFixture).requiredFixes.join(" "), /RSS allein reicht nicht/);
assert.equal(runTechnicalCheck({ ...reviewFixture, markdown: `\uFEFF${reviewFixture.markdown}` }).passed, false);
assert.equal(runTechnicalCheck({ ...reviewFixture, readerText: "# Titel\n\n# Titel zwei" }).passed, false);

const workflow = await readFile(".github/workflows/create-editorial-batch.yml", "utf8");
const dailyWorkflow = await readFile(".github/workflows/daily-editorial-queue.yml", "utf8");
const reportWriter = await readFile("scripts/agents/reportWriter.ts", "utf8");
assert.doesNotThrow(() => parseYaml(workflow, { uniqueKeys: true }));
assert.match(workflow, /name: Create Editorial Batch/);
assert.match(workflow, /selection_mode:/);
assert.match(workflow, /- manual/);
assert.match(workflow, /- auto-top/);
assert.match(workflow, /candidate_ids:/);
assert.match(workflow, /editorial-batch\/\$\{\{ github\.run_id \}\}/);
assert.match(workflow, /git ls-remote --exit-code --heads origin/);
assert.doesNotMatch(workflow, /--force|\bgh\s+pr\s+merge\b|\bgit\s+merge\b/);
assert.ok(workflow.indexOf("Frische Tagesqueue erzeugen") < workflow.indexOf("Batch-Entwürfe erzeugen"));
assert.match(workflow, /Frische Tagesqueue erzeugen[\s\S]*npm run editorial:daily/);
assert.match(workflow, /rm -f "\$QUEUE_PATH"[\s\S]*npm run editorial:daily/);
assert.match(workflow, /STEAM_WEB_API_KEY: \$\{\{ secrets\.STEAM_WEB_API_KEY \}\}/);
assert.match(workflow, /STEAM_SCOUT_ENABLED: "true"/);
assert.match(workflow, /STEAM_RELEASES_ENABLED: "true"/);
assert.match(workflow, /STEAM_TOP_SELLERS_ENABLED: "true"/);
assert.match(workflow, /PUBLIC_STEAM_MOST_PLAYED_ENABLED: "false"/);
assert.ok(workflow.indexOf("Queue validieren und Batch-Auswahl vorbereiten") < workflow.indexOf("Batch-Entwürfe erzeugen"));
assert.match(workflow, /QUEUE_PATH: src\/data\/editorial\/latest-queue\.json/);
assert.match(workflow, /npm run editorial:batch-summary -- "\$SELECTION_MODE" "\$CANDIDATE_IDS" "\$MAX_ARTICLES" "\$QUEUE_PATH"/);
assert.match(workflow, /npm run editorial:create-batch -- "\$SELECTED_CANDIDATE_IDS"[\s\S]*"\$QUEUE_PATH" "manual"/);
assert.match(workflow, /steps\.queue\.outputs\.selectedCandidateIds/);
assert.match(dailyWorkflow, /src\/data\/editorial\/latest-queue\.json/);
assert.match(reportWriter, /join\(dataDirectory, "latest-queue\.json"\)/);
assert.match(workflow, /if: always\(\)/);
assert.match(workflow, /name: spielsignal-editorial-batch-diagnostics/);
assert.match(workflow, /src\/data\/editorial\/latest-queue\.json/);
assert.match(workflow, /docs\/editorial\/daily-reports\//);
assert.match(workflow, /docs\/editorial\/batch-reports\//);
assert.match(workflow, /src\/content\/drafts\//);
assert.match(workflow, /AI_EDITORIAL_MAX_ARTICLES: \$\{\{ vars\.AI_EDITORIAL_MAX_ARTICLES \|\| '3' \}\}/);
assert.match(workflow, /AI_EDITORIAL_MAX_RETRIES: \$\{\{ vars\.AI_EDITORIAL_MAX_RETRIES \|\| '3' \}\}/);
assert.match(workflow, /AI_EDITORIAL_FAIL_WITHOUT_QUOTA: \$\{\{ vars\.AI_EDITORIAL_FAIL_WITHOUT_QUOTA \|\| 'true' \}\}/);
assert.match(workflow, /Branch und Commit erstellen[\s\S]*if: steps\.batch\.outputs\.completeDrafts != '0'/);
assert.match(workflow, /Pull Request erstellen[\s\S]*if: steps\.batch\.outputs\.completeDrafts != '0'/);
assert.equal((workflow.match(/\bgh pr create\b/g) ?? []).length, 1);
assert.match(workflow, /Editorial Batch: \$REPORT_DATE · \$COMPLETE_DRAFTS vollständige Entwürfe/);
assert.match(workflow, /PR_URL=\$\(gh pr create/);
assert.match(workflow, /PR: \$PR_URL/);
assert.match(workflow, /Hero-Bildstatus: \$\{HERO_IMAGE_STATUSES/);
assert.match(workflow, /Manuelle Prüfpunkte: \$\{MANUAL_REVIEW_POINTS/);
assert.match(workflow, /grep -q '\^status: "draft"\$'/);
assert.match(workflow, /Keine vollständigen Artikel erzeugt\. KI-Verarbeitung fehlgeschlagen\./);
assert.match(workflow, /Artifact: nur für technische Diagnose erforderlich/);

const readerProvider = await readFile("scripts/agents/providers/editorialAiProvider.ts", "utf8");
assert.match(readerProvider, /Verified Facts[\s\S]*Writer Draft[\s\S]*Reader Edit|prepareReaderEditedDrafts/);
assert.match(readerProvider, /EDITORIAL_READER_EDIT_PROMPT/);
assert.match(readerProvider, /keinen Quellenabschnitt/);

const previewRoute = await readFile("src/pages/redaktion/vorschau/[slug].astro", "utf8");
assert.match(previewRoute, /process\.env\.VERCEL_ENV !== "preview"/);
assert.match(previewRoute, /robots="noindex, nofollow"/);
assert.match(previewRoute, /ENTWURF · NICHT VERÖFFENTLICHT/);
assert.doesNotMatch(previewRoute, /getCollection\("articles"/);

const subnauticaEditorialDraft = await readFile(
  "src/content/drafts/subnautica-2-news-overview.md",
  "utf8"
);
assert.ok(
  (subnauticaEditorialDraft.match(/^## Quellen$/gm) ?? []).length <= 1,
  "Ein vollständiger Entwurf darf höchstens einen Markdown-Quellenbereich enthalten."
);
assert.equal((subnauticaEditorialDraft.match(/^title:/gm) ?? []).length, 1);
assert.doesNotMatch(
  subnauticaEditorialDraft.split("---").at(-1) ?? "",
  /Steam-App-ID|in den verifizierten Fakten|bereitgestellte Quellen|Redaktioneller Hinweis|dieser Text basiert ausschließlich/i
);
assert.match(subnauticaEditorialDraft, /heroImageCandidateStatus: "pending-review"/);
assert.match(subnauticaEditorialDraft, /heroImage: "\/images\/categories\/survival\.svg"/);
const subnauticaContentBlocks = contentBlocksFrom(subnauticaEditorialDraft);
assert.equal(hasAdSlot(subnauticaContentBlocks, "article-inline-1"), true);
assert.equal(subnauticaContentBlocks.some((block) => block.type === "paragraph"), true);
assert.equal(subnauticaContentBlocks.some((block) => block.type === "heading"), true);
assert.doesNotMatch(subnauticaEditorialDraft, /[\u2010-\u2014]/);
assert.equal(temporaryRoots.size, 0);
assert.deepEqual(
  Object.fromEntries(relevantEnvironmentKeys.map((key) => [key, process.env[key]])),
  initialEnvironment
);

console.log(
  "Editorial-Batch-Tests erfolgreich: Mehrfachauswahl, Maximalgrenze, Reviews, Qualitätsgate, KI-Fallback und sicherer Workflow."
);
} finally {
  await Promise.all([...temporaryRoots].map((root) => cleanupTestRoot(root)));
}
