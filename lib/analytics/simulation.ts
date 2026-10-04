import { createRng } from "@/lib/util/rng";
import { type AnalyticsContext, round1 } from "./context";
import { leagueProfiles } from "./roster";

/**
 * Monte Carlo season simulation. Each remaining matchup draws team scores from
 * Normal(team ROS weekly strength, σ). Playoffs: top N by wins (points-for tiebreak),
 * single-week elimination bracket. Common random numbers (fixed seed) make
 * before/after comparisons (e.g. trades) low-noise.
 */
export const SIMULATION_MODEL_VERSION = "season-mc@0.2.0";

export interface SeasonOdds {
  teamId: string;
  expectedWins: number;
  playoffProb: number;
  champProb: number;
}

const SIMS = 2000;

export function normalCdf(x: number): number {
  // Abramowitz–Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export function simulateSeason(ctx: AnalyticsContext, strengthOverride: Record<string, number> = {}): Map<string, SeasonOdds> {
  const { snap } = ctx;
  const profiles = leagueProfiles(ctx);
  const teams = snap.fantasyTeams;
  const mu = new Map(teams.map((t) => [t.id, strengthOverride[t.id] ?? profiles.get(t.id)!.weeklyRos]));
  const sigmaFrac = snap.sport === "nfl" ? 0.17 : 0.09;
  const remaining = snap.matchups.filter((m) => m.week >= snap.currentWeek);
  const rng = createRng(4242);
  const playoffs = new Map(teams.map((t) => [t.id, 0]));
  const champs = new Map(teams.map((t) => [t.id, 0]));
  const winsSum = new Map(teams.map((t) => [t.id, 0]));
  const draw = (id: string) => rng.normal(mu.get(id)!, mu.get(id)! * sigmaFrac);

  for (let s = 0; s < SIMS; s++) {
    const wins = new Map(teams.map((t) => [t.id, t.wins + t.ties * 0.5]));
    const pf = new Map(teams.map((t) => [t.id, t.pointsFor]));
    for (const m of remaining) {
      const h = draw(m.homeTeamId);
      const a = draw(m.awayTeamId);
      pf.set(m.homeTeamId, pf.get(m.homeTeamId)! + h);
      pf.set(m.awayTeamId, pf.get(m.awayTeamId)! + a);
      const winner = h >= a ? m.homeTeamId : m.awayTeamId;
      wins.set(winner, wins.get(winner)! + 1);
    }
    const seeded = teams.map((t) => t.id).sort((x, y) => wins.get(y)! - wins.get(x)! || pf.get(y)! - pf.get(x)!);
    const field = seeded.slice(0, snap.league.playoffTeams);
    field.forEach((id) => playoffs.set(id, playoffs.get(id)! + 1));
    teams.forEach((t) => winsSum.set(t.id, winsSum.get(t.id)! + wins.get(t.id)!));
    let round = field;
    while (round.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < round.length / 2; i++) {
        const a = round[i];
        const b = round[round.length - 1 - i];
        next.push(draw(a) >= draw(b) ? a : b);
      }
      round = next;
    }
    champs.set(round[0], champs.get(round[0])! + 1);
  }
  return new Map(
    teams.map((t) => [t.id, {
      teamId: t.id,
      expectedWins: round1(winsSum.get(t.id)! / SIMS),
      playoffProb: Math.round((playoffs.get(t.id)! / SIMS) * 1000) / 10,
      champProb: Math.round((champs.get(t.id)! / SIMS) * 1000) / 10,
    }]),
  );
}

const memo = new WeakMap<AnalyticsContext, Map<string, SeasonOdds>>();
export function baselineOdds(ctx: AnalyticsContext) {
  const hit = memo.get(ctx);
  if (hit) return hit;
  const r = simulateSeason(ctx);
  memo.set(ctx, r);
  return r;
}
