import { normalizeTitle } from "../../../src/config/newsSources";

export type SecondarySourceTier = 2 | 3 | 4;

export type SecondarySourceFact = {
  normalizedFact: string;
  statement: string;
  sourceUrl: string;
  sourceName: string;
  sourceKind: "secondary";
  publishedAt?: string;
  confidence: "high" | "medium" | "low" | "unverified";
  corroborated: boolean;
  officiallyConfirmed: boolean;
  contradicted: boolean;
  evidenceNote: string;
  isRumor: boolean;
  isOpinion: boolean;
};

export type SecondaryArticleRead = {
  url: string;
  sourceName: string;
  language: "de" | "en";
  tier: SecondarySourceTier;
  established: boolean;
  fullTextRead: boolean;
  readError?: string;
  title?: string;
  author?: string;
  publishedAt?: string;
  textSample?: string;
  facts: SecondarySourceFact[];
  officialLinks: string[];
  originalSourceLinks: string[];
  agencyKey?: string;
};

export type SecondarySourceReview = {
  searchedGermanMedia: string[];
  searchedEnglishMedia: string[];
  articlesChecked: number;
  fullTextReadCount: number;
  readErrors: string[];
  articles: SecondaryArticleRead[];
  facts: SecondarySourceFact[];
  corroboratedFacts: SecondarySourceFact[];
  unconfirmedFacts: SecondarySourceFact[];
  contradictions: string[];
  followedOriginalSources: string[];
  independentEstablishedSources: number;
  fallbackEligible: boolean;
  fallbackReason: string;
};

type KnownGamingSite = {
  name: string;
  domains: string[];
  language: "de" | "en";
  tier: SecondarySourceTier;
};

export const KNOWN_GERMAN_GAMING_SITES: KnownGamingSite[] = [
  { name: "GameStar", domains: ["gamestar.de"], language: "de", tier: 2 },
  { name: "PC Games", domains: ["pcgames.de"], language: "de", tier: 2 },
  { name: "MeinMMO", domains: ["mein-mmo.de"], language: "de", tier: 2 },
  { name: "4Players", domains: ["4players.de"], language: "de", tier: 2 },
  { name: "GamesWirtschaft", domains: ["gameswirtschaft.de"], language: "de", tier: 2 },
  { name: "ComputerBase Gaming", domains: ["computerbase.de"], language: "de", tier: 2 },
  { name: "Golem Gaming", domains: ["golem.de"], language: "de", tier: 2 },
  { name: "Heise Gaming", domains: ["heise.de"], language: "de", tier: 2 },
  { name: "Eurogamer.de", domains: ["eurogamer.de"], language: "de", tier: 2 },
  { name: "IGN Deutschland", domains: ["de.ign.com"], language: "de", tier: 2 },
  { name: "Play3", domains: ["play3.de"], language: "de", tier: 2 },
  { name: "XboxDynasty", domains: ["xboxdynasty.de"], language: "de", tier: 2 },
  { name: "ntower", domains: ["ntower.de"], language: "de", tier: 2 }
];

export const KNOWN_ENGLISH_GAMING_SITES: KnownGamingSite[] = [
  { name: "PC Gamer", domains: ["pcgamer.com"], language: "en", tier: 2 },
  { name: "Eurogamer", domains: ["eurogamer.net"], language: "en", tier: 2 },
  { name: "IGN", domains: ["ign.com"], language: "en", tier: 2 },
  { name: "GameSpot", domains: ["gamespot.com"], language: "en", tier: 2 },
  { name: "GamesRadar+", domains: ["gamesradar.com"], language: "en", tier: 2 },
  { name: "Rock Paper Shotgun", domains: ["rockpapershotgun.com"], language: "en", tier: 2 },
  { name: "VGC", domains: ["videogameschronicle.com"], language: "en", tier: 2 },
  { name: "Gematsu", domains: ["gematsu.com"], language: "en", tier: 2 },
  { name: "Polygon", domains: ["polygon.com"], language: "en", tier: 2 },
  { name: "Kotaku", domains: ["kotaku.com"], language: "en", tier: 2 },
  { name: "The Verge Gaming", domains: ["theverge.com"], language: "en", tier: 2 },
  { name: "Ars Technica Gaming", domains: ["arstechnica.com"], language: "en", tier: 2 },
  { name: "Windows Central Gaming", domains: ["windowscentral.com"], language: "en", tier: 2 },
  { name: "Push Square", domains: ["pushsquare.com"], language: "en", tier: 2 },
  { name: "Nintendo Life", domains: ["nintendolife.com"], language: "en", tier: 2 },
  { name: "Pure Xbox", domains: ["purexbox.com"], language: "en", tier: 2 }
];

