import type {
  DepthChartEntry, Game, GameMarket, Injury, InjuryHistoryEntry, NflPosition, NflUsage,
  Player, PlayerGame, StatLine, Team,
} from "@/lib/domain/types";
import { MOCK_NOW, mockProv, roundRobin } from "./common";
import { FIRST, LAST, NFL_TEAMS } from "./names";
import { clamp, createRng, r1, r3, type Rng } from "./rng";

export const NFL_SEASON = 2026;
export const NFL_CURRENT_WEEK = 7;
export const NFL_TOTAL_WEEKS = 17;

/** Hidden "true" traits that drive the simulation. Never exposed to analytics. */
interface Latent {
  id: string;
  teamIdx: number;
  pos: NflPosition;
  depth: number;
  weight: number; // share weight inside position group
  trend: number; // weight change per week
  talent: number; // efficiency multiplier
  tdLuck: number; // history-only TD noise (drives regression signals)
  mobility: number; // QB rushing
  outWeeks: Set<number>;
}

const ROSTER: [NflPosition, number][] = [["QB", 2], ["RB", 3], ["WR", 5], ["TE", 2]];
const TARGET_BIAS: Record<string, number> = { WR: 1, TE: 0.7, RB: 0.35, QB: 0 };
const BASE_WEIGHT: Record<NflPosition, number[]> = {
  QB: [1, 0],
  RB: [0.62, 0.3, 0.12],
  WR: [0.32, 0.26, 0.2, 0.1, 0.05],
  TE: [0.22, 0.08],
  K: [1], DST: [1],
};

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

