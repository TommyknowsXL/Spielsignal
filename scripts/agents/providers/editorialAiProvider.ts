import type { EditorialCandidate } from "../types";
import type { VerifiedFact } from "../sources/findOfficialPrimarySources";

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
  verifiedFacts: VerifiedFact[];
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
  errorCode?: EditorialAiErrorCode;
  attempts?: number;
};

export type EditorialAiErrorCode =
  | "rate_limit_exceeded"
  | "insufficient_quota"
  | "invalid_api_key"
  | "model_not_available"
  | "network_error"
  | "unknown_api_error";

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

type OpenAiErrorResponse = {
  error?: {
    code?: string;
    type?: string;
    message?: string;
  };
};

export type EditorialAiProviderRuntime = {
  sleep?: (milliseconds: number) => Promise<void>;
  log?: (message: string) => void;
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

export function classifyEditorialAiError(
  status: number,
  payload: OpenAiErrorResponse | undefined
): EditorialAiErrorCode {
  const code = payload?.error?.code?.toLowerCase() ?? "";
  const type = payload?.error?.type?.toLowerCase() ?? "";
  const message = payload?.error?.message?.toLowerCase() ?? "";
  const combined = `${code} ${type} ${message}`;

  if (status === 401 || /invalid[_\s-]*api[_\s-]*key|authentication/.test(combined)) {
    return "invalid_api_key";
  }
  if (/insufficient[_\s-]*quota|billing|credits/.test(combined)) {
    return "insufficient_quota";
  }
  if (status === 404 || /model.*(not found|unavailable|access)|model_not_found/.test(combined)) {
    return "model_not_available";
  }
  if (status === 429 && /rate[_\s-]*limit|too many requests|requests per/.test(combined)) {
    return "rate_limit_exceeded";
  }
  return "unknown_api_error";
}

function retryAfterMilliseconds(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - now);
  return undefined;
}

async function safeErrorPayload(response: Response): Promise<OpenAiErrorResponse | undefined> {
  try {
    return await response.json() as OpenAiErrorResponse;
  } catch {
    return undefined;
  }
}

function safeLog(input: {
  status: number | "network";
  code: EditorialAiErrorCode;
  attempt: number;
  retryAfter?: string;
  model: string;
}): string {
  return [
    `Editorial AI request failed: HTTP ${input.status}`,
    `code=${input.code}`,
    `attempt=${input.attempt}`,
    `retry_after=${input.retryAfter ?? "none"}`,
    `model=${input.model}`
  ].join(" ");
}

export async function prepareEditorialAiDrafts(
  candidates: EditorialAiCandidateInput[] | EditorialCandidate[],
  environment: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
  runtime: EditorialAiProviderRuntime = {}
): Promise<EditorialAiResult> {
  const enabled = environment.AI_EDITORIAL_ENABLED === "true";
  const model = environment.AI_EDITORIAL_MODEL?.trim() || "gpt-5-mini";
  const configuredMax = Number.parseInt(environment.AI_EDITORIAL_MAX_ARTICLES ?? "5", 10);
  const maxArticles = Math.max(1, Math.min(5, Number.isFinite(configuredMax) ? configuredMax : 5));
  const configuredRetries = Number.parseInt(environment.AI_EDITORIAL_MAX_RETRIES ?? "3", 10);
  const maxRetries = Math.max(0, Math.min(3, Number.isFinite(configuredRetries) ? configuredRetries : 3));
  const apiKey = environment.OPENAI_API_KEY?.trim();
  const sleep = runtime.sleep ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const log = runtime.log ?? console.warn;
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

  const requestBody = JSON.stringify({
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
  });
  const totalAttempts = maxRetries + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      const response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: requestBody,
        signal: AbortSignal.timeout(120_000)
      });

      if (!response.ok) {
        const payload = await safeErrorPayload(response);
        const errorCode = classifyEditorialAiError(response.status, payload);
        const retryAfter = response.headers.get("retry-after") ?? undefined;
        log(safeLog({ status: response.status, code: errorCode, attempt, retryAfter, model }));
        if (errorCode === "rate_limit_exceeded" && attempt < totalAttempts) {
          const delay = retryAfterMilliseconds(retryAfter ?? null) ??
            (1000 * (2 ** (attempt - 1)));
          await sleep(delay);
          continue;
        }
        const failWithoutQuota = errorCode === "insufficient_quota" &&
          environment.AI_EDITORIAL_FAIL_WITHOUT_QUOTA === "true";
        return {
          enabled: true,
          drafts: [],
          reason: failWithoutQuota
            ? "KI-Verarbeitung abgebrochen: kein API-Guthaben verfügbar."
            : `KI-Verarbeitung fehlgeschlagen (${errorCode}); stattdessen Diagnose-Gerüste erzeugen.`,
          model,
          maxArticles,
          errorCode,
          attempts: attempt
        };
      }

      const payload = await response.json() as OpenAiResponse;
      const parsed = JSON.parse(responseText(payload)) as { drafts?: EditorialAiDraft[] };
      return {
        enabled: true,
        drafts: (parsed.drafts ?? []).slice(0, maxArticles),
        reason: "Strukturierte KI-Entwürfe wurden aus geprüften Fakten vorbereitet.",
        model,
        maxArticles,
        attempts: attempt
      };
    } catch {
      log(safeLog({ status: "network", code: "network_error", attempt, model }));
      return {
        enabled: true,
        drafts: [],
        reason: "KI-Verarbeitung fehlgeschlagen (network_error); stattdessen Diagnose-Gerüste erzeugen.",
        model,
        maxArticles,
        errorCode: "network_error",
        attempts: attempt
      };
    }
  }

  return {
    enabled: true,
    drafts: [],
    reason: "KI-Verarbeitung fehlgeschlagen (unknown_api_error); stattdessen Diagnose-Gerüste erzeugen.",
    model,
    maxArticles,
    errorCode: "unknown_api_error",
    attempts: totalAttempts
  };
}