const ALL_KNOWN_SITES = [...KNOWN_GERMAN_GAMING_SITES, ...KNOWN_ENGLISH_GAMING_SITES];
const RUMOR_WORDS = /\b(geruecht|gerücht|rumor|rumour|angeblich|reportedly|laut insider|unconfirmed|nicht bestaetigt|nicht bestätigt)\b/i;
const OPINION_WORDS = /\b(meinung|kolumne|opinion|commentary|warum|ich finde|we think|hands-on|preview)\b/i;
const FACT_SIGNAL = /\b(update|patch|release|launch|demo|trailer|dlc|expansion|erweiterung|game pass|steam|pc|preis|price|date|datum|termin|juni|juli|july|version|available|verfuegbar|verfügbar|angekuendigt|angekündigt|confirmed|bestaetigt|bestätigt)\b/i;
const CONTRADICTION_SIGNAL = /\b(nicht|kein|keine|delayed|verschoben|cancelled|abgesagt|widerspricht|denies|dementiert)\b/i;

function siteForUrl(value: string): KnownGamingSite | undefined {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    return ALL_KNOWN_SITES.find((site) =>
      site.domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
    );
  } catch {
    return undefined;
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#039;/gi, "'")
    .replace(/&auml;/gi, "ae")
    .replace(/&ouml;/gi, "oe")
    .replace(/&uuml;/gi, "ue")
    .replace(/&Auml;/g, "Ae")
    .replace(/&Ouml;/g, "Oe")
    .replace(/&Uuml;/g, "Ue")
    .replace(/&szlig;/gi, "ss");
}

function textFromHtml(html: string): string {
  const main = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
    html.match(/<main[\s\S]*?<\/main>/i)?.[0] ??
    html;
  return decodeHtml(main)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<(?:figure|iframe|noscript|svg)[\s\S]*?<\/(?:figure|iframe|noscript|svg)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMeta(html: string, names: string[]): string | undefined {
  for (const name of names) {
    const property = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1];
    if (property) return decodeHtml(property).trim();
    const reversed = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, "i"))?.[1];
    if (reversed) return decodeHtml(reversed).trim();
  }
  return undefined;
}

function articleTitle(html: string): string | undefined {
  return firstMeta(html, ["og:title", "twitter:title"]) ??
    decodeHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ") ?? "").trim() ??
    undefined;
}

function articleLinks(html: string, baseUrl: string): string[] {
  return [...html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)]
    .flatMap((match) => {
      try {
        const url = new URL(match[1], baseUrl);
        return ["http:", "https:"].includes(url.protocol) ? [url.toString()] : [];
      } catch {
        return [];
      }
    });
}

function isLikelyOfficialUrl(value: string): boolean {
  const site = siteForUrl(value);
  if (site) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (/reddit|facebook|instagram|tiktok|twitter|x\.com|discord|forum|forums/.test(host + url.pathname)) return false;
    return /steam|playstation|xbox|nintendo|ea\.com|ubisoft|bethesda|capcom|bandainamco|sega|square-enix|cdprojektred|news|press|blog|patch|update|support/i.test(host + url.pathname);
  } catch {
    return false;
  }
}

