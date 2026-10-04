/**
 * Central cache policy. Every provider call declares a data class; TTLs live here
 * and nowhere else. `staleFor` is how long an expired entry may still be served
 * (clearly marked stale) when the provider is failing.
 */
export type CacheClass =
  | "player_meta"
  | "historical_games"
  | "completed_stats"
  | "season_stats"
  | "injuries"
  | "lineups"
  | "depth_charts"
  | "odds"
  | "live_games"
  | "fantasy_league"
  | "fantasy_rosters"
  | "research";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const CACHE_POLICY: Record<CacheClass, { ttl: number; staleFor: number }> = {
  player_meta: { ttl: DAY, staleFor: 7 * DAY },
  historical_games: { ttl: 7 * DAY, staleFor: 30 * DAY },
  completed_stats: { ttl: 7 * DAY, staleFor: 30 * DAY },
  season_stats: { ttl: 6 * HOUR, staleFor: 3 * DAY },
  injuries: { ttl: 10 * MIN, staleFor: 6 * HOUR },
  lineups: { ttl: 5 * MIN, staleFor: 2 * HOUR },
  depth_charts: { ttl: HOUR, staleFor: DAY },
  odds: { ttl: 5 * MIN, staleFor: HOUR },
  live_games: { ttl: 15_000, staleFor: 5 * MIN },
  fantasy_league: { ttl: 30 * MIN, staleFor: DAY },
  fantasy_rosters: { ttl: 5 * MIN, staleFor: 6 * HOUR },
  research: { ttl: 15 * MIN, staleFor: 12 * HOUR },
};
