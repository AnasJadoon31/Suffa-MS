import { db } from "./offlineDb";

export type CachedResult<T> = Readonly<{ data: T; fromCache: boolean; fetchedAt: string | null }>;

let accountKey = "anonymous";

export function setOfflineAccountKey(madrasaId: string | null, userId: string | null): void {
  accountKey = madrasaId && userId ? `${madrasaId}:${userId}` : "anonymous";
}

export function getOfflineAccountKey(): string {
  return accountKey;
}

export async function clearLegacyApiCache(): Promise<void> {
  if (typeof caches !== "undefined") await caches.delete("api-reads");
}

/**
 * Network-first read-through cache for reference data (timetable, rosters,
 * holidays, …). A successful fetch refreshes the local copy; when the fetch
 * fails (offline), the last cached copy is served instead so read screens
 * keep working through a fully offline day (§3.4, FR-TT-02).
 */
export async function cachedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<CachedResult<T>> {
  const scopedKey = `${accountKey}:${key}`;
  try {
    const data = await fetcher();
    const fetchedAt = new Date().toISOString();
    await db.refCache.put({ key: scopedKey, data, fetched_at: fetchedAt });
    return { data, fromCache: false, fetchedAt };
  } catch (error) {
    const cached = await db.refCache.get(scopedKey);
    if (cached) {
      return { data: cached.data as T, fromCache: true, fetchedAt: cached.fetched_at };
    }
    throw error;
  }
}
