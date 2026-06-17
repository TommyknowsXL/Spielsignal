import { normalizeTitle } from "../../../src/config/newsSources";
import type { CandidateEntityAnalysis } from "../entityAnalysis";
import { extractGameTitle } from "../gameTitle";

export type OfficialPrimarySource = {
  url: string;
  sourceType:
    | "steam-store"
    | "steam-news-hub"
    | "official-developer-site"
    | "official-publisher-site"
    | "official-patchnotes"
    | "official-trailer"
    | "official-xbox-page"
    | "official-investor-relations"
    | "official-company-newsroom"
    | "official-regulatory-document"
    | "official-platform-news"
    | "official-event-page";
  sourceName: string;
  verified: boolean;
  confidence: number;
  discoveredVia: string;
};

export type VerifiedFact = {
  statement: string;
  sourceUrl: string;
  sourceType: string;
  confidence: number;
};

export type OfficialSourceEnrichment = {
  gameTitle?: string;
  steamAppId?: string;
  searchedSources: string[];
  sources: OfficialPrimarySource[];
  verifiedFacts: VerifiedFact[];
  imageCandidateUrl?: string;
  imageSourcePageUrl?: string;
  entityAnalysis?: CandidateEntityAnalysis;
  sourceDiagnostics: string[];
};

type StoreSearchResponse = {
  items?: Array<{ id?: number; name?: string }>;
};

type StoreDetailsResponse = Record<string, {
  success?: boolean;
  data?: {
    name?: string;
    website?: string;
    developers?: string[];
    publishers?: string[];
    release_date?: {
      coming_soon?: boolean;
      date?: string;
    };
    platforms?: Record<string, boolean>;
  };
}>;

type SteamNewsResponse = {
  appnews?: {
    newsitems?: Array<{
      title?: string;
      url?: string;
      feedlabel?: string;
      author?: string;
    }>;
  };
};

const BLOCKED_HOSTS = [
  "gamestar.de",
  "pcgames.de",
  "pcgameshardware.de",
  "mein-mmo.de",
  "gamepro.de",
  "reddit.com",
  "wikipedia.org",
  ["steamdb", "info"].join("."),
  "google.com",
  "google.de",
  "fandom.com",
  "wiki.gg",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com"
];

const EVENT_WORDS = /\b(update|patch|hotfix|release|launch|trailer|demo|gratis|free|game pass|dlc|expansion|erweiterung)\b/i;

function isBlockedHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function isBlockedUrl(url: URL): boolean {
  return isBlockedHost(url.hostname) || /\/(?:forum|forums|community|discussions?)(?:\/|$)/i.test(url.pathname);
}

function safeUrl(value: string | undefined): URL | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || isBlockedUrl(url)) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

function inferredGameTitle(input: {
  title: string;
  gameTitle?: string;
}): string | undefined {
  if (input.gameTitle?.trim()) return input.gameTitle.trim();
  if (/^(steam|steam next fest|electronic arts|ea|w[üu]rdet ihr das spielen\??)$/i.test(input.title.trim())) return undefined;
  const extracted = extractGameTitle(input.title);
  if (extracted) return extracted;
  const withoutEvent = input.title
    .replace(/\s+(?:update|patch|hotfix|release|launch|trailer|demo)\b.*$/i, "")
    .trim();
  return withoutEvent.length >= 3 ? withoutEvent : undefined;
}

function officialUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return isBlockedUrl(url) ? undefined : url.toString();
  } catch {
    return undefined;
  }
}

