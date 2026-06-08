import { parse as parseYaml } from "yaml";
import { failed, passed, type DraftReviewInput, type EditorialReviewResult } from "./types";

export function runTechnicalCheck(input: DraftReviewInput): EditorialReviewResult {
  const requiredFixes: string[] = [];
  const warnings: string[] = [];

  if (/^\uFEFF/.test(input.markdown)) requiredFixes.push("UTF-8-BOM entfernen.");
  if (/[\u202A-\u202E\u2066-\u2069\uFEFF\u00A0]/.test(input.markdown)) {
    requiredFixes.push("Versteckte oder bidirektionale Unicode-Zeichen entfernen.");
  }
  if (/\r/.test(input.markdown)) requiredFixes.push("Zeilenumbrüche auf LF normalisieren.");
  if ((input.readerText.match(/^# /gm) ?? []).length > 1) requiredFixes.push("Doppelte H1-Überschrift entfernen.");
  if ((input.readerText.match(/^## Quellen$/gm) ?? []).length > 1) requiredFixes.push("Doppelte Quellenbox entfernen.");
  if (/src\/data\/editorial|archive\/\d{4}-\d{2}-\d{2}\.json/i.test(input.readerText)) {
    requiredFixes.push("Interne Repository-Pfade aus Lesertext entfernen.");
  }
  if (/https?:\/\/\s|https?:\/\/$/i.test(input.markdown)) warnings.push("Links auf Vollständigkeit prüfen.");
  if (/!\[[^\]]*\]\(\s*\)/.test(input.markdown)) requiredFixes.push("Kaputtes Bild-Markdown entfernen.");
  for (const match of input.markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim();
    if (target.startsWith("/")) continue;
    try {
      const url = new URL(target);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Ungültiges Protokoll");
    } catch {
      requiredFixes.push(`Ungültiger Link oder Bildpfad: ${target}`);
    }
  }
  if (input.markdown.startsWith("---\n")) {
    const closingMarker = input.markdown.indexOf("\n---", 4);
    if (closingMarker === -1) {
      requiredFixes.push("Frontmatter ist nicht geschlossen.");
    } else {
      try {
        parseYaml(input.markdown.slice(4, closingMarker), { uniqueKeys: true });
      } catch {
        requiredFixes.push("Frontmatter-YAML ist ungültig oder enthält doppelte Schlüssel.");
      }
    }
  }

  return requiredFixes.length ? failed(50, requiredFixes, warnings) : passed(95, ["Technische Textprüfung bestanden."]);
}
