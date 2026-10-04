import "server-only";
import { env } from "@/lib/config/env";
import type { ResearchEvent } from "@/lib/domain/types";
import { cacheGet, cacheSet } from "@/lib/cache/store";
import { markFailure, markOk } from "../health";
import { liveProv, NotConfiguredError } from "../types";
import { classifyText } from "./classify";
import type { ResearchProvider } from "./types";

/** Exa search — https://exa.ai/docs/reference/search  (POST /search, x-api-key header). */
const NAME = "exa";

interface ExaResult { title: string; url: string; publishedDate?: string; text?: string; author?: string }

export const exa: ResearchProvider = {
  name: NAME,
  isConfigured: () => Boolean(env.EXA_API_KEY),
  async research(player, team) {
    if (!env.EXA_API_KEY) throw new NotConfiguredError(NAME, "EXA_API_KEY");
    const key = `exa:${player.id}`;
    const hit = cacheGet<ResearchEvent[]>(key);
    if (hit?.fresh) return { data: hit.value, provenance: liveProv(NAME, new Date(hit.storedAt).toISOString()) };
    const query = `${player.firstName} ${player.lastName} ${team ? `${team.city} ${team.name}` : ""} injury practice role news`;
    try {
      const res = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: { "x-api-key": env.EXA_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ query, type: "auto", numResults: 6, startPublishedDate: new Date(Date.now() - 10 * 86_400_000).toISOString(), contents: { text: { maxCharacters: 3000 } } }),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { results?: ExaResult[] };
      const events: ResearchEvent[] = [];
      for (const [i, r] of (json.results ?? []).entries()) {
        const c = classifyText(`${r.title}\n${r.text ?? ""}`);
        if (!c) continue;
        let host = "source";
        try { host = new URL(r.url).hostname.replace(/^www\./, ""); } catch { continue; }
        events.push({
          id: `exa-${player.id}-${i}`, playerId: player.id, eventType: c.type, direction: c.dir, confidence: 0.45,
          summary: c.summary, timestamp: r.publishedDate ?? new Date().toISOString(),
          sources: [{ title: r.title.slice(0, 160), url: r.url, publisher: host }],
        });
      }
      cacheSet(key, "research", events);
      markOk(NAME);
      return { data: events, provenance: liveProv(NAME, new Date().toISOString()) };
    } catch (e) {
      markFailure(NAME, e instanceof Error ? e.message : String(e));
      if (hit) return { data: hit.value, provenance: liveProv(NAME, new Date(hit.storedAt).toISOString(), true) };
      throw e;
    }
  },
};
