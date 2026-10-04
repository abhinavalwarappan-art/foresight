import "server-only";
import { env } from "@/lib/config/env";
import type {
  Game, Injury, InjuryDesignation, NbaPosition, NbaUsage, NflPosition, NflUsage, Player, PlayerGame, Sport, Team,
} from "@/lib/domain/types";
import type { CacheClass } from "@/lib/cache/policy";
import { providerFetch } from "../http";
import { recordRaw, type RawRecord } from "../raw-store";
import type { CacheStatus } from "@/lib/domain/types";
import { liveProv, NotConfiguredError, type Sourced } from "../types";
import type { SportsProvider } from "./types";

/**
 * BALLDONTLIE adapter. Field names verified against the official OpenAPI specs:
 *   https://www.balldontlie.io/openapi/nfl.yml  (NFLTeam, NFLPlayer, NFLGame, NFLStats, NFLPlayerInjury)
 *   https://www.balldontlie.io/openapi/nba.yml  (NBATeam, NBAPlayer, NBAGame, NBAStats, NBAPlayerInjury)
 * Auth: `Authorization: <key>` header. Pagination: `cursor` + `per_page` (≤100), `meta.next_cursor`.
 * Endpoint availability depends on the subscription tier — 401/403 surface as provider errors.
 */
const BASE = "https://api.balldontlie.io";
const NAME = "balldontlie";
const MAX_PAGES = 40;
const unsupported = new Set<string>();

async function optionalTier<T>(capability: string, call: () => Promise<T>): Promise<T> {
  if (unsupported.has(capability)) throw new NotConfiguredError(NAME, `${capability} unavailable on current subscription tier`);
  try { return await call(); }
  catch (e) {
    if (/unauthorized \(40[13]\)/i.test((e as Error).message)) unsupported.add(capability);
    throw e;
  }
}

interface Page<T> {
  data: T[];
  meta?: { next_cursor?: number | null };
}

interface BdlTeam { id: number; abbreviation: string; full_name: string; name: string; location?: string; city?: string; conference: string; division: string }
interface BdlPlayer {
  id: number; first_name: string; last_name: string; position: string; position_abbreviation?: string;
  jersey_number?: string | null; age?: number | null; experience?: string | null; team?: BdlTeam | null;
}
interface BdlGame {
  id: number; date: string; season: number; week?: number; status: string; postseason?: boolean;
  home_team: BdlTeam; visitor_team: BdlTeam; home_team_score: number | null; visitor_team_score: number | null;
  venue?: string | null; datetime?: string;
}
interface BdlNflStats {
  player: BdlPlayer; team: BdlTeam; game: BdlGame;
  passing_attempts?: number | null; passing_yards?: number | null; passing_touchdowns?: number | null; passing_interceptions?: number | null;
  rushing_attempts?: number | null; rushing_yards?: number | null; rushing_touchdowns?: number | null;
  receptions?: number | null; receiving_yards?: number | null; receiving_touchdowns?: number | null; receiving_targets?: number | null;
  fumbles_lost?: number | null;
}
interface BdlNbaStats {
  min: string | null; fgm: number; fga: number; fg3m: number; ftm: number; fta: number; reb: number; ast: number;
  stl: number; blk: number; turnover: number; pts: number; player: BdlPlayer; team: BdlTeam; game: BdlGame;
}
interface BdlInjury { player: BdlPlayer; status: string; comment?: string; description?: string; date?: string; return_date?: string }

function headers() {
  if (!env.BALLDONTLIE_API_KEY) throw new NotConfiguredError(NAME, "BALLDONTLIE_API_KEY");
  return { Authorization: env.BALLDONTLIE_API_KEY };
}

function qs(params: Record<string, string | number | (string | number)[] | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, String(x)));
    else u.append(k, String(v));
  }
  return u.toString();
}

interface PageMeta { endpoint: string; retrievedAt: string; cache: CacheStatus }

