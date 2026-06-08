import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  createEditorialBatch,
  DEFAULT_EDITORIAL_QUEUE_PATH,
  loadEditorialQueue
} from "./agents/createEditorialBatch";
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

const explicitQueueRoot = await mkdtemp(join(tmpdir(), "spielsignal-batch-explicit-queue-"));
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
const invalidJsonRoot = await mkdtemp(join(tmpdir(), "spielsignal-batch-invalid-json-"));
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

const manyCandidates = Array.from({ length: 25 }, (_, index) => ({
  ...interestingCandidate,
  id: `candidate-${String(index + 1).padStart(2, "0")}`,
  title: `Kandidat ${index + 1} mit einem bewusst langen Titel für die sichere gekürzte Queue-Ausgabe`
}));
const invalidIdRoot = await mkdtemp(join(tmpdir(), "spielsignal-batch-invalid-id-"));
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

const autoTopRoot = await mkdtemp(join(tmpdir(), "spielsignal-batch-auto-top-"));
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

console.log(
  "Editorial-Batch-Tests erfolgreich: Mehrfachauswahl, Maximalgrenze, Reviews, Qualitätsgate, KI-Fallback und sicherer Workflow."
);
