/**
 * Normalized internal entities. Every provider adapter maps INTO these shapes;
 * nothing outside lib/providers/* may depend on provider-specific payloads.
 */

export type Sport = "nfl" | "nba";
export const SPORTS: readonly Sport[] = ["nfl", "nba"] as const;

export type NflPosition = "QB" | "RB" | "WR" | "TE" | "K" | "DST";
export type NbaPosition = "PG" | "SG" | "SF" | "PF" | "C";
export type Position = NflPosition | NbaPosition;

/** What kind of truth a value represents. The UI must never blur these. */
export type DataKind = "observed" | "calculated" | "projected" | "market" | "ai";

export interface Provenance {
  source: string; // e.g. "balldontlie", "sleeper", "mock", "model:projection@1.2.0"
  sourceTimestamp: string | null; // when the source says the data is from
  retrievedAt: string; // when we fetched/computed it
  confidence: number | null; // 0..1 when meaningful
  isProjection: boolean;
  kind: DataKind;
  stale?: boolean; // served from cache after a provider failure
  cache?: CacheStatus;
}

/** How a value reached us: fresh network call, cache, stale fallback, or the mock generator. */
export type CacheStatus = "miss" | "hit" | "stale" | "mock" | "computed";

export interface ProviderIds {
  internal: string;
  balldontlie?: string;
  sleeper?: string;
  yahoo?: string;
  sportsdataio?: string;
  sportradar?: string;
}

export interface Team {
  id: string;
  sport: Sport;
  abbr: string;
  city: string;
  name: string;
  conference: string;
  color: string; // hex, used for subtle badge tint only
}

export type InjuryDesignation =
  | "healthy"
  | "probable"
  | "questionable"
  | "doubtful"
  | "out"
  | "ir"
  | "day-to-day";

export interface Player {
  id: string;
  ids: ProviderIds;
  sport: Sport;
  firstName: string;
  lastName: string;
  position: Position;
  teamId: string;
  jersey: number;
  age: number;
  experience: number;
  status: InjuryDesignation;
  depthOrder: number; // 1 = starter at position
}

export interface Game {
  id: string;
  sport: Sport;
  season: number;
  week: number; // NFL week, or NBA "slate index"
  date: string;
  homeTeamId: string;
  awayTeamId: string;
  status: "scheduled" | "live" | "final";
  homeScore: number | null;
  awayScore: number | null;
  venue?: string | null;
}

export interface WeatherContext {
  gameId: string;
  relevant: boolean;
  roof: "outdoor" | "retractable" | "dome" | "unknown";
  temperatureF: number | null;
  windMph: number | null;
  windGustMph: number | null;
  precipitationProbability: number | null;
  precipitationIn: number | null;
  humidity: number | null;
  condition: string | null;
  forecastTimestamp: string | null;
  provenance: Provenance;
}

/** Raw counting stats keyed by stat code (see lib/scoring). */
export type StatLine = Record<string, number>;

/** Opportunity signals are kept separate from production. */
export interface NflUsage {
  snapPct: number;
  routePct: number;
  targets: number;
  targetShare: number;
  airYards: number;
  carries: number;
  redZoneOpps: number;
  goalLineCarries: number;
  /** Fields the source did not provide (stored as 0). Never treat these as observed zeros. */
  unavailable?: (keyof Omit<NflUsage, "unavailable">)[];
}

export interface NbaUsage {
  minutes: number;
  usagePct: number;
  touches: number;
  fga: number;
  potentialAssists: number;
  reboundChances: number;
  started: boolean;
  /** Fields the source did not provide (stored as 0/false). */
  unavailable?: (keyof Omit<NbaUsage, "unavailable" | "estimated">)[];
  /** Fields derived by us rather than reported by the source. */
  estimated?: (keyof Omit<NbaUsage, "unavailable" | "estimated">)[];
}

export interface PlayerGame {
  playerId: string;
  gameId: string;
  week: number;
  opponentTeamId: string;
  played: boolean;
  stats: StatLine;
  usage: NflUsage | NbaUsage;
  provenance: Provenance;
}

