import "server-only";
import { env } from "@/lib/config/env";
import type { GameMarket } from "@/lib/domain/types";
import { providerFetch } from "../http";
import { recordRaw } from "../raw-store";
import { NotConfiguredError } from "../types";
import type { OddsProvider } from "./types";

/**
 * The Odds API v4 — https://the-odds-api.com/liveapi/guides/v4/
 *   GET /v4/sports/{americanfootball_nfl|basketball_nba}/odds/?apiKey&regions=us&markets=spreads,totals&oddsFormat=american
 * Cost = markets × regions per call (2 here); cached 5 min under the "odds" policy.
 * Events are matched to our games by full team name + kickoff within 36h.
 */
const NAME = "the-odds-api";
const SPORT_KEY = { nfl: "americanfootball_nfl", nba: "basketball_nba" } as const;

interface OddsEvent {
  id: string; commence_time: string; home_team: string; away_team: string;
  bookmakers: { key: string; last_update: string; markets: { key: string; outcomes: { name: string; price: number; point?: number }[] }[] }[];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

export const theOddsApi: OddsProvider = {
  name: NAME,
  isConfigured: () => Boolean(env.THE_ODDS_API_KEY),
  async getGameMarkets(sport, games, teams) {
    if (!env.THE_ODDS_API_KEY) throw new NotConfiguredError(NAME, "THE_ODDS_API_KEY");
    const url = `https://api.the-odds-api.com/v4/sports/${SPORT_KEY[sport]}/odds/?${new URLSearchParams({ apiKey: env.THE_ODDS_API_KEY, regions: "us", markets: "spreads,totals", oddsFormat: "american" })}`;
    const res = await providerFetch<OddsEvent[]>(url, { provider: NAME, cacheKey: `odds:${sport}`, cacheClass: "odds" });
    const full = (id: string) => {
      const t = teams.find((x) => x.id === id);
      return t ? `${t.city} ${t.name}`.toLowerCase() : "";
    };
    const out: GameMarket[] = [];
    for (const g of games.filter((x) => x.status === "scheduled")) {
      const ev = res.data.find((e) => e.home_team.toLowerCase() === full(g.homeTeamId) && e.away_team.toLowerCase() === full(g.awayTeamId) && Math.abs(Date.parse(e.commence_time) - Date.parse(g.date)) < 36 * 3600_000);
      if (!ev) continue;
      recordRaw({ provider: NAME, kind: "odds", entityKey: `game:${g.id}`, endpoint: res.endpoint, retrievedAt: res.retrievedAt, cache: res.cache, payload: ev });
      const spreads = ev.bookmakers.flatMap((b) => b.markets.filter((m) => m.key === "spreads").flatMap((m) => m.outcomes.filter((o) => o.name === ev.home_team).map((o) => o.point ?? NaN)));
      const totals = ev.bookmakers.flatMap((b) => b.markets.filter((m) => m.key === "totals").flatMap((m) => m.outcomes.filter((o) => o.name === "Over").map((o) => o.point ?? NaN)));
      const spread = median(spreads.filter(Number.isFinite));
      const total = median(totals.filter(Number.isFinite));
      if (!Number.isFinite(spread) || !Number.isFinite(total)) continue;
      out.push({
        gameId: g.id, spread, total, homeImpliedTotal: Math.round((total / 2 - spread / 2) * 10) / 10, awayImpliedTotal: Math.round((total / 2 + spread / 2) * 10) / 10,
        provenance: { source: NAME, sourceTimestamp: ev.bookmakers[0]?.last_update ?? null, retrievedAt: res.retrievedAt, confidence: null, isProjection: false, kind: "market", stale: res.stale },
      });
    }
    return { data: out, provenance: { source: NAME, sourceTimestamp: null, retrievedAt: res.retrievedAt, confidence: null, isProjection: false, kind: "market", stale: res.stale } };
  },
};
