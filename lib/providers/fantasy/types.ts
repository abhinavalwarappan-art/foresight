import type {
  FantasyLeague, FantasyMatchup, FantasyRoster, FantasyTeam, FantasyTransaction, Sport,
} from "@/lib/domain/types";
import type { ExternalPlayerRef } from "@/lib/ids/mapping";
import type { Sourced } from "../types";

/**
 * A league as one provider sees it. Player IDs are in the PROVIDER's namespace;
 * the registry maps them to internal IDs via lib/ids/mapping before analytics run.
 */
export interface FantasyLeagueBundle {
  league: FantasyLeague;
  teams: FantasyTeam[];
  rosters: FantasyRoster[];
  matchups: FantasyMatchup[];
  transactions: FantasyTransaction[];
  players: ExternalPlayerRef[];
  /** Provider depth chart / status hints keyed by provider player id. */
  hints: Record<string, { depthOrder?: number; injury?: string | null }>;
}

export interface LeagueSummary {
  id: string;
  name: string;
  sport: Sport;
  season: number;
  teams: number;
}

export interface FantasyProvider {
  readonly name: "sleeper" | "yahoo" | "mock";
  isConfigured(): boolean;
  listLeagues(user: string, sport: Sport, season: number): Promise<Sourced<LeagueSummary[]>>;
  getLeague(leagueId: string, opts: { userId?: string; sport: Sport }): Promise<Sourced<FantasyLeagueBundle>>;
}
