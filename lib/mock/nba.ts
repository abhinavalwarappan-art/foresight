import type {
  DepthChartEntry, Game, GameMarket, Injury, InjuryHistoryEntry, MarketProjection, NbaPosition, NbaUsage,
  Player, PlayerGame, Team,
} from "@/lib/domain/types";
import { MOCK_NOW, mockProv, roundRobin } from "./common";
import { FIRST, LAST, NBA_TEAMS } from "./names";
import { clamp, createRng, r1, r3, type Rng } from "./rng";

export const NBA_SEASON = 2026;
export const NBA_CURRENT_WEEK = 6;
export const NBA_TOTAL_WEEKS = 20;
/** Games per team in each fantasy week (alternating light/heavy weeks). */
export const nbaGamesInWeek = (week: number) => (week % 2 === 0 ? 4 : 3);

interface Latent {
  id: string;
  teamIdx: number;
  pos: NbaPosition;
  rotation: number; // 1..10 by minutes
  minutes: number;
  trend: number; // minutes per game, per game
  usage: number;
  rates: { pts: number; reb: number; ast: number; stl: number; blk: number; fg3m: number; tov: number };
  fgPct: number;
  ftPct: number;
  outGames: Set<number>; // global game index for team
}

const POS_ORDER: NbaPosition[] = ["PG", "SG", "SF", "PF", "C", "PG", "SF", "PF", "SG", "C"];
const BASE_MIN = [34, 33, 31, 30, 28, 24, 21, 18, 14, 9];

function makeName(rng: Rng, used: Set<string>): [string, string] {
  for (;;) {
    const f = rng.pick(FIRST);
    const l = rng.pick(LAST);
    if (!used.has(f + l)) {
      used.add(f + l);
      return [f, l];
    }
  }
}

function ratesFor(rng: Rng, pos: NbaPosition, star: number) {
  const guard = pos === "PG" || pos === "SG";
  const big = pos === "C" || pos === "PF";
  return {
    pts: (14 + star * 9) * rng.range(0.85, 1.15),
    reb: (big ? 10 : guard ? 4.2 : 6.5) * rng.range(0.8, 1.2) * (0.9 + star * 0.15),
    ast: (pos === "PG" ? 7.5 : guard ? 4.5 : big ? 2.6 : 3.2) * rng.range(0.8, 1.25) * (0.9 + star * 0.2),
    stl: (guard ? 1.3 : 1) * rng.range(0.7, 1.3),
    blk: (big ? 1.6 : 0.5) * rng.range(0.6, 1.4),
    fg3m: (big ? 0.8 : 2.4) * rng.range(0.5, 1.4),
    tov: (1.6 + star * 1.2) * rng.range(0.8, 1.2),
  };
}

