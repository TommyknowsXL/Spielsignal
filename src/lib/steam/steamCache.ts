import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type CacheEntry<T> = {
  savedAt: string;
  value: T;
};

export const STEAM_RELEASE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const STEAM_TREND_CACHE_TTL_MS = 60 * 60 * 1000;
export const STEAM_TOP_SELLER_CACHE_TTL_MS = 60 * 60 * 1000;
export const STEAM_APP_LIST_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function withSteamCache<T>(options: {
  cacheKey: string;
  ttlMs: number;
  load: () => Promise<T>;
  cacheDirectory?: string;
  now?: number;
  useStaleOnError?: boolean;
}): Promise<T> {
  const cacheDirectory =
    options.cacheDirectory ?? join(process.cwd(), ".cache", "steam");
  const path = join(cacheDirectory, `${options.cacheKey}.json`);
  const now = options.now ?? Date.now();

  let stale: CacheEntry<T> | undefined;
  try {
    const cached = JSON.parse(await readFile(path, "utf8")) as CacheEntry<T>;
    stale = cached;
    if (now - Date.parse(cached.savedAt) < options.ttlMs) return cached.value;
  } catch {
    // Missing or invalid cache entries are refreshed.
  }

  let value: T;
  try {
    value = await options.load();
  } catch (error) {
    if (options.useStaleOnError && stale) return stale.value;
    throw error;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify({ savedAt: new Date(now).toISOString(), value }, null, 2)}\n`,
    "utf8"
  );
  return value;
}
