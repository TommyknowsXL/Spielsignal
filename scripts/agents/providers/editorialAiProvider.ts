import type { EditorialCandidate } from "../types";

export const EDITORIAL_AI_PROMPT = `Erstelle einen eigenständigen deutschsprachigen SpielSignal-Artikel anhand der bereitgestellten belegbaren Fakten aus offiziellen Primärquellen.

Nutze keine Formulierungen, Gliederungen oder Argumentationsfolgen fremder Gaming-Magazine.

Schreibe klar, verständlich und sachlich.

Trenne belegbare Fakten von redaktioneller Einordnung.

Erfinde keine Angaben.

Wenn eine Information nicht belegt ist, lasse sie weg oder kennzeichne sie als offen.

Füge eine Quellenbox hinzu.

Bezeichne einen Artikel niemals als Test, wenn keine echte Spielzeit oder belastbare Gameplay-Notizen vorliegen.`;

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
 * Die Schnittstelle bleibt bewusst strukturiert und opt-in. Sie veröffentlicht
 * niemals und erhält ausschließlich zuvor geprüfte Fakten aus Primärquellen.
 */
export async function prepareEditorialAiDrafts(
  _candidates: EditorialCandidate[],
  environment: Record<string, string | undefined> = process.env
): Promise<EditorialAiResult> {
  const enabled = environment.AI_EDITORIAL_ENABLED === "true";
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
