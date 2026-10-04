import { CACHE_POLICY, type CacheClass } from "./policy";

interface Entry<T> {
  value: T;
  storedAt: number;
  cls: CacheClass;
}

/**
 * Process-local cache. Swap for Redis/Upstash/Supabase in production by keeping
 * the same get/set surface. Kept intentionally tiny.
 */
const store = new Map<string, Entry<unknown>>();
const MAX_ENTRIES = 5_000;

export type CacheHit<T> = { value: T; fresh: boolean; storedAt: number };

export function cacheGet<T>(key: string, now = Date.now()): CacheHit<T> | null {
  const e = store.get(key) as Entry<T> | undefined;
  if (!e) return null;
  const { ttl, staleFor } = CACHE_POLICY[e.cls];
  const age = now - e.storedAt;
  if (age > ttl + staleFor) {
    store.delete(key);
    return null;
  }
  return { value: e.value, fresh: age <= ttl, storedAt: e.storedAt };
}

export function cacheSet<T>(key: string, cls: CacheClass, value: T, now = Date.now()): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(key, { value, storedAt: now, cls });
}

export function cacheClear(): void {
  store.clear();
}

/** Targeted invalidation keeps large shared datasets (notably Sleeper players) warm. */
export function cacheDeletePrefix(prefix: string): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}