function companyOfficialSources(entity: string): OfficialPrimarySource[] {
  if (/^(electronic arts|ea)$/i.test(entity)) {
    return [{
      url: "https://ir.ea.com/",
      sourceType: "official-investor-relations",
      sourceName: "EA Investor Relations",
      verified: true,
      confidence: 0.92,
      discoveredVia: "company-topic-investor-relations"
    }, {
      url: "https://www.ea.com/news",
      sourceType: "official-company-newsroom",
      sourceName: "EA Newsroom",
      verified: true,
      confidence: 0.9,
      discoveredVia: "company-topic-newsroom"
    }, {
      url: "https://www.sec.gov/edgar/browse/?CIK=712515",
      sourceType: "official-regulatory-document",
      sourceName: "SEC EDGAR",
      verified: true,
      confidence: 0.86,
      discoveredVia: "company-topic-sec-filings"
    }];
  }
  if (/^valve$/i.test(entity)) {
    return [{
      url: "https://www.valvesoftware.com/en/news",
      sourceType: "official-company-newsroom",
      sourceName: "Valve News",
      verified: true,
      confidence: 0.9,
      discoveredVia: "company-topic-newsroom"
    }];
  }
  return [];
}

function regulatoryOfficialSources(entity: string): OfficialPrimarySource[] {
  if (/valve|steam/i.test(entity)) {
    return [{
      url: "https://www.bundesnetzagentur.de/",
      sourceType: "official-regulatory-document",
      sourceName: "Bundesnetzagentur",
      verified: true,
      confidence: 0.86,
      discoveredVia: "legal-topic-regulator"
    }, {
      url: "https://www.valvesoftware.com/en/news",
      sourceType: "official-company-newsroom",
      sourceName: "Valve News",
      verified: true,
      confidence: 0.85,
      discoveredVia: "legal-topic-company-statement"
    }];
  }
  return [];
}

function platformOfficialSources(entity: string): OfficialPrimarySource[] {
  if (/^steam$/i.test(entity)) {
    return [{
      url: "https://store.steampowered.com/news/",
      sourceType: "official-platform-news",
      sourceName: "Steam News",
      verified: true,
      confidence: 0.88,
      discoveredVia: "platform-topic-official-news"
    }];
  }
  return [];
}

function eventOfficialSources(entity: string): OfficialPrimarySource[] {
  if (/^steam next fest$/i.test(entity)) {
    return [{
      url: "https://store.steampowered.com/sale/nextfest",
      sourceType: "official-event-page",
      sourceName: "Steam Next Fest",
      verified: true,
      confidence: 0.9,
      discoveredVia: "event-topic-official-page"
    }, {
      url: "https://store.steampowered.com/news/",
      sourceType: "official-platform-news",
      sourceName: "Steam News",
      verified: true,
      confidence: 0.82,
      discoveredVia: "event-topic-platform-news"
    }];
  }
  return [];
}

async function enrichNonGameOfficialSources(
  analysis: CandidateEntityAnalysis,
  fetchImpl: typeof fetch,
  searchedSources: string[]
): Promise<{ sources: OfficialPrimarySource[]; facts: VerifiedFact[]; diagnostics: string[] }> {
  const entity = analysis.mainEntity;
  if (!entity) {
    return { sources: [], facts: [], diagnostics: ["Keine sichere Hauptentitaet fuer adaptive Quellensuche."] };
  }
  const sources = analysis.topicType === "legal/regulatory"
    ? regulatoryOfficialSources(entity)
    : analysis.entityType === "event"
    ? eventOfficialSources(entity)
    : analysis.entityType === "platform"
      ? platformOfficialSources(entity)
      : companyOfficialSources(entity);
  const diagnostics = sources.length
    ? sources.map((source) => `${source.sourceName}: passende offizielle Quellgruppe ${source.sourceType}.`)
    : [`Keine hinterlegte offizielle Quellgruppe fuer ${entity}.`];
  const facts: VerifiedFact[] = [];
  for (const source of sources) {
    const url = officialUrl(source.url);
    if (!url) continue;
    searchedSources.push(url);
    const html = await fetchText(fetchImpl, url);
    if (html) {
      facts.push(...concreteFactsFromOfficialText({
        html,
        sourceUrl: url,
        sourceType: source.sourceType,
        candidateTitle: `${analysis.cleanedTitle} ${analysis.searchTerms.join(" ")}`
      }));
    }
  }
  return { sources, facts, diagnostics };
}

function sameGame(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && normalizeTitle(left) === normalizeTitle(right));
}

