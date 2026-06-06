export interface SteamAgentConfig {
  enabled: boolean;
  trendsEnabled: boolean;
  releasesEnabled: boolean;
  runSchedule: string;
  maxReleaseCandidates: number;
  maxTrendCandidates: number;
  usageNotes: string;
}

export function getSteamAgentConfig(
  env: NodeJS.ProcessEnv = process.env
): SteamAgentConfig {
  return {
    enabled: env.STEAM_SCOUT_ENABLED === "true",
    trendsEnabled: env.STEAM_TRENDS_ENABLED === "true",
    releasesEnabled: env.STEAM_RELEASES_ENABLED === "true",
    runSchedule: "täglich",
    maxReleaseCandidates: 5,
    maxTrendCandidates: 5,
    usageNotes:
      "Nur serverseitige offizielle Steam-Schnittstellen verwenden. SteamDB und erfundene Daten sind ausgeschlossen."
  };
}