async function paginate<T>(path: string, params: Record<string, string | number | (string | number)[] | undefined>, cls: CacheClass) {
  const out: T[] = [];
  const metas: PageMeta[] = []; // parallel to `out`: which page each row came from
  let cursor: number | undefined;
  let stale = false;
  let retrievedAt = new Date().toISOString();
  let cache: CacheStatus = "miss";
  for (let i = 0; i < MAX_PAGES; i++) {
    const url = `${BASE}${path}?${qs({ ...params, per_page: 100, cursor })}`;
    const res = await providerFetch<Page<T>>(url, { provider: NAME, cacheKey: url, cacheClass: cls, headers: headers() });
    if (!res.data || !Array.isArray(res.data.data)) throw new Error(`[${NAME}] malformed paginated response for ${path}`);
    const meta = { endpoint: res.endpoint, retrievedAt: res.retrievedAt, cache: res.cache };
    for (const row of res.data.data) { out.push(row); metas.push(meta); }
    stale ||= res.stale;
    retrievedAt = res.retrievedAt;
    if (res.cache === "stale") cache = "stale";
    else if (res.cache === "hit" && cache !== "stale") cache = "hit";
    const next = res.data.meta?.next_cursor;
    if (!next) break;
    cursor = next;
  }
  return { data: out, metas, retrievedAt, stale, cache };
}

function raw(kind: RawRecord["kind"], entityKey: string, meta: PageMeta, payload: unknown) {
  recordRaw({ provider: NAME, kind, entityKey, endpoint: meta.endpoint, retrievedAt: meta.retrievedAt, cache: meta.cache, payload });
}

const NFL_POS = new Set<NflPosition>(["QB", "RB", "WR", "TE", "K"]);
/** BDL NBA positions are generalized (G, F, C, G-F, F-C…). */
function nbaPos(p: string): NbaPosition | null {
  const first = p.split("-")[0]?.trim();
  if (first === "G") return p.includes("F") ? "SG" : "PG";
  if (first === "F") return p.includes("C") ? "PF" : "SF";
  if (first === "C") return "C";
  return null;
}

export function mapDesignation(status: string): InjuryDesignation {
  const s = status.toLowerCase();
  if (s.includes("reserve") || s === "ir") return "ir";
  if (s.includes("out")) return "out";
  if (s.includes("doubt")) return "doubtful";
  if (s.includes("question")) return "questionable";
  if (s.includes("day")) return "day-to-day";
  if (s.includes("prob")) return "probable";
  return "healthy";
}

export const teamId = (sport: Sport, id: number) => `${sport}-bdl-t${id}`;
export const playerId = (sport: Sport, id: number) => `${sport}-bdl-p${id}`;
export const gameId = (sport: Sport, id: number) => `${sport}-bdl-g${id}`;

export function mapTeam(sport: Sport, t: BdlTeam): Team {
  return { id: teamId(sport, t.id), sport, abbr: t.abbreviation, city: t.location ?? t.city ?? "", name: t.name, conference: t.conference, color: "#64748B" };
}

export function mapPlayer(sport: Sport, p: BdlPlayer): Player | null {
  const pos = sport === "nfl" ? (p.position_abbreviation as NflPosition) : nbaPos(p.position ?? "");
  if (!pos || (sport === "nfl" && !NFL_POS.has(pos as NflPosition)) || !p.team) return null;
  const id = playerId(sport, p.id);
  return {
    id, ids: { internal: id, balldontlie: String(p.id) }, sport, firstName: p.first_name, lastName: p.last_name,
    position: pos, teamId: teamId(sport, p.team.id), jersey: Number(p.jersey_number ?? 0) || 0, age: p.age ?? 0,
    experience: Number.parseInt(p.experience ?? "0", 10) || 0, status: "healthy", depthOrder: 1,
  };
}

const parseMin = (m: string | null) => {
  if (!m) return 0;
  const [a, b] = m.split(":");
  return Number(a) + (Number(b) || 0) / 60;
};

export function mapNflStats(s: BdlNflStats, retrievedAt: string): PlayerGame {
  const n = (v: number | null | undefined) => v ?? 0;
  const usage: NflUsage = {
    snapPct: 0, routePct: 0, // not exposed in the base stats endpoint
    targets: n(s.receiving_targets), targetShare: 0, airYards: 0,
    carries: n(s.rushing_attempts), redZoneOpps: 0, goalLineCarries: 0,
    unavailable: ["snapPct", "routePct", "targetShare", "airYards", "redZoneOpps", "goalLineCarries"],
  };
  if (s.receiving_targets == null) usage.unavailable!.push("targets");
  const home = s.game.home_team.id === s.team.id;
  return {
    playerId: playerId("nfl", s.player.id), gameId: gameId("nfl", s.game.id), week: s.game.week ?? 0,
    opponentTeamId: teamId("nfl", home ? s.game.visitor_team.id : s.game.home_team.id), played: true,
    stats: {
      pass_att: n(s.passing_attempts), pass_yds: n(s.passing_yards), pass_td: n(s.passing_touchdowns), pass_int: n(s.passing_interceptions),
      rush_att: n(s.rushing_attempts), rush_yds: n(s.rushing_yards), rush_td: n(s.rushing_touchdowns),
      rec: n(s.receptions), rec_yds: n(s.receiving_yards), rec_td: n(s.receiving_touchdowns), targets: n(s.receiving_targets), fum_lost: n(s.fumbles_lost),
    },
    usage, provenance: liveProv(NAME, retrievedAt),
  };
}

