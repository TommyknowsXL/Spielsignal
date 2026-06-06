export type ApprovedSteamImage = {
  imageUrl: string;
  sourcePageUrl: string;
  sourceType: "steam-store";
  rightsNotes: string;
  approvedAt: string;
  alt?: string;
};

/**
 * Nur manuell geprüfte offizielle Steam-Bilder eintragen.
 * Schlüssel ist die numerische Steam-App-ID. SteamDB ist keine zulässige Quelle.
 */
export const approvedSteamImages: Record<string, ApprovedSteamImage> = {};
