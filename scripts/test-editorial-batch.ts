import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { createEditorialBatch } from "./agents/createEditorialBatch";
import { runFactCheck } from "./agents/review/factCheck";
import { runReaderInterestCheck } from "./agents/review/readerInterestCheck";
import { runTechnicalCheck } from "./agents/review/technicalCheck";
import type { DraftReviewInput } from "./agents/review/types";
import type { EditorialCandidate, EditorialQueueReport } from "./agents/types";

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

const root = await mkdtemp(join(tmpdir(), "spielsignal-batch-"));
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
        markdownBody: longBody,
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

const batch = await createEditorialBatch({
  rootDirectory: root,
  candidateIds: [interestingCandidate.id, boringCandidate.id],
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
assert.equal(batch.results[0].status, "draft");
assert.equal(batch.results[1].status, "rejected");
assert.ok(batch.results[0].readerInterest.score >= 60);
assert.ok(batch.results[1].readerInterest.score < 60);
assert.equal(Object.values(batch.results[0].reviews).every((review) => review.passed), true);
assert.match(await readFile(batch.reportPath, "utf8"), /SpielSignal Editorial Batch/);
assert.match(await readFile(batch.rejectedReportPath!, "utf8"), /rss-boring/);
const draft = await readFile(batch.results[0].filePath!, "utf8");
assert.match(draft, /status: "draft"/);
assert.doesNotMatch(draft, /^# /m);
assert.equal((draft.match(/^## Quellen$/gm) ?? []).length, 1);
assert.doesNotMatch(draft, /src\/data\/editorial|\bUTC\b|\d{2}:\d{2}:\d{2}Z/);

await assert.rejects(
  () => createEditorialBatch({
    rootDirectory: root,
    candidateIds: Array.from({ length: 6 }, (_, index) => `candidate-${index}`),
    articleTypeDefault: "news-overview"
  }),
  /Maximal 5 Candidate IDs/
);

const noAiRoot = await mkdtemp(join(tmpdir(), "spielsignal-batch-no-ai-"));
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

const interestAccepted = runReaderInterestCheck(interestingCandidate);
const interestRejected = runReaderInterestCheck(boringCandidate);
assert.ok(interestAccepted.score >= 60);
assert.ok(interestRejected.score < 60);
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
assert.doesNotThrow(() => parseYaml(workflow, { uniqueKeys: true }));
assert.match(workflow, /name: Create Editorial Batch/);
assert.match(workflow, /candidate_ids:/);
assert.match(workflow, /editorial-batch\/\$\{\{ github\.run_id \}\}/);
assert.match(workflow, /git ls-remote --exit-code --heads origin/);
assert.doesNotMatch(workflow, /--force|\bgh\s+pr\s+merge\b|\bgit\s+merge\b/);
assert.match(workflow, /if: always\(\)/);
assert.match(workflow, /name: spielsignal-editorial-batch-report/);
assert.match(workflow, /docs\/editorial\/batch-reports\//);
assert.match(workflow, /src\/content\/drafts\//);

console.log(
  "Editorial-Batch-Tests erfolgreich: Mehrfachauswahl, Maximalgrenze, Reviews, Qualitätsgate, KI-Fallback und sicherer Workflow."
);