export function generateNba(seed = 23) {
  const rng = createRng(seed);
  const used = new Set<string>();
  const teams: Team[] = NBA_TEAMS.map(([abbr, city, name, conf, color]) => ({
    id: `nba-${abbr.toLowerCase()}`, sport: "nba", abbr, city, name, conference: conf, color,
  }));
  const pace = teams.map(() => rng.range(0.95, 1.06));
  const defense = teams.map(() => rng.range(0.94, 1.06));

  const players: Player[] = [];
  const latent: Latent[] = [];
  let pid = 1;
  teams.forEach((team, ti) => {
    POS_ORDER.forEach((pos, r) => {
      const id = `nba-p${String(pid++).padStart(3, "0")}`;
      const [firstName, lastName] = makeName(rng, used);
      const star = clamp((10 - r) / 10 + rng.normal(0, 0.18), 0, 1.2) ** 1.6;
      latent.push({
        id, teamIdx: ti, pos, rotation: r + 1,
        minutes: BASE_MIN[r] + rng.normal(0, 2),
        trend: rng.normal(0, 0.06),
        usage: clamp(14 + star * 14 + rng.normal(0, 2), 10, 36),
        rates: ratesFor(rng, pos, star),
        fgPct: clamp(rng.normal(pos === "C" ? 0.56 : 0.46, 0.035), 0.38, 0.66),
        ftPct: clamp(rng.normal(pos === "C" ? 0.7 : 0.8, 0.06), 0.55, 0.93),
        outGames: new Set(),
      });
      players.push({
        id, ids: { internal: id }, sport: "nba", firstName, lastName, position: pos, teamId: team.id,
        jersey: rng.int(0, 55), age: rng.int(19, 35), experience: rng.int(0, 14),
        status: "healthy", depthOrder: r < 5 ? 1 : 2,
      });
    });
  });

  const lat = (ti: number, rot: number) => latent.find((l) => l.teamIdx === ti && l.rotation === rot)!;
  const historyGames = Array.from({ length: NBA_CURRENT_WEEK - 1 }, (_, i) => nbaGamesInWeek(i + 1)).reduce((a, b) => a + b, 0);

  // ── Storylines ──
  // 1) LOU star PG out tonight (and missed the last two) → backup PG is the add.
  const louPg = lat(0, 1);
  louPg.outGames = new Set([historyGames, historyGames + 1, historyGames + 2]);
  const louBackup = lat(0, 6);
  louBackup.rates.pts *= 1.15; louBackup.rates.ast *= 1.2;
  // 2) KCM sixth man: minutes surging
  const kcm6 = lat(1, 6);
  kcm6.trend = 0.55; kcm6.minutes = 18;
  // 3) SDB starter on minutes restriction
  const sdbC = lat(2, 5);
  // 4) Random rest days / short absences
  for (let i = 0; i < 12; i++) {
    const l = rng.pick(latent.filter((x) => x.rotation <= 7 && x.outGames.size === 0));
    l.outGames.add(rng.int(0, historyGames - 1));
  }

  // ── Schedule: round-robin rounds grouped into fantasy weeks ──
  const totalRounds = Array.from({ length: NBA_TOTAL_WEEKS }, (_, i) => nbaGamesInWeek(i + 1)).reduce((a, b) => a + b, 0);
  const rr = roundRobin(teams.length, totalRounds);
  const games: Game[] = [];
  let round = 0;
  for (let week = 1; week <= NBA_TOTAL_WEEKS; week++) {
    for (let g = 0; g < nbaGamesInWeek(week); g++, round++) {
      const pairs = rr[round % rr.length];
      pairs.forEach(([h, a], gi) => {
        const date = new Date(Date.UTC(NBA_SEASON, 9, 21 + round * 2)).toISOString();
        games.push({
          id: `nba-g${round}-${gi}`, sport: "nba", season: NBA_SEASON, week, date,
          homeTeamId: teams[h].id, awayTeamId: teams[a].id,
          status: week < NBA_CURRENT_WEEK ? "final" : "scheduled", homeScore: null, awayScore: null,
        });
      });
    }
  }

  // ── Simulate completed games ──
  const playerGames: PlayerGame[] = [];
  const teamGameIdx = new Map<number, number>();
  for (const game of games.filter((g) => g.status === "final")) {
    const scores: number[] = [];
    for (const side of ["home", "away"] as const) {
      const ti = teams.findIndex((t) => t.id === (side === "home" ? game.homeTeamId : game.awayTeamId));
      const oi = teams.findIndex((t) => t.id === (side === "home" ? game.awayTeamId : game.homeTeamId));
      const gIdx = teamGameIdx.get(ti) ?? 0;
      teamGameIdx.set(ti, gIdx + 1);
      scores.push(simulateTeamGame(rng, latent, ti, gIdx, game, teams[oi].id, pace[ti] * defense[oi], playerGames));
    }
    game.homeScore = scores[0];
    game.awayScore = scores[1];
  }

  // ── Injuries / status now ──
  const injuries: Injury[] = [];
  const setStatus = (l: Latent, status: Player["status"], body: string | null, note: string, restriction: number | null = null) => {
    players.find((p) => p.id === l.id)!.status = status;
    injuries.push({ playerId: l.id, designation: status, bodyPart: body, practice: [], minutesRestriction: restriction, note, reportedAt: MOCK_NOW, provenance: mockProv() });
  };
  setStatus(louPg, "out", "Calf", "Ruled out tonight; re-evaluated in one week.");
  setStatus(sdbC, "day-to-day", "Knee", "Upgraded to available; expected minutes limit.", 24);
  setStatus(lat(4, 2), "questionable", "Back", "Game-time decision.");
  setStatus(lat(6, 3), "probable", "Rest", "Second night of back-to-back.");
  setStatus(lat(9, 1), "out", "Wrist", "Out at least two weeks.");

  const injuryHistory: InjuryHistoryEntry[] = latent
    .filter((l) => l.rotation <= 5 && rng.next() < 0.3)
    .map((l) => ({ playerId: l.id, season: NBA_SEASON - rng.int(1, 3), bodyPart: rng.pick(["Ankle", "Knee", "Hamstring", "Back", "Calf"]), gamesMissed: rng.int(2, 18) }));

  const depthCharts: DepthChartEntry[] = latent.map((l) => ({
    teamId: teams[l.teamIdx].id, position: l.pos, playerId: l.id, order: l.rotation, provenance: mockProv(),
  }));

  const upcoming = games.filter((g) => g.week === NBA_CURRENT_WEEK);
  const markets: GameMarket[] = upcoming.map((g) => {
    const h = teams.findIndex((t) => t.id === g.homeTeamId);
    const a = teams.findIndex((t) => t.id === g.awayTeamId);
    const total = Math.round((226 * pace[h] * pace[a] + rng.normal(0, 4)) * 2) / 2;
    const spread = Math.round(rng.normal(-2, 6) * 2) / 2;
    return { gameId: g.id, spread, total, homeImpliedTotal: r1(total / 2 - spread / 2), awayImpliedTotal: r1(total / 2 + spread / 2), provenance: mockProv({ kind: "market", source: "mock-odds" }) };
  });
  // Player points props for the first slate of the week
  const firstSlate = new Set(upcoming.slice(0, teams.length / 2).flatMap((g) => [g.homeTeamId, g.awayTeamId]));
  const props: MarketProjection[] = latent
    .filter((l) => l.rotation <= 7 && firstSlate.has(teams[l.teamIdx].id) && !players.find((p) => p.id === l.id && p.status === "out"))
    .map((l) => ({ playerId: l.id, stat: "pts", line: Math.round((l.rates.pts * l.minutes) / 36 * 2) / 2 - 0.5, provenance: mockProv({ kind: "market", source: "mock-odds", isProjection: true }) }));

  return { teams, players, latent, games, playerGames, injuries, injuryHistory, depthCharts, markets, props, pace };
}

