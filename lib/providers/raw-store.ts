import type { CacheStatus } from "@/lib/domain/types";

/**
 * Bounded store of RAW provider records, keyed by the internal entity they map to.
 * Lets the Data Inspector show "raw API response → normalized object" side by side.
 * Only response bodies are stored — never request headers or keys.
 */
export interface RawRecord {
  provider: string;
  endpoint: string; // path only, query keys kept, no secrets (keys travel in headers)
  entityKey: string; // e.g. "player:nfl-bdl-p123", "game:...", "league:..."
  kind: "player" | "stats" | "injury" | "game" | "team" | "league" | "roster" | "odds" | "research";
  retrievedAt: string;
  cache: CacheStatus;
  synthetic?: boolean; // generated from mock data in provider shape
  payload: unknown;
}

const MAX = 20_000;
const store = new Map<string, RawRecord[]>();
let size = 0;

export function recordRaw(r: RawRecord) {
  const list = store.get(r.entityKey) ?? [];
  // keep one record per provider+endpoint+payload identity (latest wins)
  const idx = list.findIndex((x) => x.provider === r.provider && x.kind === r.kind && x.endpoint === r.endpoint && JSON.stringify(x.payload) === JSON.stringify(r.payload));
  if (idx >= 0) list.splice(idx, 1);
  else size++;
  list.push(r);
  store.set(r.entityKey, list);
  if (size > MAX) {
    const first = store.keys().next().value;
    if (first) { size -= store.get(first)?.length ?? 0; store.delete(first); }
  }
}

export function rawFor(entityKey: string): RawRecord[] {
  return [...(store.get(entityKey) ?? [])];
}

export function clearRaw() {
  store.clear();
  size = 0;
}

/** Strip anything that looks like a credential before display. Defense in depth. */
export function redact<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (k, v) => (/^(authorization|api[-_]?key|apikey|token|access_token|refresh_token|secret|password|x-api-key)$/i.test(k) ? "[REDACTED]" : v))) as T;
}
