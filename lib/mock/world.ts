import type { DataSnapshot } from "@/lib/domain/snapshot";
import type {
  FantasyLeague, FantasyMatchup, FantasyRoster, FantasyTeam, FantasyTransaction, Player, PlayerGame,
  ResearchEvent, RosterSlot, ScoringSettings, Sport,
} from "@/lib/domain/types";
import { optimalLineup } from "@/lib/analytics/lineup";
import { fantasyPoints, SCORING_PRESETS } from "@/lib/scoring";
import { MOCK_NOW, mockProv, roundRobin } from "./common";
import { FANTASY_TEAM_NAMES } from "./names";
import { generateNba, NBA_CURRENT_WEEK, NBA_SEASON, NBA_TOTAL_WEEKS } from "./nba";
import { generateNfl, NFL_CURRENT_WEEK, NFL_SEASON, NFL_TOTAL_WEEKS } from "./nfl";
import { createRng } from "./rng";

const NFL_SLOTS: RosterSlot[] = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN", "BN", "BN", "BN", "BN", "BN", "BN"];
const NBA_SLOTS: RosterSlot[] = ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "UTIL", "BN", "BN", "BN"];

/** Position draft bias per fantasy team: makes rosters lopsided so trades make sense. */
const NFL_BIAS: Record<number, Partial<Record<string, number>>> = {
  0: { WR: 1.25, RB: 0.7 }, // the user: WR-rich, RB-thin
  1: { RB: 1.3, WR: 0.75 }, // the natural trade partner
  2: { QB: 1.4 },
  4: { TE: 1.5 },
  6: { RB: 1.15, TE: 0.8 },
  8: { WR: 1.15, QB: 0.8 },
};
const NBA_BIAS: Record<number, Partial<Record<string, number>>> = {
  0: { PG: 1.25, SG: 1.15, C: 0.8 },
  1: { C: 1.35, PF: 1.2, PG: 0.75 },
  3: { SF: 1.3 },
  5: { C: 1.2 },
};
const NFL_CAPS: Record<string, number> = { QB: 2, RB: 5, WR: 6, TE: 2 };
const NBA_CAPS: Record<string, number> = { PG: 4, SG: 4, SF: 4, PF: 4, C: 4 };

function weeklyPoints(games: PlayerGame[], scoring: ScoringSettings) {
  const m = new Map<string, Map<number, number>>();
  for (const g of games) {
    if (!g.played) continue;
    const pts = fantasyPoints(g.stats, scoring);
    const byWeek = m.get(g.playerId) ?? new Map<number, number>();
    byWeek.set(g.week, (byWeek.get(g.week) ?? 0) + pts);
    m.set(g.playerId, byWeek);
  }
  return m;
}

