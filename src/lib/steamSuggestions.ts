import type { CollectionEntry } from "astro:content";

export type SteamSuggestion = CollectionEntry<"steamSuggestions">["data"];

export function canPublishSteamSuggestion(suggestion: SteamSuggestion): boolean {
  if (suggestion.demo || suggestion.status !== "veröffentlicht") return false;
  if (suggestion.articleType !== "Test") return true;

  return suggestion.played || Boolean(suggestion.gameplayNotes?.trim());
}

export function summarizeSteamSuggestion(suggestion: SteamSuggestion): string {
  return [
    suggestion.gameName,
    suggestion.genre,
    suggestion.releaseDate,
    suggestion.price,
    suggestion.articleType,
    suggestion.status
  ].join(" | ");
}