function simulateTeamGame(
  rng: Rng, latent: Latent[], ti: number, gIdx: number, game: Game, opponentTeamId: string, env: number,
  out: PlayerGame[],
): number {
  const roster = latent.filter((l) => l.teamIdx === ti);
  const active = roster.filter((l) => !l.outGames.has(gIdx));
  const raw = new Map(active.map((l) => [l.id, clamp(l.minutes + l.trend * gIdx + rng.normal(0, 3), 4, 40)]));
  const sumRaw = [...raw.values()].reduce((a, b) => a + b, 0);
  const scale = 240 / sumRaw;
  const usageAll = roster.reduce((s, l) => s + l.usage, 0);
  const usageActive = active.reduce((s, l) => s + l.usage, 0);
  const usageBoost = clamp(Math.sqrt(usageAll / usageActive), 1, 1.22);
  const starters = [...active].sort((a, b) => (raw.get(b.id) ?? 0) - (raw.get(a.id) ?? 0)).slice(0, 5).map((l) => l.id);
  let teamPts = 0;

  for (const l of roster) {
    const played = raw.has(l.id);
    const min = played ? clamp((raw.get(l.id) ?? 0) * scale, 2, 42) : 0;
    const f = (min / 36) * env;
    const n = () => rng.range(0.7, 1.3);
    const pts = played ? Math.round(l.rates.pts * f * usageBoost * n()) : 0;
    const fga = played ? Math.max(0, Math.round(pts / (2 * l.fgPct * 1.12))) : 0;
    const fta = played ? Math.round(pts * 0.2 * n()) : 0;
    const stats: Record<string, number> = played
      ? {
          pts, reb: Math.round(l.rates.reb * f * n()), ast: Math.round(l.rates.ast * f * usageBoost * n()),
          stl: rng.poisson(l.rates.stl * f), blk: rng.poisson(l.rates.blk * f), fg3m: rng.poisson(l.rates.fg3m * f),
          tov: rng.poisson(l.rates.tov * f * usageBoost), fga, fgm: Math.round(fga * l.fgPct), fta, ftm: Math.round(fta * l.ftPct), min: r1(min),
        }
      : {};
    teamPts += pts;
    const usage: NbaUsage = {
      minutes: r1(min),
      usagePct: played ? r1(l.usage * usageBoost + rng.normal(0, 1.5)) : 0,
      touches: played ? Math.round(min * (l.pos === "PG" ? 2.4 : 1.5) * n()) : 0,
      fga,
      potentialAssists: played ? Math.round((stats as { ast: number }).ast * 1.9 + rng.normal(0, 1)) : 0,
      reboundChances: played ? Math.round((stats as { reb: number }).reb * 1.75 + rng.normal(0, 1)) : 0,
      started: starters.includes(l.id),
    };
    out.push({ playerId: l.id, gameId: game.id, week: game.week, opponentTeamId, played, stats, usage: { ...usage, usagePct: r3(usage.usagePct) }, provenance: mockProv() });
  }
  return teamPts;
}
