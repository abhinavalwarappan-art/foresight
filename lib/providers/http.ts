import "server-only";
import { cacheGet, cacheSet } from "@/lib/cache/store";
import { CACHE_POLICY, type CacheClass } from "@/lib/cache/policy";
import type { CacheStatus } from "@/lib/domain/types";
import { isOpenCircuit, isRateLimited, markCache, markFailure, markOk } from "./health";

export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public status?: number,
  ) {
    super(`[${provider}] ${message}`);
  }
}

export interface FetchResult<T> {
  data: T;
  fromCache: boolean;
  stale: boolean;
  retrievedAt: string;
  cache: CacheStatus;
  endpoint: string; // sanitized: host + path + non-secret query
  latencyMs: number | null;
}

const SECRET_PARAMS = /^(api_?key|apikey|key|token|access_token|client_secret)$/i;

/** URL safe to log/display: secret-looking query params are removed. */
export function sanitizeUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (SECRET_PARAMS.test(k)) u.searchParams.set(k, "[REDACTED]");
    return `${u.host}${u.pathname}${u.search ? decodeURIComponent(u.search) : ""}`;
  } catch {
    return "[unparseable url]";
  }
}

interface Opts {
  provider: string;
  cacheKey: string;
  cacheClass: CacheClass;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The only way provider adapters touch the network.
 * cache → circuit/rate-limit check → fetch w/ timeout + retry → stale-cache fallback.
 * Never fabricates data: on total failure it throws, and the registry decides
 * whether a fallback provider exists.
 */
export async function providerFetch<T>(url: string, opts: Opts): Promise<FetchResult<T>> {
  const { provider, cacheKey, cacheClass, headers, timeoutMs = 8_000, retries = 2 } = opts;
  const endpoint = sanitizeUrl(url);
  const hit = cacheGet<T>(cacheKey);
  if (hit?.fresh) {
    markCache(provider, "hit");
    console.info(JSON.stringify({ event: "provider_request", provider, endpoint, cache: "hit", success: true, durationMs: 0 }));
    return { data: hit.value, fromCache: true, stale: false, retrievedAt: new Date(hit.storedAt).toISOString(), cache: "hit", endpoint, latencyMs: null };
  }
  markCache(provider, "miss");

  const serveStale = (reason: string): FetchResult<T> => {
    if (hit) {
      markCache(provider, "stale");
      return { data: hit.value, fromCache: true, stale: true, retrievedAt: new Date(hit.storedAt).toISOString(), cache: "stale", endpoint, latencyMs: null };
    }
    throw new ProviderError(provider, reason);
  };

  if (isOpenCircuit(provider)) return serveStale("circuit open");
  if (isRateLimited(provider)) return serveStale("rate limited");

  let lastErr = "unknown error";
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const started = Date.now();
    try {
      // Next's Data Cache persists across Vercel serverless instances. The
      // process-local cache remains the fast/stale layer, while this shared
      // layer prevents every cold function from spending provider quota.
      const revalidate = Math.max(1, Math.floor(CACHE_POLICY[cacheClass].ttl / 1000));
      const res = await fetch(url, { headers, signal: ctrl.signal, cache: "force-cache", next: { revalidate } });
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "30") * 1000;
        markFailure(provider, "429 rate limited", retryAfter);
        return serveStale("rate limited");
      }
      if (res.status === 401 || res.status === 403) {
        markFailure(provider, `auth ${res.status}`);
        return serveStale(`unauthorized (${res.status}) — check API key / subscription tier`);
      }
      if (!res.ok) throw new ProviderError(provider, `HTTP ${res.status}`, res.status);
      const data = (await res.json()) as T;
      cacheSet(cacheKey, cacheClass, data);
      const latencyMs = Date.now() - started;
      markOk(provider, latencyMs);
      console.info(JSON.stringify({ event: "provider_request", provider, endpoint, cache: "miss", success: true, durationMs: latencyMs }));
      return { data, fromCache: false, stale: false, retrievedAt: new Date().toISOString(), cache: "miss", endpoint, latencyMs };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt < retries) await sleep(250 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  markFailure(provider, lastErr);
  console.warn(JSON.stringify({ event: "provider_request", provider, endpoint, cache: hit ? "stale" : "miss", success: false, error: lastErr }));
  return serveStale(lastErr);
}
