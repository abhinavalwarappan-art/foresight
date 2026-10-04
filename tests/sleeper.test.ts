import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheClear } from "@/lib/cache/store";
import { optimalLineup } from "@/lib/analytics/lineup";
import { mapRosterSlots, mapScoring, resolveSleeperUser, sleeper } from "@/lib/providers/fantasy/sleeper";

const league = {
  league_id: "123456789", name: "Real League", sport: "nfl", season: "2026", status: "in_season", total_rosters: 2,
  settings: { playoff_teams: 2, playoff_week_start: 3, last_scored_leg: 1 },
  scoring_settings: { rec: 0.5, pass_yd: 0.04, pass_td: 6, pass_int: -2, bonus_pass_yd_300: 3 },
  roster_positions: ["QB", "RB", "WR", "TE", "SUPER_FLEX", "BN", "IR"],
};
const users = [
  { user_id: "111", display_name: "Alice", metadata: { team_name: "Alice's Team" } },
  { user_id: "222", display_name: "Bob", metadata: {} },
];
const rosters = [
  { roster_id: 1, owner_id: "111", players: ["p1", "p2", "p3"], starters: ["p1", "p2"], reserve: ["p3"], settings: { wins: 1, losses: 0, fpts: 101, fpts_decimal: 25 } },
  { roster_id: 2, owner_id: "222", players: ["p4", "p5"], starters: ["p4"], reserve: [], settings: { wins: 0, losses: 1 } },
];
const players = {
  p1: { player_id: "p1", first_name: "One", last_name: "Quarterback", position: "QB", team: "KC", injury_status: null, depth_chart_order: 1 },
  p2: { player_id: "p2", first_name: "Two", last_name: "Runner", position: "RB", team: "BUF", injury_status: null, depth_chart_order: 1 },
  p3: { player_id: "p3", first_name: "Three", last_name: "Reserve", position: "WR", team: "CHI", injury_status: "IR", depth_chart_order: 2 },
  p4: { player_id: "p4", first_name: "Four", last_name: "Receiver", position: "WR", team: "DAL", injury_status: null, depth_chart_order: 1 },
  p5: { player_id: "p5", first_name: "Five", last_name: "Tightend", position: "TE", team: "DET", injury_status: null, depth_chart_order: 1 },
};

function response(data: unknown) { return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } }); }

beforeEach(() => {
  cacheClear();
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    if (path === "/v1/user/alice") return response({ user_id: "111", display_name: "Alice" });
    if (path === "/v1/user/missing") return response(null);
    if (path === "/v1/user/111") return response({ user_id: "111", display_name: "Alice" });
    if (path === "/v1/user/111/leagues/nfl/2026") return response([league]);
    if (path === "/v1/league/123456789") return response(league);
    if (path.endsWith("/users")) return response(users);
    if (path.endsWith("/rosters")) return response(rosters);
    if (path === "/v1/state/nfl") return response({ week: 2, season: "2026" });
    if (path === "/v1/players/nfl") return response(players);
    if (path.endsWith("/matchups/1")) return response([{ roster_id: 1, matchup_id: 8, points: 101.25, starters: ["p1", "p2"], players: ["p1", "p2", "p3"] }, { roster_id: 2, matchup_id: 8, points: 90, starters: ["p4"], players: ["p4", "p5"] }]);
    if (path.endsWith("/matchups/2")) return response([{ roster_id: 1, matchup_id: 9, points: 0 }, { roster_id: 2, matchup_id: 9, points: 0 }]);
    if (path.endsWith("/transactions/2")) return response([{ transaction_id: "tx1", type: "waiver", status: "complete", roster_ids: [1], adds: { p2: 1 }, drops: { p3: 1 }, created: 1791162000000 }]);
    return new Response("not found", { status: 404 });
  }));
});

describe("Sleeper HTTP and normalization", () => {
  it("resolves a username to the stable user id and handles missing users", async () => {
    await expect(resolveSleeperUser("alice")).resolves.toEqual({ userId: "111", displayName: "Alice" });
    await expect(resolveSleeperUser("missing")).rejects.toThrow("USER_NOT_FOUND");
  });

  it("lists leagues with scoring metadata", async () => {
    const result = await sleeper.listLeagues("111", "nfl", 2026);
    expect(result.data).toEqual([{ id: "123456789", name: "Real League", sport: "nfl", season: 2026, teams: 2, scoring: "half", status: "in_season" }]);
  });

  it("normalizes managers, ownership, starters, bench, IR, matchups, and transactions", async () => {
    const result = await sleeper.getLeague("123456789", { userId: "111", sport: "nfl" });
    expect(result.data.teams[0]).toMatchObject({ manager: "Alice", name: "Alice's Team", isUser: true, wins: 1, pointsFor: 101.25 });
    expect(result.data.rosters[0]).toEqual({ teamId: "sleeper-123456789-r1", starterIds: ["p1", "p2"], playerIds: ["p1", "p2"], irIds: ["p3"] });
    expect(result.data.matchups).toContainEqual({ leagueId: "123456789", week: 1, homeTeamId: "sleeper-123456789-r1", awayTeamId: "sleeper-123456789-r2", homePoints: 101.25, awayPoints: 90 });
    expect(result.data.transactions[0]).toMatchObject({ type: "waiver", adds: [{ playerId: "p2", teamId: "sleeper-123456789-r1" }] });
  });
});

describe("Sleeper scoring and slots", () => {
  it("translates standard, PPR, half-PPR, and custom bonuses", () => {
    expect(mapScoring("nfl", { rec: 0 }).format).toBe("standard");
    expect(mapScoring("nfl", { rec: 1 }).format).toBe("ppr");
    expect(mapScoring("nfl", { rec: 0.5 }).format).toBe("half");
    expect(mapScoring("nfl", { rec: 0.25, pass_td: 6, bonus_pass_yd_300: 3 }).weights).toMatchObject({ rec: 0.25, pass_td: 6, bonus_pass_yd_300: 3 });
  });

  it("preserves superflex and restricted flex eligibility", () => {
    expect(mapRosterSlots(["SUPER_FLEX", "WRRB_FLEX", "REC_FLEX", "IR"])).toEqual(["SUPER_FLEX", "WRRB_FLEX", "REC_FLEX", "IR"]);
    const result = optimalLineup([{ playerId: "qb", position: "QB", value: 20 }, { playerId: "rb", position: "RB", value: 10 }], ["SUPER_FLEX"]);
    expect(result.starters[0].playerId).toBe("qb");
  });
});
