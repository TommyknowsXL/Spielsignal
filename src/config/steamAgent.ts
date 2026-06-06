export interface SteamAgentConfig {
  enabled: boolean;
  topSellersEnabled: boolean;
  mostPlayedEnabled: boolean;
  releasesEnabled: boolean;
  runSchedule: string;
  maxReleaseCandidates: number;
  maxTopSellerCandidates: number;
  maxMostPlayedCandidates: number;
  usageNotes: string;
}

export function getSteamAgentConfig(
  env: NodeJS.ProcessEnv = process.env
): SteamAgentConfig {
  return {
    enabled: env.STEAM_SCOUT_ENABLED === "true",
    topSellersEnabled: env.STEAM_TOP_SELLERS_ENABLED !== "false",
    mostPlayedEnabled: env.PUBLIC_STEAM_MOST_PLAYED_ENABLED === "true",
    releasesEnabled: env.STEAM_RELEASES_ENABLED === "true",
    runSchedule: "täglich",
    maxReleaseCandidates: 5,
    maxTopSellerCandidates: 5,
    maxMostPlayedCandidates: 2,
    usageNotes:
      "Nur serverseitige offizielle Steam-Schnittstellen verwenden. SteamDB und erfundene Daten sind ausgeschlossen."
  };
}
