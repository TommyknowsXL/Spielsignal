import type {
  EditorialArticleType,
  EditorialCandidate
} from "./types";

export const MAX_DAILY_CANDIDATES = 15;
export const MAX_SCOUT_INPUT_CANDIDATES = 30;

export const agentRoles = {
  steamScout: {
    name: "Steam-Scout",
    enabled: true,
    automaticPublishing: false,
    allowedHosts: ["store.steampowered.com"],
    notes:
      "Verarbeitet nur überprüfbare Steam-Daten aus zulässigen Quellen. SteamDB ist ausgeschlossen."
  },
  newsScout: {
    name: "News-Scout",
    enabled: true,
    automaticPublishing: false,
    notes:
      "Verarbeitet nur Metadaten aktivierter RSS-Feeds, keine Volltexte und keine RSS-Bilder."
  },
  imageScout: {
    name: "Bild-Scout",
    enabled: true,
    automaticApproval: false,
    notes:
      "Externe Kandidaten beginnen immer als pending-review. Bis zur Freigabe gilt ein lokales Fallback."
  },
  editorialAgent: {
    name: "Redaktions-Agent",
    enabled: true,
    automaticPublishing: false,
    automaticMainMerge: false,
    maxDailyCandidates: MAX_DAILY_CANDIDATES,
    notes:
      "Erstellt nur eine priorisierte Prüfliste. Keine Bewertungen und keine automatische Veröffentlichung."
  }
} as const;

export const scoringRules = {
  newSteamRelease: 18,
  pcGamingReference: 16,
  verifiedSteamTrend: 14,
  confirmedFreePromotion: 18,
  possibleFreePromotion: 6,
  majorUpdate: 12,
  visitorUtility: 10,
  approvedImage: 5,
  recentItem: 8,
  unrelatedTopic: -40,
  duplicate: -50,
  unreviewedSource: -25,
  missingGamingReference: -20
} as const;

export const pcGamingKeywords = [
  "pc",
  "spiel",
  "spiele",
  "spielbar",
  "game",
  "gaming",
  "steam",
  "demo",
  "rpg",
  "rollenspiel",
  "shooter",
  "strategie",
  "survival",
  "indie",
  "grafikkarte",
  "gpu",
  "cpu",
  "hardware",
  "windows",
  "mod"
] as const;

export const unrelatedTopicKeywords = [
  "kino",
  "film",
  "fernsehserie",
  "smartphone",
  "iphone",
  "ios",
  "playstation",
  "ps5",
  "nintendo-angebot",
  "ps5-angebot",
  "amazon-angebot",
  "netflix",
  "schauspieler",
  "tennis",
  "lego",
  "mediamarkt",
  "lidl",
  "anzeige",
  "haushalt",
  "roboter-ballmaschine"
] as const;

export function recommendArticleType(input: {
  sourceType: EditorialCandidate["sourceType"];
  title: string;
  freePromotionConfirmed?: boolean;
  hasFreeReference?: boolean;
}): EditorialArticleType {
  if (input.sourceType === "free-promotion" && input.freePromotionConfirmed) {
    return "free-promotion";
  }
  if (input.hasFreeReference) return "free-promotion-candidate";
  if (input.sourceType === "steam-release") return "release-check";
  if (input.sourceType === "steam-top-seller") return "steam-top-seller";
  if (input.sourceType === "steam-most-played") return "steam-most-played";
  return "news-overview";
}

