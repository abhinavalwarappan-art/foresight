import { CACHE_POLICY, type CacheClass } from "@/lib/cache/policy";
import type { Provenance } from "@/lib/domain/types";

export interface Freshness {
  label: string;
  tone: "live" | "fresh" | "aging" | "stale" | "mock" | "computed" | "unknown";
}

/** LIVE · N MIN AGO · N HOURS OLD · STALE — judged against the data class's cache TTL. */
export function freshness(prov: Pick<Provenance, "retrievedAt" | "stale" | "cache"> | null | undefined, cls?: CacheClass, now = Date.now()): Freshness {
  if (!prov) return { label: "NOT AVAILABLE", tone: "unknown" };
  if (prov.cache === "mock") return { label: "MOCK · FIXED CLOCK", tone: "mock" };
  if (prov.cache === "computed") return { label: "COMPUTED FROM SNAPSHOT", tone: "computed" };
  if (prov.stale || prov.cache === "stale") return { label: "STALE", tone: "stale" };
  const t = Date.parse(prov.retrievedAt);
  if (!Number.isFinite(t)) return { label: "UNKNOWN AGE", tone: "unknown" };
  const age = Math.max(0, now - t);
  if (cls && age > CACHE_POLICY[cls].ttl) return { label: "STALE", tone: "stale" };
  if (age < 60_000) return { label: "LIVE", tone: "live" };
  if (age < 3_600_000) return { label: `${Math.round(age / 60_000)} MIN AGO`, tone: "fresh" };
  if (age < 86_400_000) return { label: `${Math.round(age / 3_600_000)} HOURS OLD`, tone: "aging" };
  return { label: `${Math.round(age / 86_400_000)} DAYS OLD`, tone: "aging" };
}
