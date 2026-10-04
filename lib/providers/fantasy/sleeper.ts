import "server-only";
import type {
  FantasyMatchup, FantasyRoster, FantasyTeam, FantasyTransaction, RosterSlot, ScoringSettings, Sport,
} from "@/lib/domain/types";
import type { ExternalPlayerRef } from "@/lib/ids/mapping";
import { cacheDeletePrefix } from "@/lib/cache/store";
import { SCORING_PRESETS } from "@/lib/scoring";
import { providerFetch } from "../http";
import { recordRaw } from "../raw-store";
import { liveProv } from "../types";
import type { FantasyLeagueBundle, FantasyProvider } from "./types";

/**
 * Sleeper public read-only API (no key). Endpoints from https://docs.sleeper.com:
 *   /v1/user/<username|id>, /v1/user/<id>/leagues/<sport>/<season>, /v1/league/<id>,
 *   /v1/league/<id>/{rosters,users,matchups/<week>,transactions/<round>}, /v1/state/<sport>, /v1/players/<sport>
 * Guidance: stay under 1000 calls/min; fetch /players at most daily (≈5MB) — cached as player_meta.
 */
const BASE = "https://api.sleeper.app/v1";
const NAME = "sleeper";

interface SlLeague {
  league_id: string; name: string; sport: string; season: string; total_rosters: number;
  status?: string;
  settings: { playoff_teams?: number; playoff_week_start?: number; last_scored_leg?: number };
  scoring_settings: Record<string, number>; roster_positions: string[];
}
interface SlUser { user_id: string; display_name: string; metadata?: { team_name?: string } }
interface SlRoster {
  roster_id: number; owner_id: string | null; players: string[] | null; starters?: string[] | null; reserve: string[] | null;
  settings: { wins?: number; losses?: number; ties?: number; fpts?: number; fpts_decimal?: number; fpts_against?: number; fpts_against_decimal?: number };
}
interface SlMatchup { roster_id: number; matchup_id: number | null; points: number | null; starters?: string[]; players?: string[] }
interface SlTransaction {
  transaction_id: string; type: string; status: string; roster_ids: number[];
  adds: Record<string, number> | null; drops: Record<string, number> | null; created: number;
}
interface SlPlayer {
  player_id: string; first_name: string; last_name: string; position: string | null; team: string | null;
  injury_status: string | null; depth_chart_order: number | null;
}

const get = async <T>(path: string, cacheClass: Parameters<typeof providerFetch>[1]["cacheClass"]) =>
  providerFetch<T>(`${BASE}${path}`, { provider: NAME, cacheKey: `sleeper:${path}`, cacheClass, timeoutMs: path.startsWith("/players") ? 20_000 : 8_000 });

/** Sleeper scoring keys → our stat codes. Unknown keys are ignored (documented). */
const SCORING_MAP: Record<string, string> = {
  pass_yd: "pass_yds", pass_td: "pass_td", pass_int: "pass_int", rush_yd: "rush_yds", rush_td: "rush_td",
  rec: "rec", rec_yd: "rec_yds", rec_td: "rec_td", fum_lost: "fum_lost", pass_2pt: "two_pt", rush_2pt: "two_pt", rec_2pt: "two_pt",
  bonus_pass_yd_300: "bonus_pass_yd_300", bonus_pass_yd_400: "bonus_pass_yd_400",
  bonus_rush_yd_100: "bonus_rush_yd_100", bonus_rush_yd_200: "bonus_rush_yd_200",
  bonus_rec_yd_100: "bonus_rec_yd_100", bonus_rec_yd_200: "bonus_rec_yd_200",
  fg_0_19: "fg_0_19", fg_20_29: "fg_20_29", fg_30_39: "fg_30_39", fg_40_49: "fg_40_49", fg_50p: "fg_50p",
  fgmiss: "fg_miss", xpm: "xp_made", xpmiss: "xp_miss",
  def_td: "dst_td", def_st_td: "dst_st_td", def_int: "dst_int", def_fr: "dst_fum_rec", def_sack: "dst_sack", def_safe: "dst_safety",
  def_pa: "dst_points_allowed", def_0: "dst_pa_0", def_1_6: "dst_pa_1_6", def_7_13: "dst_pa_7_13", def_14_20: "dst_pa_14_20", def_21_27: "dst_pa_21_27", def_28_34: "dst_pa_28_34", def_35p: "dst_pa_35p",
  pts: "pts", reb: "reb", ast: "ast", stl: "stl", blk: "blk", to: "tov", tpm: "fg3m",
};

