function enabled(value: string | undefined): boolean {
  return value === "true";
}

export const privacyConfig = {
  adsEnabled: enabled(import.meta.env.PUBLIC_ADS_ENABLED),
  analyticsEnabled: enabled(import.meta.env.PUBLIC_ANALYTICS_ENABLED),
  externalEmbedsEnabled: enabled(import.meta.env.PUBLIC_EXTERNAL_EMBEDS_ENABLED),
  newsletterEnabled: enabled(import.meta.env.PUBLIC_NEWSLETTER_ENABLED),
  commentsEnabled: false,
  loginEnabled: false,
  consentModeReady: enabled(import.meta.env.PUBLIC_CONSENT_MODE_READY)
} as const;

export const adsenseClient = import.meta.env.PUBLIC_ADSENSE_CLIENT?.trim() ?? "";

export const canLoadAds =
  privacyConfig.adsEnabled &&
  privacyConfig.consentModeReady &&
  adsenseClient.startsWith("ca-pub-");