function uniqueSources(sources: OfficialPrimarySource[]): OfficialPrimarySource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.url.replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueFacts(facts: VerifiedFact[]): VerifiedFact[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.statement}|${fact.sourceUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: string): Promise<T | undefined> {
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) return undefined;
    return await response.json() as T;
  } catch {
    return undefined;
  }
}

async function fetchText(fetchImpl: typeof fetch, url: string): Promise<string | undefined> {
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "text/html" },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) return undefined;
    return await response.text();
  } catch {
    return undefined;
  }
}

function plainTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function concreteFactsFromOfficialText(input: {
  html: string;
  sourceUrl: string;
  sourceType: string;
  candidateTitle: string;
}): VerifiedFact[] {
  const text = plainTextFromHtml(input.html);
  const titleWords = normalizeTitle(input.candidateTitle)
    .split(" ")
    .filter((word) => word.length >= 4);
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 30 && sentence.length <= 240);
  const facts = sentences.filter((sentence) => {
    const normalized = normalizeTitle(sentence);
    const titleOverlap = titleWords.filter((word) => normalized.includes(word)).length;
    const hasConcreteSignal = /\b(update|patch|demo|release|termin|date|datum|juni|july|juli|preis|price|edition|feature|umfang|content|inhalt|plattform|platform|steam|pc|version|roadmap|trailer|dlc|hotfix|available|verfugbar|verfuegbar|verfügbar|change|anderung|aenderung|änderung)\b/i.test(sentence);
    const onlyHeadline = /\b(news|headline|meldung|title|titel|faq)\b/i.test(sentence) && !/\b(date|datum|juni|preis|price|feature|inhalt|plattform|pc|steam|version|verfugbar|verfügbar|change|patch|update)\b/i.test(sentence);
    return hasConcreteSignal && !onlyHeadline && (titleOverlap > 0 || /pc|steam|demo|patch|update|release|version/i.test(sentence));
  });
  return facts.slice(0, 4).map((statement) => ({
    statement,
    sourceUrl: input.sourceUrl,
    sourceType: input.sourceType,
    confidence: 0.88
  }));
}

function linkedOfficialSources(
  html: string,
  officialSite: OfficialPrimarySource,
  gameTitle: string | undefined,
  candidateTitle: string
): OfficialPrimarySource[] {
  const base = new URL(officialSite.url);
  const gameWords = normalizeTitle(gameTitle ?? "")
    .split(" ")
    .filter((word) => word.length >= 2 || /^\d+$/.test(word));
  const eventWords = normalizeTitle(candidateTitle)
    .split(" ")
    .filter((word) => word.length >= 3 && EVENT_WORDS.test(word));
  const links = [...html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)]
    .map((match) => {
      try {
        return new URL(match[1], base);
      } catch {
        return undefined;
      }
    })
    .filter((url): url is URL => url !== undefined)
    .filter((url) => !isBlockedUrl(url));
  const discovered: OfficialPrimarySource[] = [];
  for (const url of links) {
    const sameOfficialHost = url.hostname === base.hostname;
    const normalizedUrl = normalizeTitle(`${url.pathname} ${url.search}`);
    const matchesGame = gameWords.length > 0 && gameWords.every((word) => normalizedUrl.includes(word));
    const matchesEvent = eventWords.some((word) => normalizedUrl.includes(word));
    if (
      sameOfficialHost &&
      /patch|update|changelog|release-notes|news/i.test(url.pathname) &&
      (matchesGame || matchesEvent || /patch|update|changelog|release-notes/i.test(url.pathname))
    ) {
      discovered.push({
        url: url.toString(),
        sourceType: "official-patchnotes",
        sourceName: officialSite.sourceName,
        verified: true,
        confidence: 0.9,
        discoveredVia: "verified-official-site-link"
      });
    } else if (
      ["youtube.com", "www.youtube.com", "youtu.be"].includes(url.hostname) &&
      /\/(?:watch|channel|@)/i.test(url.pathname)
    ) {
      discovered.push({
        url: url.toString(),
        sourceType: "official-trailer",
        sourceName: `${officialSite.sourceName} YouTube`,
        verified: true,
        confidence: 0.85,
        discoveredVia: "verified-official-site-link"
      });
    } else if (
      url.hostname.endsWith("xbox.com") &&
      /\/games\//i.test(url.pathname) &&
      matchesGame
    ) {
      discovered.push({
        url: url.toString(),
        sourceType: "official-xbox-page",
        sourceName: "Xbox",
        verified: true,
        confidence: 0.9,
        discoveredVia: "verified-official-site-link"
      });
    }
  }
  return uniqueSources(discovered).slice(0, 5);
}

