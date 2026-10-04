import "server-only";
import { env, resolvedAiProvider } from "@/lib/config/env";
import { healthOf, isRateLimited } from "@/lib/providers/health";

export type ProviderStatusLabel = "NOT CONFIGURED" | "CONFIGURED" | "CONNECTED" | "ERROR" | "RATE LIMITED" | "STALE";

export interface ProviderHealthRow {
  id: string;
  name: string;
  domain: string;
  configured: boolean;
  status: ProviderStatusLabel;
  note: string;
  lastSuccess: string | null;
  lastFailure: string | null;
  lastError: string | null;
  latencyMs: number | null;
  avgLatencyMs: number | null;
  requests: number;
  cacheHits: number;
  cacheMisses: number;
  staleServes: number;
}

const iso = (t: number | null) => (t ? new Date(t).toISOString() : null);

/** Booleans + telemetry only. Key material never leaves env.ts. */
export function providerHealthRows(): ProviderHealthRow[] {
  const defs: { id: string; name: string; domain: string; configured: boolean; note?: string }[] = [
    { id: "balldontlie", name: "BALLDONTLIE", domain: "sports", configured: Boolean(env.BALLDONTLIE_API_KEY) },
    { id: "sportsdataio", name: "SportsDataIO", domain: "sports", configured: Boolean(env.SPORTSDATAIO_API_KEY), note: "adapter stub — pending verification" },
    { id: "sportradar", name: "Sportradar", domain: "sports", configured: Boolean(env.SPORTRADAR_API_KEY_NBA || env.SPORTRADAR_API_KEY_NFL), note: "adapter stub — pending verification" },
    { id: "sleeper", name: "Sleeper", domain: "fantasy", configured: true, note: "public API, no key required" },
    { id: "yahoo", name: "Yahoo Fantasy", domain: "fantasy", configured: Boolean(env.YAHOO_CLIENT_ID && env.YAHOO_CLIENT_SECRET), note: "OAuth only; league sync pending" },
    { id: "the-odds-api", name: "The Odds API", domain: "odds", configured: Boolean(env.THE_ODDS_API_KEY) },
    { id: "exa", name: "Exa", domain: "research", configured: Boolean(env.EXA_API_KEY) },
    { id: "deepseek", name: "DeepSeek", domain: "ai", configured: Boolean(env.DEEPSEEK_API_KEY), note: resolvedAiProvider() === "deepseek" ? "active AI provider" : "inactive" },
    { id: "openai", name: "OpenAI", domain: "ai", configured: Boolean(env.OPENAI_API_KEY), note: resolvedAiProvider() === "openai" ? "active AI provider" : "inactive" },
    { id: "gemini", name: "Gemini", domain: "ai", configured: Boolean(env.GEMINI_API_KEY), note: resolvedAiProvider() === "gemini" ? "active AI provider" : "inactive" },
  ];
  return defs.map((d) => {
    const h = healthOf(d.id);
    let status: ProviderStatusLabel;
    if (!d.configured) status = "NOT CONFIGURED";
    else if (isRateLimited(d.id)) status = "RATE LIMITED";
    else if (h.lastFailureAt && (!h.lastOk || h.lastFailureAt > h.lastOk)) status = "ERROR";
    else if (h.lastStaleAt && (!h.lastOk || h.lastStaleAt > h.lastOk)) status = "STALE";
    else if (h.lastOk) status = "CONNECTED";
    else status = "CONFIGURED";
    return {
      id: d.id, name: d.name, domain: d.domain, configured: d.configured, status,
      note: d.note ?? (env.DATA_MODE === "mock" ? "not called in mock mode" : ""),
      lastSuccess: iso(h.lastOk), lastFailure: iso(h.lastFailureAt), lastError: h.lastError,
      latencyMs: h.lastLatencyMs, avgLatencyMs: h.avgLatencyMs, requests: h.requests,
      cacheHits: h.cacheHits, cacheMisses: h.cacheMisses, staleServes: h.staleServes,
    };
  });
}
