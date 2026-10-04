import type { CacheStatus, Provenance } from "@/lib/domain/types";

/** Every provider response carries where it came from and how fresh it is. */
export interface Sourced<T> {
  data: T;
  provenance: Provenance;
}

export class NotConfiguredError extends Error {
  constructor(provider: string, what: string) {
    super(`[${provider}] not configured: ${what}`);
  }
}

export function liveProv(source: string, retrievedAt: string, stale = false, cache?: CacheStatus): Provenance {
  return { source, sourceTimestamp: null, retrievedAt, confidence: null, isProjection: false, kind: "observed", stale, cache: cache ?? (stale ? "stale" : undefined) };
}
