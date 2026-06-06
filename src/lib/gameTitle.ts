const GENERIC_PREFIXES = [
  "kostenlos am wochenende",
  "gratis am wochenende",
  "neu auf steam",
  "jetzt auf steam",
  "endlich auf steam",
  "gameplay",
  "trailer",
  "release",
  "update",
  "patch",
  "deal",
  "angebot",
  "hardware",
  "meinung",
  "analyse",
  "test",
  "pc-gaming",
  "strategie-rollenspiel",
  "rollenspiel",
  "shooter",
  "survival"
];

function clean(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim();
}

function isPlausibleGameTitle(value: string): boolean {
  const candidate = clean(value);
  if (candidate.length < 3 || candidate.length > 60) return false;
  const normalized = candidate.toLocaleLowerCase("de");
  if (GENERIC_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix} `))) {
    return false;
  }
  if (/^(das|der|die|ein|eine|neues?|großes?|bestes?|dieses?|warum|wie|was|wer)\b/i.test(candidate)) {
    return false;
  }
  if (/\b(aufgepasst|early access|im test|mein gaming-pc)\b/i.test(candidate)) {
    return false;
  }
  if (!/[\p{L}]/u.test(candidate)) return false;
  return candidate.split(/\s+/).length <= 8;
}

export function extractGameTitle(headline: string): string | undefined {
  const title = clean(
    headline
      .replace(/^(plus\s*-\s*)?(news|preview|test|kolumne|analyse|video)\s*:\s*/i, "")
      .replace(/^(plus\s*-\s*)?(news|preview|test|kolumne|analyse|video)\s*-\s*/i, "")
  );
  const dashIndex = title.search(/\s[-–—]\s/);
  const colonIndex = title.indexOf(":");
  const separatorIndexes = [dashIndex, colonIndex].filter((index) => index > 0);
  if (separatorIndexes.length === 0) return undefined;

  const firstSeparator = Math.min(...separatorIndexes);
  const prefix = clean(title.slice(0, firstSeparator));
  if (isPlausibleGameTitle(prefix) && !/^\d+$/.test(prefix)) return prefix;

  if (/^\d+$/.test(prefix) && colonIndex === firstSeparator) {
    const remainder = title.slice(colonIndex + 1);
    const nextDash = remainder.search(/\s[-–—]\s/);
    const subtitle = clean(nextDash >= 0 ? remainder.slice(0, nextDash) : remainder);
    const combined = `${prefix}: ${subtitle}`;
    if (isPlausibleGameTitle(combined)) return combined;
  }
  return undefined;
}