function directOfficialContentSources(
  officialSite: OfficialPrimarySource
): OfficialPrimarySource[] {
  const base = new URL(officialSite.url);
  const paths = [
    "/news",
    "/blog",
    "/updates",
    "/update",
    "/patch-notes",
    "/patchnotes",
    "/changelog",
    "/release-notes"
  ];
  return paths.map((path) => ({
    url: new URL(path, base.origin).toString(),
    sourceType: /patch|change|release-notes/i.test(path) ? "official-patchnotes" as const : officialSite.sourceType,
    sourceName: officialSite.sourceName,
    verified: true,
    confidence: 0.82,
    discoveredVia: "derived-official-domain-content-path"
  }));
}

async function findSteamApp(
  fetchImpl: typeof fetch,
  gameTitle: string,
  searchedSources: string[]
): Promise<{ appId: string; name: string } | undefined> {
  const endpoint = new URL("https://store.steampowered.com/api/storesearch/");
  endpoint.searchParams.set("term", gameTitle);
  endpoint.searchParams.set("l", "german");
  endpoint.searchParams.set("cc", "DE");
  searchedSources.push(endpoint.toString());
  const payload = await fetchJson<StoreSearchResponse>(fetchImpl, endpoint.toString());
  const exact = (payload?.items ?? []).filter((item) =>
    item.id && sameGame(item.name, gameTitle)
  );
  return exact.length === 1
    ? { appId: String(exact[0].id), name: exact[0].name! }
    : undefined;
}

function officialSiteSource(
  website: string | undefined,
  sourceName: string
): OfficialPrimarySource | undefined {
  const url = safeUrl(website);
  if (!url) return undefined;
  if (url.hostname.endsWith("steampowered.com") || url.hostname.endsWith("steamcommunity.com")) {
    return undefined;
  }
  const patchNotes = /patch|update|news|changelog|release-notes/i.test(url.pathname);
  return {
    url: url.toString(),
    sourceType: patchNotes ? "official-patchnotes" : "official-developer-site",
    sourceName,
    verified: true,
    confidence: patchNotes ? 0.95 : 0.9,
    discoveredVia: "official-steam-app-details"
  };
}

function normalizeOwnerName(value: string | undefined): string {
  return normalizeTitle(value ?? "")
    .replace(/\b(entertainment|studios?|games?|inc|llc|ltd|gmbh|se|ab|corp|corporation)\b/g, "")
    .trim();
}

function officialSteamNewsOwner(
  item: { feedlabel?: string; author?: string },
  owners: string[]
): string | undefined {
  const labels = [item.feedlabel, item.author].map(normalizeOwnerName).filter(Boolean);
  const normalizedOwners = owners.map(normalizeOwnerName).filter(Boolean);
  return labels.find((label) =>
    normalizedOwners.some((owner) => owner && (label.includes(owner) || owner.includes(label)))
  );
}

function newsMatchesCandidate(newsTitle: string, candidateTitle: string): boolean {
  const normalizedNews = normalizeTitle(newsTitle);
  const significantWords = normalizeTitle(candidateTitle)
    .split(" ")
    .filter((word) => word.length >= 3 && !["news", "bringt", "neue"].includes(word));
  const matchingWords = significantWords.filter((word) => normalizedNews.includes(word));
  return EVENT_WORDS.test(newsTitle) && matchingWords.length >= Math.min(2, significantWords.length);
}