export interface Injury {
  playerId: string;
  designation: InjuryDesignation;
  bodyPart: string | null;
  practice: ("DNP" | "LP" | "FP")[]; // NFL practice week
  minutesRestriction: number | null; // NBA
  note: string | null;
  reportedAt: string;
  provenance: Provenance;
}

export interface InjuryHistoryEntry {
  playerId: string;
  season: number;
  bodyPart: string;
  gamesMissed: number;
}

export interface DepthChartEntry {
  teamId: string;
  position: Position;
  playerId: string;
  order: number;
  provenance: Provenance;
}

export interface GameMarket {
  gameId: string;
  spread: number; // home spread (negative = home favored)
  total: number;
  homeImpliedTotal: number;
  awayImpliedTotal: number;
  provenance: Provenance;
}

export interface MarketProjection {
  playerId: string;
  stat: string; // e.g. "pass_yds", "pts"
  line: number;
  provenance: Provenance;
}

export interface Projection {
  /** False means required observed inputs were unavailable; numeric fields are non-authoritative sentinels. */
  available?: boolean;
  playerId: string;
  week: number;
  median: number;
  floor: number; // ~20th percentile
  ceiling: number; // ~80th percentile
  confidence: number; // 0..1
  variance: number;
  rosValue: number; // rest-of-season value, 0..100
  gamesInWeek: number; // NFL 0/1, NBA 2–5
  weeklyMedian: number; // median × gamesInWeek
  playProbability: number; // 0..1 from the availability engine
  modelVersion: string;
  provenance: Provenance;
}

// ─── Fantasy context ─────────────────────────────────────────────

export type ScoringFormat = "ppr" | "half" | "standard" | "nba_points" | "nba_9cat";

export interface ScoringSettings {
  format: ScoringFormat;
  /** stat code → points per unit. Category leagues ignore this. */
  weights: Record<string, number>;
}

export type RosterSlot =
  | "QB" | "RB" | "WR" | "TE" | "FLEX" | "SUPER_FLEX" | "WRRB_FLEX" | "REC_FLEX" | "K" | "DST"
  | "PG" | "SG" | "SF" | "PF" | "C" | "G" | "F" | "UTIL"
  | "BN" | "IR";

export interface FantasyLeague {
  id: string;
  sport: Sport;
  provider: "sleeper" | "yahoo" | "manual" | "mock";
  name: string;
  season: number;
  currentWeek: number;
  totalWeeks: number;
  playoffTeams: number;
  scoring: ScoringSettings;
  slots: RosterSlot[];
  provenance: Provenance;
}

export interface FantasyTeam {
  id: string;
  leagueId: string;
  name: string;
  manager: string;
  isUser: boolean;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface FantasyRoster {
  teamId: string;
  /** Provider-reported active lineup, in provider slot order when available. */
  starterIds?: string[];
  playerIds: string[];
  irIds: string[];
}

export interface FantasyMatchup {
  leagueId: string;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homePoints: number | null;
  awayPoints: number | null;
}

export interface FantasyTransaction {
  id: string;
  leagueId: string;
  type: "trade" | "waiver" | "free_agent" | "drop";
  teamIds: string[];
  adds: { playerId: string; teamId: string }[];
  drops: { playerId: string; teamId: string }[];
  createdAt: string;
}

// ─── Research ────────────────────────────────────────────────────

export type ResearchEventType =
  | "injury_update"
  | "practice_report"
  | "role_change"
  | "minutes_restriction"
  | "lineup_change"
  | "depth_chart_change"
  | "trade"
  | "suspension"
  | "rest";

export interface ResearchEvent {
  id: string;
  playerId: string;
  eventType: ResearchEventType;
  direction: "increase" | "decrease" | "neutral";
  confidence: number;
  summary: string; // our own neutral paraphrase — never raw scraped text
  timestamp: string;
  sources: { title: string; url: string; publisher: string }[];
}