export function scoreCandidate(
  candidate: Pick<
    EditorialCandidate,
    | "sourceType"
    | "title"
    | "imageStatus"
    | "createdAt"
    | "freeReferenceType"
    | "freePromotionConfirmed"
    | "topicClassification"
    | "officialPrimarySourceFound"
    | "independentSourceCount"
  >
): { score: number; reasons: string[] } {
  const title = candidate.title.toLocaleLowerCase("de");
  const reasons: string[] = [];
  let score = 0;

  const hasGamingReference = pcGamingKeywords.some((keyword) => title.includes(keyword));
  const isUnrelated = unrelatedTopicKeywords.some((keyword) => title.includes(keyword));

  if (candidate.sourceType === "steam-release") {
    score += scoringRules.newSteamRelease;
    reasons.push("Neue überprüfbare Steam-Veröffentlichung");
  }
  if (candidate.sourceType === "steam-top-seller") {
    const hasNewsEvent = candidate.topicClassification && candidate.topicClassification !== "steam-ranking-without-news";
    score += hasNewsEvent ? scoringRules.verifiedSteamTrend : -35;
    reasons.push(hasNewsEvent ? "Steam-Signal mit Nachrichtenanlass" : "Steam-Ranking ohne eigenen Nachrichtenanlass");
  }
  if (candidate.sourceType === "steam-most-played") {
    score += scoringRules.verifiedSteamTrend;
    reasons.push("Steam-Spielerzahlen aus offizieller Quelle");
  }
  if (candidate.sourceType === "free-promotion" && candidate.freePromotionConfirmed) {
    score += scoringRules.confirmedFreePromotion;
    reasons.push("Gratis-Aktion anhand einer offiziellen Quelle bestätigt");
  } else if (candidate.freeReferenceType && candidate.freeReferenceType !== "none") {
    score += scoringRules.possibleFreePromotion;
    reasons.push("Gratis-Bezug erkannt, Bestätigung noch erforderlich");
  }
  if (hasGamingReference) {
    score += scoringRules.pcGamingReference;
    reasons.push("Erkennbarer PC-Gaming-Bezug");
  } else {
    score += scoringRules.missingGamingReference;
    reasons.push("Gaming-Bezug muss redaktionell geprüft werden");
  }
  if (/(update|patch|erweiterung|dlc)/i.test(candidate.title)) {
    score += scoringRules.majorUpdate;
    reasons.push("Update oder Erweiterung mit möglichem Nutzwert");
  }
  if (candidate.officialPrimarySourceFound) {
    score += 22;
    reasons.push("Offizielle Primaerquelle im Cluster vorhanden");
  }
  if ((candidate.independentSourceCount ?? 1) >= 2) {
    score += 16;
    reasons.push("Mehrere unabhaengige Fachmedien berichten");
  }
  if ([
    "patchnotes",
    "game-update",
    "release-date",
    "demo-release",
    "new-game-announcement",
    "trailer",
    "DLC",
    "expansion",
    "studio-news",
    "publisher-news",
    "legal/regulatory",
    "platform-update",
    "event-announcement",
    "confirmed-delay",
    "confirmed-cancellation",
    "official-roadmap"
  ].includes(candidate.topicClassification ?? "general-news")) {
    score += 14;
    reasons.push("Konkreter aktueller News-Anlass");
  }
  if ([
    "opinion",
    "column",
    "special",
    "listicle",
    "buying-guide",
    "sale-roundup",
    "paywalled-plus-content",
    "community-discussion",
    "steam-ranking-without-news"
  ].includes(candidate.topicClassification ?? "general-news")) {
    score -= 45;
    reasons.push("Nicht als eigenstaendiger News-Kandidat priorisiert");
  }
  if (/(guide|systemanforderung|kostenlos|gratis|release|termin)/i.test(candidate.title)) {
    score += scoringRules.visitorUtility;
    reasons.push("Potenziell hoher Nutzwert für Besucher");
  }
  if (candidate.imageStatus === "approved") {
    score += scoringRules.approvedImage;
    reasons.push("Freigegebenes Bild vorhanden");
  }
  if (Date.now() - Date.parse(candidate.createdAt) <= 48 * 60 * 60 * 1000) {
    score += scoringRules.recentItem;
    reasons.push("Aktuelle Meldung");
  }
  if (isUnrelated) {
    score += scoringRules.unrelatedTopic;
    reasons.push("Möglicherweise themenfremd");
  }

  return { score, reasons };
}