export function mapScoring(sport: Sport, s: Record<string, number>): ScoringSettings {
  const weights: Record<string, number> = {};
  for (const [k, v] of Object.entries(s)) if (SCORING_MAP[k]) weights[SCORING_MAP[k]] = v;
  if (sport === "nfl") {
    const rec = weights.rec ?? 0;
    return { format: rec >= 1 ? "ppr" : rec >= 0.5 ? "half" : "standard", weights: { ...SCORING_PRESETS.standard.weights, ...weights } };
  }
  return { format: "nba_points", weights: Object.keys(weights).length ? weights : SCORING_PRESETS.nba_points.weights };
}

const SLOT_MAP: Record<string, RosterSlot> = {
  QB: "QB", RB: "RB", WR: "WR", TE: "TE", K: "K", DEF: "DST", FLEX: "FLEX", SUPER_FLEX: "SUPER_FLEX", REC_FLEX: "REC_FLEX", WRRB_FLEX: "WRRB_FLEX",
  PG: "PG", SG: "SG", SF: "SF", PF: "PF", C: "C", G: "G", F: "F", UTIL: "UTIL", BN: "BN", IR: "IR",
};

export const mapRosterSlots = (slots: string[]) => slots.map((s) => SLOT_MAP[s]).filter((s): s is RosterSlot => Boolean(s));

export async function resolveSleeperUser(username: string): Promise<{ userId: string; displayName: string }> {
  const res = await get<SlUser | null>(`/user/${encodeURIComponent(username)}`, "fantasy_league");
  if (!res.data) throw new Error("USER_NOT_FOUND");
  if (typeof res.data.user_id !== "string" || !res.data.user_id) throw new Error("MALFORMED_USER");
  return { userId: res.data.user_id, displayName: res.data.display_name || username };
}

/** Refresh league-changing data without evicting the once-daily NFL player map. */
export function invalidateSleeperLeague(leagueId: string): void {
  cacheDeletePrefix(`sleeper:/league/${leagueId}`);
  cacheDeletePrefix("sleeper:/state/nfl");
}

