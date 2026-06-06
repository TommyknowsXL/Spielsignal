export interface DemoNewsItem {
  id: string;
  title: string;
  category: string;
  publishedLabel: string;
  sourceName: string;
  sourceUrl: string;
  note: string;
}

export const demoNews: DemoNewsItem[] = [
  ["demo-rollenspiel", "Demo: Ein Rollenspiel-Update richtig einordnen", "Rollenspiele", "Welche Änderungen betreffen bestehende Spielstände? Ein echter Hinweis fasst nur bestätigte Eckdaten zusammen."],
  ["demo-survival", "Demo: Neuer Survival-Titel zeigt sein Bausystem", "Survival", "Eine echte Vorschau würde Mechaniken nennen, ohne Werbeaussagen ungeprüft zu übernehmen."],
  ["demo-strategie", "Demo: Rundenstrategie erhält eine Testversion", "Strategie", "Verfügbarkeit, Umfang und Systemanforderungen würden direkt an der freigegebenen Originalquelle geprüft."],
  ["demo-shooter", "Demo: Technisches Update für einen PC-Shooter", "Shooter", "Im Fokus stünden belegte Patch-Details und mögliche Auswirkungen auf die PC-Version."],
  ["demo-simulation", "Demo: Aufbau-Simulation kündigt Komfortfunktionen an", "Simulation", "Der Hinweis würde die wichtigsten bestätigten Funktionen knapp zusammenfassen."],
  ["demo-indie", "Demo: Kleine Demo macht ein Indie-Projekt spielbar", "Indie", "Ein echter Beitrag trennt persönliche Eindrücke klar von den Angaben des Studios."],
  ["demo-patch", "Demo: Patch-Termin wird offiziell bestätigt", "Updates", "Datum und Plattform würden nur nach Abgleich mit einer erlaubten offiziellen Meldung veröffentlicht."],
  ["demo-deal", "Demo: So wird ein Spiele-Angebot geprüft", "Deals", "Preis, Händler, Laufzeit und mögliche Einschränkungen müssen vor Veröffentlichung kontrolliert werden."],
  ["demo-dialog", "Demo: Entwicklungsblog erklärt Dialogsystem", "Rollenspiele", "Der vollständige Beitrag bleibt bei der Quelle; SpielSignal ergänzt nur einen kurzen eigenen Hinweis."],
  ["demo-roadmap", "Demo: Roadmap nennt kommende Szenarien", "Strategie", "Eine Roadmap ist eine Planung und keine Garantie. Dieser Unterschied würde sichtbar benannt."],
  ["demo-mods", "Demo: Mod-Unterstützung wird untersucht", "Simulation", "Unbestätigte Funktionen erscheinen nicht als fest zugesagte Inhalte."],
  ["demo-anforderungen", "Demo: Entwickler veröffentlichen offene PC-Anforderungen", "Indie", "Anforderungen würden mit Datum und direktem Link zur Originalseite dokumentiert."]
].map(([id, title, category, note]) => ({
  id,
  title,
  category,
  publishedLabel: "Beispieldatum",
  sourceName: "Beispielquelle",
  sourceUrl: "https://example.com/",
  note
}));