export function generateNfl(seed = 7) {
  const rng = createRng(seed);
  const used = new Set<string>();

  const teams: Team[] = NFL_TEAMS.map(([abbr, city, name, conf, color]) => ({
    id: `nfl-${abbr.toLowerCase()}`, sport: "nfl", abbr, city, name, conference: conf, color,
  }));
  const offense = teams.map(() => rng.range(0.86, 1.16));
  const defense = teams.map(() => rng.range(0.88, 1.12)); // >1 = generous defense

  const players: Player[] = [];
  const latent: Latent[] = [];
  let pid = 1;
  teams.forEach((team, ti) => {
    for (const [pos, count] of ROSTER) {
      for (let d = 0; d < count; d++) {
        const id = `nfl-p${String(pid++).padStart(3, "0")}`;
        const [firstName, lastName] = makeName(rng, used);
        const base = BASE_WEIGHT[pos][d] ?? 0.05;
        latent.push({
          id, teamIdx: ti, pos, depth: d + 1,
          weight: Math.max(0.03, base * rng.range(0.8, 1.2)),
          trend: rng.normal(0, 0.008),
          talent: clamp(rng.normal(1, 0.1), 0.75, 1.3),
          tdLuck: clamp(rng.normal(1, 0.3), 0.4, 1.9),
          mobility: pos === "QB" ? rng.range(0.1, 1) : 0,
          outWeeks: new Set(),
        });
        players.push({
          id, ids: { internal: id }, sport: "nfl", firstName, lastName, position: pos, teamId: team.id,
          jersey: rng.int(1, 89), age: rng.int(21, 33), experience: rng.int(0, 10),
          status: "healthy", depthOrder: d + 1,
        });
      }
    }
  });

  // ── Scripted storylines so every flagship feature has something to show ──
  const byTeamPos = (ti: number, pos: NflPosition, depth: number) =>
    latent.find((l) => l.teamIdx === ti && l.pos === pos && l.depth === depth)!;
  // 1) POR RB1 hurt in week 5, OUT this week → RB2 is the injury-opportunity add.
  const porRb1 = byTeamPos(0, "RB", 1);
  porRb1.outWeeks = new Set([6, 7]);
  porRb1.weight = 0.7;
  porRb1.talent = 1.18;
  byTeamPos(0, "RB", 2).talent = 1.08;
  // 2) SAM WR3: role exploding, production lagging (breakout)
  const samWr3 = byTeamPos(1, "WR", 3);
  samWr3.trend = 0.035; samWr3.tdLuck = 0.45; samWr3.talent = 1.12;
  // 3) OKC RB2: TD-luck merchant on a shrinking role (regression)
  const okcRb2 = byTeamPos(2, "RB", 2);
  okcRb2.tdLuck = 1.9; okcRb2.trend = -0.01;
  // 4) AUS WR1: elite, questionable this week with limited practice
  byTeamPos(3, "WR", 1).talent = 1.25;
  // 5) COL TE1 role expansion
  byTeamPos(4, "TE", 1).trend = 0.025;
  // 6) Random mid-season absences
  for (let i = 0; i < 10; i++) {
    const l = rng.pick(latent.filter((x) => x.pos !== "QB" && x.depth === 1 && x.outWeeks.size === 0));
    const start = rng.int(1, NFL_CURRENT_WEEK - 2);
    l.outWeeks.add(start);
    if (rng.next() > 0.5) l.outWeeks.add(start + 1);
  }

  // ── Schedule ──
  const rr = roundRobin(teams.length, NFL_TOTAL_WEEKS);
  const games: Game[] = [];
  rr.forEach((pairs, w) => {
    pairs.forEach(([h, a], gi) => {
      const week = w + 1;
      const date = new Date(Date.UTC(NFL_SEASON, 8, 10 + w * 7)).toISOString();
      games.push({
        id: `nfl-g${week}-${gi}`, sport: "nfl", season: NFL_SEASON, week, date,
        homeTeamId: teams[h].id, awayTeamId: teams[a].id,
        status: week < NFL_CURRENT_WEEK ? "final" : "scheduled", homeScore: null, awayScore: null,
      });
    });
  });

  // ── Simulate completed weeks ──
  const playerGames: PlayerGame[] = [];
  const teamPoints = new Map<string, number>();
  for (const game of games.filter((g) => g.status === "final")) {
    for (const side of ["home", "away"] as const) {
      const ti = teams.findIndex((t) => t.id === (side === "home" ? game.homeTeamId : game.awayTeamId));
      const oi = teams.findIndex((t) => t.id === (side === "home" ? game.awayTeamId : game.homeTeamId));
      const pts = simulateTeamWeek(rng, latent, ti, oi, game, offense[ti] * defense[oi], playerGames, teams);
      teamPoints.set(`${game.id}-${side}`, pts);
    }
    game.homeScore = teamPoints.get(`${game.id}-home`) ?? 0;
    game.awayScore = teamPoints.get(`${game.id}-away`) ?? 0;
  }

  // ── Current-week status / injuries ──
  const injuries: Injury[] = [];
  const setStatus = (l: Latent, status: Player["status"], body: string, practice: Injury["practice"], note: string) => {
    const p = players.find((x) => x.id === l.id)!;
    p.status = status;
    injuries.push({
      playerId: l.id, designation: status, bodyPart: body, practice, minutesRestriction: null, note,
      reportedAt: MOCK_NOW, provenance: mockProv(),
    });
  };
  setStatus(porRb1, "out", "Ankle", ["DNP", "DNP", "DNP"], "High-ankle sprain suffered Week 5. Did not practice.");
  setStatus(byTeamPos(3, "WR", 1), "questionable", "Hamstring", ["DNP", "LP", "LP"], "Limited Thursday and Friday.");
  setStatus(byTeamPos(7, "TE", 1), "doubtful", "Knee", ["DNP", "DNP", "LP"], "Logged one limited session.");
  setStatus(byTeamPos(9, "QB", 1), "questionable", "Shoulder", ["LP", "LP", "FP"], "Full participant Friday.");
  setStatus(byTeamPos(12, "WR", 2), "out", "Concussion", ["DNP", "DNP", "DNP"], "In concussion protocol.");
  setStatus(byTeamPos(5, "RB", 1), "probable", "Rest", ["FP", "FP", "FP"], "Veteran rest day early in week.");

  const injuryHistory: InjuryHistoryEntry[] = latent
    .filter((l) => l.depth === 1 && rng.next() < 0.35)
    .map((l) => ({
      playerId: l.id, season: NFL_SEASON - rng.int(1, 3),
      bodyPart: rng.pick(["Hamstring", "Ankle", "Knee", "Shoulder", "Groin", "Foot"]),
      gamesMissed: rng.int(1, 6),
    }));
  injuryHistory.push({ playerId: porRb1.id, season: NFL_SEASON - 1, bodyPart: "Ankle", gamesMissed: 4 });

  const depthCharts: DepthChartEntry[] = players.map((p) => ({
    teamId: p.teamId, position: p.position, playerId: p.id, order: p.depthOrder, provenance: mockProv(),
  }));

  // ── Markets for upcoming weeks (current + 3) ──
  const markets: GameMarket[] = games
    .filter((g) => g.week >= NFL_CURRENT_WEEK && g.week < NFL_CURRENT_WEEK + 4)
    .map((g) => {
      const h = teams.findIndex((t) => t.id === g.homeTeamId);
      const a = teams.findIndex((t) => t.id === g.awayTeamId);
      const homeExp = 22 * offense[h] * defense[a] + 1.2;
      const awayExp = 22 * offense[a] * defense[h];
      const total = Math.round((homeExp + awayExp + rng.normal(0, 1.5)) * 2) / 2;
      const spread = Math.round((awayExp - homeExp + rng.normal(0, 1)) * 2) / 2;
      return {
        gameId: g.id, spread, total,
        homeImpliedTotal: r1(total / 2 - spread / 2), awayImpliedTotal: r1(total / 2 + spread / 2),
        provenance: mockProv({ kind: "market", source: "mock-odds" }),
      };
    });

  return { teams, players, latent, games, playerGames, injuries, injuryHistory, depthCharts, markets, offense };
}

