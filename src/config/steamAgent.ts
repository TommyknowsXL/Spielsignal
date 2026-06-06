export interface SteamAgentConfig {
  enabled: boolean;
  sourceApiUrl: string | null;
  runSchedule: string;
  minSuggestions: number;
  maxSuggestions: number;
  allowedArticleTypes: Array<"Release-Check" | "Ersteindruck" | "Test">;
  usageNotes: string;
}

/**
 * Der Agent bleibt deaktiviert, bis eine erlaubte Datenquelle geprüft wurde.
 * Keine inoffiziellen Endpunkte, Zugangsdaten oder ungeprüften Bildquellen eintragen.
 */
export const steamAgentConfig: SteamAgentConfig = {
  enabled: false,
  sourceApiUrl: null,
  runSchedule: "täglich",
  minSuggestions: 5,
  maxSuggestions: 10,
  allowedArticleTypes: ["Release-Check", "Ersteindruck", "Test"],
  usageNotes:
    "Vor Aktivierung Datenquelle, Nutzungsbedingungen, Bildrechte und Veröffentlichungsworkflow prüfen."
};