function buildLeague(
  sport: Sport, players: Player[], playerGames: PlayerGame[], currentWeek: number, totalWeeks: number, season: number,
) {
  const rng = createRng(sport === "nfl" ? 101 : 202);
  const scoring = sport === "nfl" ? SCORING_PRESETS.ppr : SCORING_PRESETS.nba_points;
  const slots = sport === "nfl" ? NFL_SLOTS : NBA_SLOTS;
  const rosterSize = slots.length;
  const bias = sport === "nfl" ? NFL_BIAS : NBA_BIAS;
  const caps = sport === "nfl" ? NFL_CAPS : NBA_CAPS;
  const weekly = weeklyPoints(playerGames, scoring);
  const ppg = new Map<string, number>();
  for (const p of players) {
    const games = playerGames.filter((g) => g.playerId === p.id && g.played);
    const total = games.reduce((s, g) => s + fantasyPoints(g.stats, scoring), 0);
    ppg.set(p.id, games.length ? total / games.length : 0);
  }

  const leagueId = `mock-${sport}-league`;
  const nTeams = FANTASY_TEAM_NAMES.length;
  const fantasyTeams: FantasyTeam[] = FANTASY_TEAM_NAMES.map(([name, manager], i) => ({
    id: `${leagueId}-t${i}`, leagueId, name, manager: manager === "you" ? "You" : manager, isUser: i === 0,
    wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0,
  }));

  // Snake draft with team-specific positional bias and caps.
  const pool = new Set(players.map((p) => p.id));
  const rosters: FantasyRoster[] = fantasyTeams.map((t) => ({ teamId: t.id, playerIds: [], irIds: [] }));
  for (let round = 0; round < rosterSize; round++) {
    const order = round % 2 === 0 ? [...Array(nTeams).keys()] : [...Array(nTeams).keys()].reverse();
    for (const ti of order) {
      const roster = rosters[ti];
      const counts: Record<string, number> = {};
      roster.playerIds.forEach((id) => {
        const pos = players.find((p) => p.id === id)!.position;
        counts[pos] = (counts[pos] ?? 0) + 1;
      });
      // Guarantee every single-position starting slot can be filled.
      const required = [...new Set(slots.filter((s) => s in caps))];
      const missing = required.filter((pos) => !counts[pos]);
      const mustFill = rosterSize - round <= missing.length + 1 ? new Set(missing) : null;
      let best: string | null = null;
      let bestScore = -Infinity;
      for (const id of pool) {
        const p = players.find((x) => x.id === id)!;
        if ((counts[p.position] ?? 0) >= (caps[p.position] ?? 0)) continue;
        if (mustFill && mustFill.size && !mustFill.has(p.position)) continue;
        const scarcity = sport === "nfl" && p.position === "QB" && (counts.QB ?? 0) >= 1 ? 0.45 : 1;
        const score = (ppg.get(id) ?? 0) * (bias[ti]?.[p.position] ?? 1) * scarcity * (1 + rng.normal(0, 0.06));
        if (score > bestScore) {
          bestScore = score;
          best = id;
        }
      }
      if (best) {
        roster.playerIds.push(best);
        pool.delete(best);
      }
    }
  }

  // Head-to-head history from optimal actual lineups.
  const rr = roundRobin(nTeams, totalWeeks);
  const matchups: FantasyMatchup[] = [];
  rr.forEach((pairs, w) => {
    const week = w + 1;
    for (const [h, a] of pairs) {
      const score = (ti: number) => {
        const cands = rosters[ti].playerIds.map((id) => ({
          playerId: id, position: players.find((p) => p.id === id)!.position, value: weekly.get(id)?.get(week) ?? 0,
        }));
        return optimalLineup(cands, slots).total;
      };
      const done = week < currentWeek;
      const hp = done ? score(h) : null;
      const ap = done ? score(a) : null;
      matchups.push({ leagueId, week, homeTeamId: fantasyTeams[h].id, awayTeamId: fantasyTeams[a].id, homePoints: hp, awayPoints: ap });
      if (done && hp !== null && ap !== null) {
        const H = fantasyTeams[h];
        const A = fantasyTeams[a];
        H.pointsFor += hp; H.pointsAgainst += ap; A.pointsFor += ap; A.pointsAgainst += hp;
        if (hp > ap) { H.wins++; A.losses++; } else if (ap > hp) { A.wins++; H.losses++; } else { H.ties++; A.ties++; }
      }
    }
  });
  fantasyTeams.forEach((t) => {
    t.pointsFor = Math.round(t.pointsFor * 10) / 10;
    t.pointsAgainst = Math.round(t.pointsAgainst * 10) / 10;
  });

  const league: FantasyLeague = {
    id: leagueId, sport, provider: "mock", name: sport === "nfl" ? "Sunday Signal League" : "Box Score Society",
    season, currentWeek, totalWeeks, playoffTeams: 4, scoring, slots, provenance: mockProv(),
  };

  const rostered = new Set(rosters.flatMap((r) => r.playerIds));
  const fa = players.filter((p) => !rostered.has(p.id));
  const transactions: FantasyTransaction[] = Array.from({ length: 6 }, (_, i) => {
    const team = fantasyTeams[1 + (i % (nTeams - 1))];
    const add = fa[(i * 7) % fa.length];
    const roster = rosters.find((r) => r.teamId === team.id)!;
    return {
      id: `${leagueId}-tx${i}`, leagueId, type: i === 2 ? "free_agent" : "waiver", teamIds: [team.id],
      adds: [{ playerId: add.id, teamId: team.id }], drops: [{ playerId: roster.playerIds[roster.playerIds.length - 1 - i], teamId: team.id }],
      createdAt: new Date(Date.parse(MOCK_NOW) - (i + 1) * 9 * 3600_000).toISOString(),
    };
  });

  // "Market" consensus rank: what the crowd sees — season PPG with noise (lags role changes).
  const consensusRank: Record<string, number> = {};
  [...players]
    .map((p) => ({ id: p.id, v: (ppg.get(p.id) ?? 0) * (1 + rng.normal(0, 0.08)) }))
    .sort((a, b) => b.v - a.v)
    .forEach((x, i) => (consensusRank[x.id] = i + 1));

  return { league, fantasyTeams, rosters, matchups, transactions, consensusRank };
}