export const sleeper: FantasyProvider = {
  name: "sleeper",
  isConfigured: () => true,

  async listLeagues(user, sport, season) {
    if (sport !== "nfl") return { data: [], provenance: liveProv(NAME, new Date().toISOString()) };
    const u = await get<{ user_id: string } | null>(`/user/${encodeURIComponent(user)}`, "fantasy_league");
    if (!u.data) return { data: [], provenance: liveProv(NAME, u.retrievedAt) };
    const ls = await get<SlLeague[]>(`/user/${u.data.user_id}/leagues/${sport}/${season}`, "fantasy_league");
    return {
      data: (Array.isArray(ls.data) ? ls.data : []).filter((l) => l && typeof l.league_id === "string").map((l) => ({ id: l.league_id, name: l.name || "Unnamed league", sport, season: Number(l.season), teams: l.total_rosters, scoring: mapScoring(sport, l.scoring_settings ?? {}).format, status: l.status ?? "unknown" })),
      provenance: liveProv(NAME, ls.retrievedAt, ls.stale),
    };
  },

  async getLeague(leagueId, { userId, sport }) {
    const [lg, users, rosters, state, players] = await Promise.all([
      get<SlLeague>(`/league/${leagueId}`, "fantasy_league"),
      get<SlUser[]>(`/league/${leagueId}/users`, "fantasy_league"),
      get<SlRoster[]>(`/league/${leagueId}/rosters`, "fantasy_rosters"),
      get<{ week: number; season: string; leg?: number }>(`/state/${sport}`, "fantasy_league"),
      get<Record<string, SlPlayer>>(`/players/${sport}`, "player_meta"),
    ]);
    const l = lg.data;
    if (!l || typeof l.league_id !== "string" || !Array.isArray(l.roster_positions) || !l.scoring_settings) throw new Error("Sleeper returned a malformed league response.");
    if (!Array.isArray(users.data) || !Array.isArray(rosters.data)) throw new Error("Sleeper returned malformed users or rosters.");
    const rawLeague = (kind: "league" | "roster", endpoint: string, at: string, cache: typeof lg.cache, payload: unknown) =>
      recordRaw({ provider: NAME, kind, entityKey: `league:${leagueId}`, endpoint, retrievedAt: at, cache, payload });
    rawLeague("league", lg.endpoint, lg.retrievedAt, lg.cache, l);
    rawLeague("league", users.endpoint, users.retrievedAt, users.cache, users.data);
    rawLeague("roster", rosters.endpoint, rosters.retrievedAt, rosters.cache, rosters.data);
    const currentWeek = Math.max(1, state.data.week || state.data.leg || 1);
    const teamId = (rid: number) => `sleeper-${leagueId}-r${rid}`;
    const userMap = new Map(users.data.map((u) => [u.user_id, u]));
    const teams: FantasyTeam[] = rosters.data.map((r) => {
      const u = r.owner_id ? userMap.get(r.owner_id) : undefined;
      const st = r.settings;
      return {
        id: teamId(r.roster_id), leagueId, name: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`,
        manager: u?.display_name ?? "Unclaimed", isUser: Boolean(userId && r.owner_id === userId),
        wins: st.wins ?? 0, losses: st.losses ?? 0, ties: st.ties ?? 0,
        pointsFor: (st.fpts ?? 0) + (st.fpts_decimal ?? 0) / 100, pointsAgainst: (st.fpts_against ?? 0) + (st.fpts_against_decimal ?? 0) / 100,
      };
    });
    if (userId && !teams.some((t) => t.isUser)) throw new Error("The connected Sleeper user does not own a roster in this league.");

    const rostersOut: FantasyRoster[] = rosters.data.map((r) => ({
      teamId: teamId(r.roster_id),
      starterIds: (r.starters ?? []).filter((p) => p && p !== "0" && !(r.reserve ?? []).includes(p)),
      playerIds: (r.players ?? []).filter((p) => !(r.reserve ?? []).includes(p)),
      irIds: r.reserve ?? [],
    }));

    // Matchups for every regular-season week (future pairings feed the season simulation)
    const totalWeeks = Math.max(currentWeek, (l.settings.playoff_week_start ?? 15) - 1);
    const weeks = Array.from({ length: totalWeeks }, (_, i) => i + 1);
    const weekly = await Promise.all(weeks.map((w) => get<SlMatchup[]>(`/league/${leagueId}/matchups/${w}`, w < currentWeek ? "completed_stats" : "fantasy_rosters")));
    const matchups: FantasyMatchup[] = [];
    weekly.forEach((res, i) => {
      recordRaw({ provider: NAME, kind: "roster", entityKey: `league:${leagueId}`, endpoint: res.endpoint, retrievedAt: res.retrievedAt, cache: res.cache, payload: res.data });
      const byId = new Map<number, SlMatchup[]>();
      for (const m of res.data ?? []) if (m.matchup_id !== null) byId.set(m.matchup_id, [...(byId.get(m.matchup_id) ?? []), m]);
      for (const pair of byId.values()) {
        if (pair.length !== 2) continue;
        const done = weeks[i] < currentWeek;
        matchups.push({
          leagueId, week: weeks[i], homeTeamId: teamId(pair[0].roster_id), awayTeamId: teamId(pair[1].roster_id),
          homePoints: done ? pair[0].points : null, awayPoints: done ? pair[1].points : null,
        });
      }
    });

    const tx = await get<SlTransaction[]>(`/league/${leagueId}/transactions/${currentWeek}`, "fantasy_rosters");
    recordRaw({ provider: NAME, kind: "roster", entityKey: `league:${leagueId}`, endpoint: tx.endpoint, retrievedAt: tx.retrievedAt, cache: tx.cache, payload: tx.data });
    const transactions: FantasyTransaction[] = (tx.data ?? []).filter((t) => t.status === "complete").map((t) => ({
      id: t.transaction_id, leagueId, type: t.type === "trade" ? "trade" : t.type === "waiver" ? "waiver" : !t.adds && t.drops ? "drop" : "free_agent",
      teamIds: t.roster_ids.map(teamId),
      adds: Object.entries(t.adds ?? {}).map(([playerId, rid]) => ({ playerId, teamId: teamId(rid) })),
      drops: Object.entries(t.drops ?? {}).map(([playerId, rid]) => ({ playerId, teamId: teamId(rid) })),
      createdAt: new Date(t.created).toISOString(),
    }));

    const relevant = new Set(rostersOut.flatMap((r) => [...r.playerIds, ...r.irIds]));
    const refs: ExternalPlayerRef[] = [];
    const hints: FantasyLeagueBundle["hints"] = {};
    for (const p of Object.values(players.data ?? {})) {
      if (!p.position || !relevant.has(p.player_id)) continue;
      refs.push({ externalId: p.player_id, firstName: p.first_name, lastName: p.last_name, position: p.position, teamAbbr: p.team });
      if (relevant.has(p.player_id)) recordRaw({ provider: NAME, kind: "player", entityKey: `sleeper:${p.player_id}`, endpoint: players.endpoint, retrievedAt: players.retrievedAt, cache: players.cache, payload: p });
      hints[p.player_id] = { depthOrder: p.depth_chart_order ?? undefined, injury: p.injury_status };
    }

    const slots = mapRosterSlots(l.roster_positions);
    return {
      data: {
        league: {
          id: leagueId, sport, provider: "sleeper", name: l.name, season: Number(l.season), currentWeek,
          totalWeeks, playoffTeams: l.settings.playoff_teams ?? 4,
          scoring: mapScoring(sport, l.scoring_settings), slots, provenance: liveProv(NAME, lg.retrievedAt, lg.stale),
        },
        teams, rosters: rostersOut, matchups, transactions, players: refs, hints,
      },
      provenance: liveProv(NAME, lg.retrievedAt, lg.stale),
    };
  },
};