export function mapNbaStats(s: BdlNbaStats, week: number, retrievedAt: string): PlayerGame {
  const min = parseMin(s.min);
  const plays = s.fga + 0.44 * s.fta + s.turnover;
  const usage: NbaUsage = {
    minutes: Math.round(min * 10) / 10,
    usagePct: min > 0 ? Math.round(((48 * plays) / min) * 10) / 10 : 0, // estimate: plays/min scaled to team possessions
    touches: 0, potentialAssists: 0, reboundChances: 0, // tracking data not in base stats
    fga: s.fga, started: false,
    unavailable: ["touches", "potentialAssists", "reboundChances", "started"],
    estimated: ["usagePct"],
  };
  const home = s.game.home_team.id === s.team.id;
  return {
    playerId: playerId("nba", s.player.id), gameId: gameId("nba", s.game.id), week,
    opponentTeamId: teamId("nba", home ? s.game.visitor_team.id : s.game.home_team.id), played: min > 0,
    stats: { pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, tov: s.turnover, fg3m: s.fg3m, fgm: s.fgm, fga: s.fga, ftm: s.ftm, fta: s.fta, min },
    usage, provenance: liveProv(NAME, retrievedAt),
  };
}

const done = (status: string) => /final/i.test(status);

export const balldontlie: SportsProvider = {
  name: NAME,
  isConfigured: () => Boolean(env.BALLDONTLIE_API_KEY),
  supports: () => true,

  async getTeams(sport) {
    const r = await paginate<BdlTeam>(`/${sport}/v1/teams`, {}, "player_meta");
    r.data.forEach((t, i) => raw("team", `team:${teamId(sport, t.id)}`, r.metas[i], t));
    return { data: r.data.map((t) => mapTeam(sport, t)), provenance: liveProv(NAME, r.retrievedAt, r.stale, r.cache) };
  },

  async getPlayers(sport) {
    // The base player endpoint is available on all tiers. `/players/active` is paid.
    const r = await paginate<BdlPlayer>(`/${sport}/v1/players`, {}, "player_meta");
    r.data.forEach((p, i) => raw("player", `player:${playerId(sport, p.id)}`, r.metas[i], p));
    return { data: r.data.map((p) => mapPlayer(sport, p)).filter((p): p is Player => p !== null), provenance: liveProv(NAME, r.retrievedAt, r.stale, r.cache) };
  },

  async searchPlayers(sport, query) {
    const r = await paginate<BdlPlayer>(`/${sport}/v1/players`, { search: query }, "player_meta");
    const data = r.data.map((p) => mapPlayer(sport, p)).filter((p): p is Player => p !== null).slice(0, 30);
    data.forEach((p) => {
      const source = r.data.find((x) => String(x.id) === p.ids.balldontlie);
      if (source) raw("player", `player:${p.id}`, r.metas[r.data.indexOf(source)], source);
    });
    return { data, provenance: liveProv(NAME, r.retrievedAt, r.stale, r.cache) };
  },

  async getPlayersByIds(sport, ids) {
    const providerIds = ids.map((id) => Number(id.split("-p").pop())).filter(Number.isFinite);
    if (!providerIds.length) return { data: [], provenance: liveProv(NAME, new Date().toISOString()) };
    const r = await paginate<BdlPlayer>(`/${sport}/v1/players`, { "player_ids[]": providerIds }, "player_meta");
    return { data: r.data.map((p) => mapPlayer(sport, p)).filter((p): p is Player => p !== null), provenance: liveProv(NAME, r.retrievedAt, r.stale, r.cache) };
  },

  async getGames(sport, season) {
    // An NBA season is ~1,230 games and exceeds the free tier's request window when
    // fully paginated. The application only consumes recent form and the upcoming
    // slate, so bound NBA requests to that analysis window. NFL fits in a few pages.
    const now = Date.now();
    const params = sport === "nba"
      ? { start_date: isoDate(now - 24 * 86_400_000), end_date: isoDate(now + 21 * 86_400_000) }
      : { "seasons[]": [season] };
    const r = await paginate<BdlGame>(`/${sport}/v1/games`, params, "historical_games");
    r.data.forEach((g, i) => raw("game", `game:${gameId(sport, g.id)}`, r.metas[i], g));
    const games: Game[] = r.data.map((g) => ({
      id: gameId(sport, g.id), sport, season: g.season,
      week: g.week ?? weekFromDate(g.date, season), date: g.datetime ?? g.date, venue: g.venue ?? null,
      homeTeamId: teamId(sport, g.home_team.id), awayTeamId: teamId(sport, g.visitor_team.id),
      status: done(g.status) ? "final" : /\d{4}-/.test(g.status) || /pm|am|scheduled/i.test(g.status) ? "scheduled" : "live",
      homeScore: g.home_team_score, awayScore: g.visitor_team_score,
    }));
    return { data: games, provenance: liveProv(NAME, r.retrievedAt, r.stale, r.cache) };
  },

  async getPlayerGames(sport, season, gameIds): Promise<Sourced<PlayerGame[]>> {
    if (unsupported.has(`${sport}:stats`)) throw new NotConfiguredError(NAME, `${sport} stats unavailable on current subscription tier`);
    const ids = gameIds.map((g) => Number(g.split("-g").pop())).filter(Number.isFinite);
    const out: PlayerGame[] = [];
    let retrievedAt = new Date().toISOString();
    let stale = false;
    // chunk game ids to keep URLs short
    for (let i = 0; i < ids.length; i += 25) {
      const chunk = ids.slice(i, i + 25);
      if (sport === "nfl") {
        const r = await optionalTier(`${sport}:stats`, () => paginate<BdlNflStats>(`/nfl/v1/stats`, { "game_ids[]": chunk, "seasons[]": [season] }, "completed_stats"));
        r.data.forEach((s, j) => raw("stats", `player:${playerId("nfl", s.player.id)}`, r.metas[j], s));
        out.push(...r.data.map((s) => mapNflStats(s, r.retrievedAt)));
        retrievedAt = r.retrievedAt; stale ||= r.stale;
      } else {
        const r = await optionalTier(`${sport}:stats`, () => paginate<BdlNbaStats>(`/nba/v1/stats`, { "game_ids[]": chunk }, "completed_stats"));
        r.data.forEach((s, j) => raw("stats", `player:${playerId("nba", s.player.id)}`, r.metas[j], s));
        out.push(...r.data.map((s) => mapNbaStats(s, weekFromDate(s.game.date, season), r.retrievedAt)));
        retrievedAt = r.retrievedAt; stale ||= r.stale;
      }
    }
    return { data: out, provenance: liveProv(NAME, retrievedAt, stale) };
  },

  async getInjuries(sport) {
    const r = await optionalTier(`${sport}:injuries`, () => paginate<BdlInjury>(`/${sport}/v1/player_injuries`, {}, "injuries"));
    r.data.forEach((i, j) => raw("injury", `player:${playerId(sport, i.player.id)}`, r.metas[j], i));
    const data: Injury[] = r.data.map((i) => ({
      playerId: playerId(sport, i.player.id), designation: mapDesignation(i.status), bodyPart: null, practice: [],
      minutesRestriction: null, note: i.comment ?? i.description ?? null, reportedAt: i.date ?? r.retrievedAt,
      provenance: liveProv(NAME, r.retrievedAt, r.stale, r.cache),
    }));
    return { data, provenance: liveProv(NAME, r.retrievedAt, r.stale, r.cache) };
  },
};

/** NBA has no "week": bucket by Monday-start fantasy weeks from the season opener (~Oct 20). */
export function weekFromDate(date: string, season: number): number {
  const opener = Date.UTC(season, 9, 20);
  return Math.max(1, Math.floor((Date.parse(date) - opener) / (7 * 86_400_000)) + 1);
}

const isoDate = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