function simulateTeamWeek(
  rng: Rng, latent: Latent[], ti: number, oi: number, game: Game, envMult: number,
  out: PlayerGame[], teams: Team[],
): number {
  const week = game.week;
  const roster = latent.filter((l) => l.teamIdx === ti);
  const active = roster.filter((l) => !l.outWeeks.has(week));
  const plays = 63 * envMult + rng.normal(0, 4);
  const passAtt = Math.round(plays * rng.range(0.54, 0.62));
  const rushAtt = Math.round(plays - passAtt);
  const w = (l: Latent) => Math.max(0.02, l.weight + l.trend * (week - 1));

  const qb = active.filter((l) => l.pos === "QB").sort((a, b) => a.depth - b.depth)[0];
  const rbs = active.filter((l) => l.pos === "RB");
  const receivers = active.filter((l) => l.pos !== "QB");
  const qbCarries = qb ? Math.round(rushAtt * 0.14 * (0.4 + qb.mobility)) : 0;
  const rbCarryPool = rushAtt - qbCarries;
  const rbW = rbs.reduce((s, l) => s + w(l), 0);
  const tgtW = receivers.reduce((s, l) => s + w(l) * TARGET_BIAS[l.pos], 0);
  const teamTargets = Math.round(passAtt * 0.93);
  const groupMax = (pos: NflPosition) => Math.max(...active.filter((l) => l.pos === pos).map(w), 0.01);
  const rzTrips = Math.max(1, Math.round(3.4 * envMult + rng.normal(0, 1)));

  let passYds = 0;
  let passTd = 0;
  let teamTd = 0;
  const opponentTeamId = teams[oi].id;

  for (const l of roster) {
    const played = !l.outWeeks.has(week) && (l.pos !== "QB" || l === qb);
    const stats: StatLine = {};
    let usage: NflUsage = { snapPct: 0, routePct: 0, targets: 0, targetShare: 0, airYards: 0, carries: 0, redZoneOpps: 0, goalLineCarries: 0 };
    if (played && l.pos !== "QB") {
      const carryShare = l.pos === "RB" ? w(l) / rbW : 0;
      const carries = Math.max(0, Math.round(carryShare * rbCarryPool + rng.normal(0, 1.5)));
      const tShare = (w(l) * TARGET_BIAS[l.pos]) / tgtW;
      const targets = Math.max(0, Math.round(tShare * teamTargets + rng.normal(0, 1.4)));
      const rel = w(l) / groupMax(l.pos);
      const snapPct = clamp(l.pos === "RB" ? 0.2 + 0.62 * rel : 0.12 + 0.86 * Math.pow(rel, 0.6), 0.04, 0.99) + rng.normal(0, 0.03);
      const adot = l.pos === "WR" ? 11.5 : l.pos === "TE" ? 7.5 : 0.8;
      const rec = Math.round(targets * clamp(0.64 * l.talent + rng.normal(0, 0.08), 0.35, 0.92));
      const recYds = Math.max(0, Math.round(rec * (l.pos === "RB" ? 7.4 : l.pos === "TE" ? 10.2 : 12.4) * l.talent * rng.range(0.7, 1.3)));
      const rushYds = Math.max(-5, Math.round(carries * 4.3 * l.talent * rng.range(0.6, 1.4)));
      const rzOpps = rng.poisson(rzTrips * (l.pos === "RB" ? carryShare * 1.2 : tShare * 0.8));
      const glc = l.pos === "RB" ? rng.poisson(rzOpps * 0.45) : 0;
      const recTd = rng.poisson((recYds / 140 + rzOpps * 0.08) * l.tdLuck);
      const rushTd = l.pos === "RB" ? rng.poisson((rushYds / 120 + glc * 0.3) * l.tdLuck) : 0;
      Object.assign(stats, { rec, rec_yds: recYds, rec_td: recTd, rush_att: carries, rush_yds: rushYds, rush_td: rushTd, targets, fum_lost: rng.next() < 0.03 ? 1 : 0 });
      passYds += recYds;
      passTd += recTd;
      teamTd += recTd + rushTd;
      usage = {
        snapPct: r3(clamp(snapPct, 0, 1)),
        routePct: r3(clamp(snapPct * (l.pos === "WR" ? 0.96 : l.pos === "TE" ? 0.74 : 0.52), 0, 1)),
        targets, targetShare: r3(targets / Math.max(1, teamTargets)), airYards: Math.round(targets * adot * rng.range(0.7, 1.3)),
        carries, redZoneOpps: rzOpps, goalLineCarries: glc,
      };
    }
    out.push({
      playerId: l.id, gameId: game.id, week, opponentTeamId, played, stats, usage,
      provenance: mockProv(),
    });
  }

  if (qb) {
    const qbLine = out[out.length - roster.length + roster.indexOf(qb)];
    const ints = rng.poisson((passAtt * 0.024) / qb.talent);
    const qbRushYds = Math.max(0, Math.round(qbCarries * 5.1 * rng.range(0.5, 1.5)));
    const qbRushTd = rng.poisson((qbRushYds / 160) * qb.tdLuck);
    qbLine.stats = { pass_att: passAtt, pass_yds: passYds, pass_td: passTd, pass_int: ints, rush_att: qbCarries, rush_yds: qbRushYds, rush_td: qbRushTd, fum_lost: rng.next() < 0.04 ? 1 : 0 };
    qbLine.usage = { snapPct: 1, routePct: 0, targets: 0, targetShare: 0, airYards: 0, carries: qbCarries, redZoneOpps: rng.poisson(rzTrips * 0.25), goalLineCarries: 0 };
    teamTd += qbRushTd;
  }
  return teamTd * 7 + rng.int(0, 3) * 3;
}
