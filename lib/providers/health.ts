/**
 * Rolling provider health + request telemetry. Process-local; surfaced by
 * /api/health and the /admin/data inspector. Never stores keys or headers.
 */
export type HealthState = "healthy" | "degraded" | "down" | "unconfigured" | "mock";

export interface Health {
  provider: string;
  state: HealthState;
  lastOk: number | null;
  lastError: string | null;
  lastFailureAt: number | null;
  consecutiveFailures: number;
  rateLimitedUntil: number | null;
  lastLatencyMs: number | null;
  avgLatencyMs: number | null;
  requests: number;
  cacheHits: number;
  cacheMisses: number;
  staleServes: number;
  lastStaleAt: number | null;
}

const health = new Map<string, Health>();

function get(provider: string): Health {
  let h = health.get(provider);
  if (!h) {
    h = {
      provider, state: "healthy", lastOk: null, lastError: null, lastFailureAt: null, consecutiveFailures: 0, rateLimitedUntil: null,
      lastLatencyMs: null, avgLatencyMs: null, requests: 0, cacheHits: 0, cacheMisses: 0, staleServes: 0, lastStaleAt: null,
    };
    health.set(provider, h);
  }
  return h;
}

export function markOk(provider: string, latencyMs?: number) {
  const h = get(provider);
  const requests = h.requests + (latencyMs !== undefined ? 1 : 0);
  const avg = latencyMs === undefined ? h.avgLatencyMs : h.avgLatencyMs === null ? latencyMs : Math.round(h.avgLatencyMs * 0.8 + latencyMs * 0.2);
  health.set(provider, { ...h, state: "healthy", lastOk: Date.now(), consecutiveFailures: 0, lastLatencyMs: latencyMs ?? h.lastLatencyMs, avgLatencyMs: avg, requests });
}

export function markFailure(provider: string, error: string, retryAfterMs?: number) {
  const h = get(provider);
  const failures = h.consecutiveFailures + 1;
  health.set(provider, {
    ...h,
    state: failures >= 3 ? "down" : "degraded",
    lastError: error.slice(0, 200),
    lastFailureAt: Date.now(),
    consecutiveFailures: failures,
    requests: h.requests + 1,
    rateLimitedUntil: retryAfterMs ? Date.now() + retryAfterMs : h.rateLimitedUntil,
  });
}

export function markCache(provider: string, kind: "hit" | "miss" | "stale") {
  const h = get(provider);
  health.set(provider, {
    ...h,
    cacheHits: h.cacheHits + (kind === "hit" ? 1 : 0),
    cacheMisses: h.cacheMisses + (kind === "miss" ? 1 : 0),
    staleServes: h.staleServes + (kind === "stale" ? 1 : 0),
    lastStaleAt: kind === "stale" ? Date.now() : h.lastStaleAt,
  });
}

export function setState(provider: string, state: HealthState) {
  health.set(provider, { ...get(provider), state });
}

export function isRateLimited(provider: string): boolean {
  const until = get(provider).rateLimitedUntil;
  return until !== null && until > Date.now();
}

/** Circuit breaker: skip a provider that failed 3x in a row for 60s. */
export function isOpenCircuit(provider: string): boolean {
  const h = get(provider);
  return h.state === "down" && h.lastFailureAt !== null && Date.now() - h.lastFailureAt < 60_000;
}

export function healthOf(provider: string): Health {
  return { ...get(provider) };
}

export function allHealth(): Health[] {
  return [...health.values()];
}

export function resetHealth() {
  health.clear();
}