function mockResearch(sport: Sport, players: Player[], focus: { id: string; type: ResearchEvent["eventType"]; dir: ResearchEvent["direction"]; summary: string }[]): ResearchEvent[] {
  return focus.map((f, i) => ({
    id: `${sport}-re${i}`, playerId: f.id, eventType: f.type, direction: f.dir, confidence: 0.7 + (i % 3) * 0.08,
    summary: f.summary, timestamp: new Date(Date.parse(MOCK_NOW) - (i + 1) * 5 * 3600_000).toISOString(),
    sources: [{ title: "Mock beat report (fictional)", url: "https://example.com/mock-research", publisher: "Mock Wire" }],
  })).filter((e) => players.some((p) => p.id === e.playerId));
}

const cache = new Map<Sport, DataSnapshot>();

/** Deterministic, fully fictional world. Memoized per process. */
export function getMockWorld(sport: Sport): DataSnapshot {
  const hit = cache.get(sport);
  if (hit) return hit;
  const sources = {
    sports: mockProv(), fantasy: mockProv(), odds: mockProv({ kind: "market", source: "mock-odds" }), research: mockProv({ source: "mock-research" }),
  };
  let snap: DataSnapshot;
  if (sport === "nfl") {
    const w = generateNfl();
    // Deliberate identity collision (like two real "Josh Allen"s): two WRs share a name on
    // different teams. Exercises ambiguous-match handling in the ID mapper and inspector.
    const twinA = w.players.find((p) => p.teamId === "nfl-orl" && p.position === "WR" && p.depthOrder === 5)!;
    const twinB = w.players.find((p) => p.teamId === "nfl-hfd" && p.position === "WR" && p.depthOrder === 5)!;
    twinB.firstName = twinA.firstName;
    twinB.lastName = twinA.lastName;
    const lg = buildLeague("nfl", w.players, w.playerGames, NFL_CURRENT_WEEK, NFL_TOTAL_WEEKS, NFL_SEASON);
    const find = (team: string, pos: string, depth: number) => w.players.find((p) => p.teamId === `nfl-${team}` && p.position === pos && p.depthOrder === depth)!.id;
    snap = {
      sport, season: NFL_SEASON, currentWeek: NFL_CURRENT_WEEK, generatedAt: MOCK_NOW, isMock: true,
      teams: w.teams, players: w.players, games: w.games, playerGames: w.playerGames, injuries: w.injuries,
      injuryHistory: w.injuryHistory, depthCharts: w.depthCharts, markets: w.markets, props: [],
      ...lg,
      research: mockResearch("nfl", w.players, [
        { id: find("por", "RB", 1), type: "injury_update", dir: "decrease", summary: "Ruled out for Week 7 with a high-ankle sprain; no practice all week." },
        { id: find("por", "RB", 2), type: "role_change", dir: "increase", summary: "Took first-team reps in practice in place of the injured starter." },
        { id: find("sam", "WR", 3), type: "role_change", dir: "increase", summary: "Coordinator said he 'earned more snaps'; ran with the starters in 2-WR sets." },
        { id: find("aus", "WR", 1), type: "practice_report", dir: "neutral", summary: "Limited participant Thursday and Friday with a hamstring issue." },
      ]),
      sources,
    };
  } else {
    const w = generateNba();
    const lg = buildLeague("nba", w.players, w.playerGames, NBA_CURRENT_WEEK, NBA_TOTAL_WEEKS, NBA_SEASON);
    const rot = (team: string, n: number) => w.players.filter((p) => p.teamId === `nba-${team}`)[n - 1].id;
    snap = {
      sport, season: NBA_SEASON, currentWeek: NBA_CURRENT_WEEK, generatedAt: MOCK_NOW, isMock: true,
      teams: w.teams, players: w.players, games: w.games, playerGames: w.playerGames, injuries: w.injuries,
      injuryHistory: w.injuryHistory, depthCharts: w.depthCharts, markets: w.markets, props: w.props,
      ...lg,
      research: mockResearch("nba", w.players, [
        { id: rot("lou", 1), type: "injury_update", dir: "decrease", summary: "Ruled out tonight with calf tightness; to be re-evaluated in a week." },
        { id: rot("lou", 6), type: "lineup_change", dir: "increase", summary: "Expected to start at point guard in place of the injured starter." },
        { id: rot("kcm", 6), type: "role_change", dir: "increase", summary: "Head coach called him 'part of our closing group going forward'." },
        { id: rot("sdb", 5), type: "minutes_restriction", dir: "decrease", summary: "Cleared to play but expected to be limited to roughly 24 minutes." },
      ]),
      sources,
    };
  }
  cache.set(sport, snap);
  return snap;
}