function normalizeFact(sentence: string): string {
  return normalizeTitle(sentence)
    .replace(/\b(the|a|an|der|die|das|ein|eine|und|and|mit|with|fuer|für|auf|on|im|in|am|at|ist|is|are|wird|will|has|hat|haben)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function factTopicKey(sentence: string): string {
  const normalized = normalizeFact(sentence);
  const signals = normalized.match(/\b(update|patch|release|launch|demo|trailer|dlc|game pass|steam|pc|preis|price|date|datum|termin|version|available|verfuegbar|angekuendigt|confirmed)\b/g);
  const names = normalized.split(" ").filter((word) => word.length >= 5).slice(0, 6);
  return [...(signals ?? []), ...names].slice(0, 8).join(" ");
}

function extractFacts(input: {
  text: string;
  sourceUrl: string;
  sourceName: string;
  publishedAt?: string;
}): SecondarySourceFact[] {
  const seen = new Set<string>();
  return input.text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 35 && sentence.length <= 260)
    .filter((sentence) => FACT_SIGNAL.test(sentence))
    .filter((sentence) => {
      const key = normalizeFact(sentence);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8)
    .map((statement) => {
      const isRumor = RUMOR_WORDS.test(statement);
      const isOpinion = OPINION_WORDS.test(statement);
      return {
        normalizedFact: factTopicKey(statement),
        statement,
        sourceUrl: input.sourceUrl,
        sourceName: input.sourceName,
        sourceKind: "secondary" as const,
        publishedAt: input.publishedAt,
        confidence: isOpinion ? "low" as const : isRumor ? "unverified" as const : "medium" as const,
        corroborated: false,
        officiallyConfirmed: false,
        contradicted: CONTRADICTION_SIGNAL.test(statement),
        evidenceNote: isOpinion
          ? "Als Meinung/Einordnung erkannt, nicht als bestaetigter Fakt gewertet."
          : isRumor
            ? "Als Geruecht oder unbestaetigte Meldung erkannt."
            : "Konkrete Tatsachenaussage aus gelesenem Fachartikel extrahiert.",
        isRumor,
        isOpinion
      };
    });
}

async function fetchArticle(fetchImpl: typeof fetch, url: string): Promise<{ html?: string; error?: string }> {
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(15_000)
    });
    if (response.status === 401 || response.status === 403) return { error: `Zugriff blockiert (${response.status}).` };
    if (!response.ok) return { error: `HTTP ${response.status}.` };
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/html|xml|text/i.test(contentType)) return { error: `Kein HTML-Inhalt (${contentType}).` };
    return { html: await response.text() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Technischer Lesefehler." };
  }
}

export function supportedGamingMedia(): { german: string[]; english: string[] } {
  return {
    german: KNOWN_GERMAN_GAMING_SITES.map((site) => site.name),
    english: KNOWN_ENGLISH_GAMING_SITES.map((site) => site.name)
  };
}

