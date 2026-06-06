import { getSteamAgentConfig } from "../src/config/steamAgent";

const config = getSteamAgentConfig();

if (!config.enabled) {
  console.log("Steam-Scout ist sicher deaktiviert.");
  console.log("Aktivierung erfolgt serverseitig über STEAM_SCOUT_ENABLED=true.");
  process.exit(0);
}

console.log("Steam-Scout ist für den serverseitigen Tageslauf aktiviert.");
console.log(
  "Vorschläge werden ausschließlich über npm run editorial:daily vorbereitet und niemals automatisch veröffentlicht."
);
