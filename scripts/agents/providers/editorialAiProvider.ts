import type { EditorialCandidate } from "../types";

export type EditorialAiDraft = {
  candidateId: string;
  suggestedHeadline: string;
  outline: string[];
  warnings: string[];
};

export type EditorialAiResult = {
  enabled: boolean;
  drafts: EditorialAiDraft[];
  reason: string;
};

/**
 * Intentionally does not call an AI API. A later implementation must remain
 * opt-in, return structured drafts only and must never publish or approve images.
 */
export async function prepareEditorialAiDrafts(
  _candidates: EditorialCandidate[],
  environment: Record<string, string | undefined> = process.env
): Promise<EditorialAiResult> {
  const enabled = environment.PUBLIC_AI_EDITORIAL_ENABLED === "true";
  const hasKey = Boolean(environment.OPENAI_API_KEY?.trim());

  if (!enabled) {
    return {
      enabled: false,
      drafts: [],
      reason: "Optionale KI-Unterstützung ist deaktiviert."
    };
  }
  if (!hasKey) {
    return {
      enabled: false,
      drafts: [],
      reason: "Kein serverseitiger API-Schlüssel konfiguriert."
    };
  }

  return {
    enabled: false,
    drafts: [],
    reason:
      "Provider-Schnittstelle ist vorbereitet, aber kostenpflichtige API-Aufrufe sind noch nicht implementiert oder freigegeben."
  };
}