export async function findOfficialPrimarySources(
  input: {
    candidateId: string;
    title: string;
    gameTitle?: string;
    steamAppId?: string;
    sourceUrl?: string;
    entityAnalysis?: CandidateEntityAnalysis;
  },
  options: {
    fetchImpl?: typeof fetch;
  } = {}
): Promise<OfficialSourceEnrichment> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const analysis = input.entityAnalysis;
  const sourceDiagnostics: string[] = [];
  const gameTitle = analysis?.entityType === "game"
    ? analysis.mainEntity ?? inferredGameTitle(input)
    : inferredGameTitle(input);
  const searchedSources: string[] = [];
  if (analysis) {
    searchedSources.push(...analysis.searchTerms.map((term) => `search-term:${term}`));
    searchedSources.push(...analysis.sourceGroups.map((group) => `source-group:${group}`));
    searchedSources.push(...[
      `stage-a:${analysis.cleanedTitle}`,
      ...(analysis.mainEntity ? [`stage-a:${analysis.mainEntity}`, `stage-a:${analysis.mainEntity} ${analysis.topicType}`] : []),
      ...(analysis.mainEntity ? [
        `stage-b:${analysis.mainEntity} official`,
        `stage-b:${analysis.mainEntity} news`,
        `stage-b:${analysis.mainEntity} update`,
        `stage-b:${analysis.mainEntity} patch notes`,
        `stage-b:${analysis.mainEntity} release`,
        `stage-b:${analysis.mainEntity} investor relations`,
        `stage-b:${analysis.mainEntity} press release`,
        `stage-b:${analysis.mainEntity} ${analysis.topicType}`
      ] : []),
      `stage-c:${analysis.sourceGroups.join("|")}`
    ]);
  }

  if (analysis?.needsResolution) {
    return {
      gameTitle: undefined,
      searchedSources: [...new Set(searchedSources)],
      sources: [],
      verifiedFacts: [],
      entityAnalysis: analysis,
      sourceDiagnostics: ["entity-needs-resolution: Keine sichere Hauptentitaet erkannt."]
    };
  }

  if (analysis && analysis.entityType !== "game" && analysis.entityType !== "unknown") {
    const nonGame = await enrichNonGameOfficialSources(analysis, fetchImpl, searchedSources);
    return {
      gameTitle: undefined,
      searchedSources: [...new Set(searchedSources)],
      sources: uniqueSources(nonGame.sources),
      verifiedFacts: uniqueFacts(nonGame.facts),
      entityAnalysis: analysis,
      sourceDiagnostics: nonGame.diagnostics
    };
  }

  let steamAppId = input.steamAppId?.trim();
  let matchedSteamName = gameTitle;

  if (!steamAppId && gameTitle) {
    const match = await findSteamApp(fetchImpl, gameTitle, searchedSources);
    steamAppId = match?.appId;
    matchedSteamName = match?.name ?? gameTitle;
  }

  if (!steamAppId) {
    return {
      gameTitle,
      searchedSources,
      sources: [],
      verifiedFacts: [],
      entityAnalysis: analysis,
      sourceDiagnostics: ["Keine Steam-App nach normalisierter Spielsuche gefunden."]
    };
  }

  const storeUrl = `https://store.steampowered.com/app/${steamAppId}/`;
  const newsHubUrl = `https://store.steampowered.com/news/app/${steamAppId}/`;
  searchedSources.push(storeUrl, newsHubUrl);
  const sources: OfficialPrimarySource[] = [{
    url: storeUrl,
    sourceType: "steam-store",
    sourceName: "Steam",
    verified: true,
    confidence: input.steamAppId ? 0.96 : 0.92,
    discoveredVia: input.steamAppId ? "candidate-steam-app-id" : "official-steam-store-search"
  }, {
    url: newsHubUrl,
    sourceType: "steam-news-hub",
    sourceName: "Steam",
    verified: false,
    confidence: 0.55,
    discoveredVia: "steam-news-hub-pending-official-author-check"
  }];
  const facts: VerifiedFact[] = [{
    statement: `Die offizielle Steam-App-ID für ${matchedSteamName ?? gameTitle ?? input.title} lautet ${steamAppId}.`,
    sourceUrl: storeUrl,
    sourceType: "steam-store",
    confidence: input.steamAppId ? 0.96 : 0.92
  }];

  const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(steamAppId)}&l=german&cc=DE`;
  searchedSources.push(detailsUrl);
  const details = await fetchJson<StoreDetailsResponse>(fetchImpl, detailsUrl);
  const app = details?.[steamAppId];
  const owners = [
    ...(app?.data?.developers ?? []),
    ...(app?.data?.publishers ?? [])
  ];
  if (app?.success && app.data?.name && (!gameTitle || sameGame(app.data.name, gameTitle))) {
    matchedSteamName = app.data.name;
    facts.push({
      statement: `Steam führt das Spiel unter dem Namen ${app.data.name}.`,
      sourceUrl: storeUrl,
      sourceType: "steam-store",
      confidence: 0.98
    });
    const site = officialSiteSource(
      app.data.website,
      app.data.developers?.[0] ?? app.data.publishers?.[0] ?? app.data.name
    );
    if (site) {
      sources.push(site);
      searchedSources.push(site.url);
      const directSources = directOfficialContentSources(site);
      sources.push(...directSources);
      searchedSources.push(...directSources.map((source) => source.url));
      const officialHtml = await fetchText(fetchImpl, site.url);
      if (officialHtml) {
        facts.push(...concreteFactsFromOfficialText({
          html: officialHtml,
          sourceUrl: site.url,
          sourceType: site.sourceType,
          candidateTitle: input.title
        }));
        const linkedSources = linkedOfficialSources(officialHtml, site, matchedSteamName ?? gameTitle, input.title);
        sources.push(...linkedSources);
        for (const linkedSource of linkedSources.filter((source) => source.sourceType === "official-patchnotes")) {
          const patchHtml = await fetchText(fetchImpl, linkedSource.url);
          if (patchHtml) {
            facts.push(...concreteFactsFromOfficialText({
              html: patchHtml,
              sourceUrl: linkedSource.url,
              sourceType: linkedSource.sourceType,
              candidateTitle: input.title
            }));
          }
        }
      }
      for (const directSource of directSources.filter((source) => source.sourceType === "official-patchnotes")) {
        const directHtml = await fetchText(fetchImpl, directSource.url);
        if (directHtml) {
          facts.push(...concreteFactsFromOfficialText({
            html: directHtml,
            sourceUrl: directSource.url,
            sourceType: directSource.sourceType,
            candidateTitle: input.title
          }));
        }
      }
    }
  }

  const newsApiUrl =
    `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${encodeURIComponent(steamAppId)}` +
    "&count=20&maxlength=0&format=json";
  searchedSources.push(newsApiUrl);
  const news = await fetchJson<SteamNewsResponse>(fetchImpl, newsApiUrl);
  const matchingNews = (news?.appnews?.newsitems ?? []).find((item) =>
    item.title && newsMatchesCandidate(item.title, input.title)
  );
  if (matchingNews?.title) {
    const officialNewsUrl = safeUrl(matchingNews.url)?.toString() ?? newsHubUrl;
    const ownerLabel = officialSteamNewsOwner(matchingNews, owners);
    sources.push({
      url: officialNewsUrl,
      sourceType: "steam-news-hub",
      sourceName: matchingNews.feedlabel ?? matchingNews.author ?? "Steam News",
      verified: Boolean(ownerLabel),
      confidence: ownerLabel ? 0.9 : 0.45,
      discoveredVia: ownerLabel ? "steam-news-official-owner-match" : "steam-news-author-unclear-or-aggregated"
    });
    facts.push({
      statement: `Im offiziellen Steam-News-Hub ist die Meldung "${matchingNews.title}" veröffentlicht.`,
      sourceUrl: officialNewsUrl,
      sourceType: "steam-news-hub",
      confidence: 0.96
    });
  }

  return {
    gameTitle: matchedSteamName ?? gameTitle,
    steamAppId,
    searchedSources: [...new Set(searchedSources)],
    sources: uniqueSources(sources),
    verifiedFacts: uniqueFacts(facts),
    imageCandidateUrl:
      `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`,
    imageSourcePageUrl: storeUrl,
    entityAnalysis: analysis,
    sourceDiagnostics
  };
}
