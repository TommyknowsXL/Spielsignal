import { steamAgentConfig } from "../src/config/steamAgent";

if (!steamAgentConfig.enabled) {
  console.log("Steam-Agent ist sicher deaktiviert.");
  console.log("Konfiguration: src/config/steamAgent.ts");
  console.log("Entwürfe: src/content/steam-suggestions/");
  console.log(
    "Vor Aktivierung müssen Datenquelle, Nutzungsbedingungen und Bildrechte geprüft werden."
  );
  process.exit(0);
}

if (!steamAgentConfig.sourceApiUrl) {
  throw new Error("Steam-Agent ist aktiviert, aber sourceApiUrl fehlt.");
}

throw new Error(
  "Die Quelle ist konfiguriert, aber der produktive Import muss nach der Quellenfreigabe implementiert und geprüft werden."
);
