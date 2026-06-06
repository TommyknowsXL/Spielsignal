export const STEAM_API_BASE_URL = "https://api.steampowered.com";
export const STEAM_STORE_BASE_URL = "https://store.steampowered.com";
export const STEAM_REQUEST_TIMEOUT_MS = 8_000;

export async function fetchSteamJson<T>(options: {
  path: string;
  apiKey: string;
  input?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? STEAM_REQUEST_TIMEOUT_MS
  );
  const url = new URL(options.path, STEAM_API_BASE_URL);
  url.searchParams.set("key", options.apiKey);
  url.searchParams.set("format", "json");
  if (options.input) {
    url.searchParams.set("input_json", JSON.stringify(options.input));
  }

  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Steam API antwortete mit HTTP ${response.status}.`);
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}
