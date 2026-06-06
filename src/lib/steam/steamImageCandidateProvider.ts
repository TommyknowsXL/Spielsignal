export function getSteamStoreUrl(appId: string): string {
  return `https://store.steampowered.com/app/${appId}/`;
}

export function getSteamHeaderImageCandidate(appId: string): string {
  return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
}