export async function reviewSecondarySources(
  input: {
    candidateTitle: string;
    sourceUrls: string[];
  },
  options: { fetchImpl?: typeof fetch } = {}
): Promise<SecondarySourceReview> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const urls = [...new Set(input.sourceUrls)].filter((url) => siteForUrl(url)?.tier === 2);
  const articles: SecondaryArticleRead[] = [];
  for (const url of urls.slice(0, 8)) {
    const site = siteForUrl(url)!;
    const fetched = await fetchArticle(fetchImpl, url);
    if (!fetched.html) {
      articles.push({
        url,
        sourceName: site.name,
        language: site.language,
        tier: site.tier,
        established: site.tier === 2,
        fullTextRead: false,
        readError: fetched.error ?? "Artikeltext nicht erreichbar.",
        facts: [],
        officialLinks: [],
        originalSourceLinks: []
      });
      continue;
    }
    const text = textFromHtml(fetched.html);
    const title = articleTitle(fetched.html);
    const publishedAt = firstMeta(fetched.html, ["article:published_time", "date", "pubdate", "parsely-pub-date"]);
    const author = firstMeta(fetched.html, ["author", "article:author"]);
    const links = articleLinks(fetched.html, url);
    const officialLinks = [...new Set(links.filter(isLikelyOfficialUrl))].slice(0, 10);
    const agencyKey = firstMeta(fetched.html, ["copyright", "parsely-section"]) ??
      text.match(/\b(?:dpa|Reuters|AP|press release|Pressemitteilung)\b/i)?.[0];
    const facts = extractFacts({
      text,
      sourceUrl: url,
      sourceName: site.name,
      publishedAt
    }).filter((fact) => !fact.isOpinion);
    articles.push({
      url,
      sourceName: site.name,
      language: site.language,
      tier: site.tier,
      established: site.tier === 2,
      fullTextRead: text.length >= 500,
      readError: text.length < 500 ? "Volltext zu kurz oder nach Bereinigung nicht belastbar." : undefined,
      title,
      author,
      publishedAt,
      textSample: text.slice(0, 500),
      facts,
      officialLinks,
      originalSourceLinks: officialLinks,
      agencyKey
    });
  }

  const allFacts = articles.flatMap((article) => article.facts);
  const factSources = new Map<string, Set<string>>();
  for (const fact of allFacts) {
    const set = factSources.get(fact.normalizedFact) ?? new Set<string>();
    set.add(fact.sourceName);
    factSources.set(fact.normalizedFact, set);
  }
  const facts = allFacts.map((fact) => ({
    ...fact,
    corroborated: (factSources.get(fact.normalizedFact)?.size ?? 0) >= 2,
    contradicted: fact.contradicted || allFacts.some((other) =>
      other.normalizedFact === fact.normalizedFact &&
      other.sourceName !== fact.sourceName &&
      other.contradicted !== fact.contradicted
    )
  }));
  const corroboratedFacts = facts.filter((fact) => fact.corroborated && !fact.isRumor && !fact.contradicted);
  const independentKeys = new Set(articles
    .filter((article) => article.established && article.fullTextRead && article.facts.some((fact) =>
      facts.find((candidateFact) =>
        candidateFact.sourceUrl === fact.sourceUrl &&
        candidateFact.normalizedFact === fact.normalizedFact &&
        candidateFact.corroborated &&
        !candidateFact.isRumor &&
        !candidateFact.contradicted
      )
    ))
    .map((article) => article.agencyKey ? `agency:${article.agencyKey}` : article.sourceName));
  const agencyGroups = new Map<string, number>();
  for (const article of articles) {
    if (article.agencyKey) agencyGroups.set(article.agencyKey, (agencyGroups.get(article.agencyKey) ?? 0) + 1);
  }
  const sharedAgencyOnly = articles.filter((article) => article.fullTextRead).length >= 2 &&
    [...agencyGroups.values()].some((count) => count >= 2) &&
    new Set(articles.filter((article) => article.fullTextRead).map((article) => article.agencyKey ?? article.sourceName)).size === 1;
  const contradictions = facts
    .filter((fact) => fact.contradicted)
    .map((fact) => `${fact.sourceName}: ${fact.statement}`);
  const fallbackEligible = independentKeys.size >= 2 && corroboratedFacts.length >= 1 && contradictions.length === 0 && !sharedAgencyOnly;
  return {
    searchedGermanMedia: KNOWN_GERMAN_GAMING_SITES.map((site) => site.name),
    searchedEnglishMedia: KNOWN_ENGLISH_GAMING_SITES.map((site) => site.name),
    articlesChecked: articles.length,
    fullTextReadCount: articles.filter((article) => article.fullTextRead).length,
    readErrors: articles.flatMap((article) => article.readError ? [`${article.sourceName}: ${article.readError}`] : []),
    articles,
    facts,
    corroboratedFacts,
    unconfirmedFacts: facts.filter((fact) => !fact.corroborated || fact.isRumor),
    contradictions,
    followedOriginalSources: [...new Set(articles.flatMap((article) => article.originalSourceLinks))],
    independentEstablishedSources: sharedAgencyOnly ? 1 : independentKeys.size,
    fallbackEligible,
    fallbackReason: fallbackEligible
      ? "Mindestens zwei unabhaengige etablierte Fachmedien bestaetigen denselben Kernfakt; keine erreichbare Primaerquelle wird behauptet."
      : sharedAgencyOnly
        ? "Quellen wirken nicht unabhaengig, weil sie dieselbe Ursprungsmeldung/Agentur nutzen."
        : "Sekundaerquellen-Fallback nicht ausreichend belegt."
  };
}
