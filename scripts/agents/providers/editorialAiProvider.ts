import type { EditorialCandidate } from "../types";

export const EDITORIAL_AI_PROMPT = `Du schreibst eigenständige deutschsprachige SpielSignal-Artikel.

Verbindliche Regeln:
- Verwende ausschließlich die bereitgestellten Fakten aus offiziellen Primärquellen.
- RSS-Titel sind nur Themenhinweise und keine Faktenbasis.
- Erfinde keine Fakten, Daten, Plattformen, Spielzeiten, Wertungen, Meinungen oder Reichweiten.
- Übernimm keine Formulierungen, Gliederungen oder Argumentationsfolgen fremder Gaming-Magazine.
- Formuliere Steam-Rankings nur als veränderliche Momentaufnahme.
- Zeige keine internen Repository-Pfade, Snapshot-Dateien oder UTC-Rohdaten.
- Trenne Fakten, offene Punkte und sachliche Einordnung.
- Erzeuge eine eigenständige Überschrift, Zusammenfassung, SEO-Daten und Markdown-Abschnitte.
- Empfehle Bildpositionen nur als redaktionelle Suchaufträge. Erteile niemals eine Bildfreigabe.
- Empfehle immer ein Hero-Bild; zusätzliche Bilder bleiben optional.
- Antworte ausschließlich im vorgegebenen JSON-Schema.`;

export type EditorialAiCandidateInput = {
  candidate: EditorialCandidate;
  articleType: string;
  primarySources: string[];
  verifiedFacts: string[];
  editorialNote?: string;
};

export type EditorialAiDraft = {
  candidateId: string;
  title: string;
  summary: string;
  seoTitle: string;
  seoDescription: string;
  markdownBody: string;
  recommendedImages: Array<{
    position: "hero" | "after-intro" | "mid-article";
    searchTarget: string;
    preferredSourceType: "steam-store" | "publisher-presskit" | "official-game-site";
    required: boolean;
  }>;
  warnings: string[];
};

export type EditorialAiResult = {
  enabled: boolean;
  drafts: EditorialAiDraft[];
  reason: string;
  model: string;
  maxArticles: number;
};

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    drafts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          candidateId: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          seoTitle: { type: "string" },
          seoDescription: { type: "string" },
          markdownBody: { type: "string" },
          recommendedImages: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                position: { type: "string", enum: ["hero", "after-intro", "mid-article"] },
                searchTarget: { type: "string" },
                preferredSourceType: {
                  type: "string",
                  enum: ["steam-store", "publisher-presskit", "official-game-site"]
                },
                required: { type: "boolean" }
              },
              required: ["position", "searchTarget", "preferredSourceType", "required"]
            }
          },
          warnings: { type: "array", items: { type: "string" } }
        },
        required: [
          "candidateId",
          "title",
          "summary",
          "seoTitle",
          "seoDescription",
          "markdownBody",
          "recommendedImages",
          "warnings"
        ]
      }
    }
  },
  required: ["drafts"]
} as const;

function responseText(payload: OpenAiResponse): string {
  if (payload.output_text) return payload.output_text;
  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text" && content.text)
    ?.text ?? "";
}

function normalizeInputs(
  inputs: EditorialAiCandidateInput[] | EditorialCandidate[]
): EditorialAiCandidateInput[] {
  return inputs.map((input) => "candidate" in input
    ? input
    : {
        candidate: input,
        articleType: input.articleType,
        primarySources: [],
        verifiedFacts: []
      });
}

/**
 * Optionale, kostenpflichtige Unterstützung über die Responses API.
 * Der Provider erhält nur vorab geprüfte Fakten und veröffentlicht niemals.
 */
export async function prepareEditorialAiDrafts(
  candidates: EditorialAiCandidateInput[] | EditorialCandidate[],
  environment: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<EditorialAiResult> {
  const enabled = environment.AI_EDITORIAL_ENABLED === "true";
  const model = environment.AI_EDITORIAL_MODEL?.trim() || "gpt-5-mini";
  const configuredMax = Number.parseInt(environment.AI_EDITORIAL_MAX_ARTICLES ?? "5", 10);
  const maxArticles = Math.max(1, Math.min(5, Number.isFinite(configuredMax) ? configuredMax : 5));
  const apiKey = environment.OPENAI_API_KEY?.trim();
  const inputs = normalizeInputs(candidates)
    .filter((input) => input.primarySources.length && input.verifiedFacts.length)
    .slice(0, maxArticles);

  if (!enabled) {
    return { enabled: false, drafts: [], reason: "Optionale KI-Unterstützung ist deaktiviert.", model, maxArticles };
  }
  if (!apiKey) {
    return { enabled: false, drafts: [], reason: "Kein serverseitiger API-Schlüssel konfiguriert.", model, maxArticles };
  }
  if (!inputs.length) {
    return {
      enabled: true,
      drafts: [],
      reason: "Keine Kandidaten mit offiziellen Primärquellen und geprüften Fakten vorhanden.",
      model,
      maxArticles
    };
  }

  try {
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: EDITORIAL_AI_PROMPT },
          {
            role: "user",
            content: JSON.stringify(inputs.map((input) => ({
              candidateId: input.candidate.id,
              topicHint: input.candidate.title,
              gameTitle: input.candidate.gameTitle,
              articleType: input.articleType,
              primarySources: input.primarySources,
              verifiedFacts: input.verifiedFacts,
              editorialNote: input.editorialNote
            })))
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "spielsignal_editorial_batch",
            strict: true,
            schema: responseSchema
          }
        }
      }),
      signal: AbortSignal.timeout(120_000)
    });

    if (!response.ok) {
      return {
        enabled: true,
        drafts: [],
        reason: `KI-Anfrage fehlgeschlagen (HTTP ${response.status}); stattdessen Gerüste erzeugen.`,
        model,
        maxArticles
      };
    }

    const payload = await response.json() as OpenAiResponse;
    const parsed = JSON.parse(responseText(payload)) as { drafts?: EditorialAiDraft[] };
    return {
      enabled: true,
      drafts: (parsed.drafts ?? []).slice(0, maxArticles),
      reason: "Strukturierte KI-Entwürfe wurden aus geprüften Fakten vorbereitet.",
      model,
      maxArticles
    };
  } catch {
    return {
      enabled: true,
      drafts: [],
      reason: "KI-Verarbeitung fehlgeschlagen; stattdessen Gerüste erzeugen.",
      model,
      maxArticles
    };
  }
}
