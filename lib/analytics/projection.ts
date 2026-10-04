import type { Position, Projection } from "@/lib/domain/types";
import { availability } from "./availability";
import { type AnalyticsContext, clamp, isNflUsage, round1, sd } from "./context";
import { type ScenarioOverrides, teamUsage, type UsageProj } from "./usage";

export const PROJECTION_MODEL_VERSION = "proj-formula@0.3.1";

/** Typical game-to-game coefficient of variation by position. */
const CV: Partial<Record<Position, number>> = { QB: 0.36, RB: 0.5, WR: 0.56, TE: 0.62, PG: 0.24, SG: 0.27, SF: 0.27, PF: 0.26, C: 0.25 };

export interface ProjectionBreakdown {
  projection: Projection;
  usage: UsageProj | undefined;
  /** Expected fantasy points from opportunity alone (league-average efficiency). */
  xfp: number;
  efficiency: number; // player multiplier on xfp (shrunk)
  envFactor: number; // game environment from market totals
  matchupFactor: number; // opponent vs position
  backupQbPenalty: boolean;
  /** Intermediate values, exposed for the Data Inspector's projection trace. */
  components: {
    perGameIfActive: number;
    matchupClamped: number;
    marketGames: number; // games this week that had a market line
    scheduledGames: number;
    posCv: number;
    ownCv: number;
    cv: number;
    sdPts: number;
    sampleGames: number;
    statusFuture: boolean;
  };
}

/** xFP for a unit of projected usage. */
export function xfpFor(ctx: AnalyticsContext, pos: Position, u: UsageProj | undefined): number {
  if (!u || !u.active) return 0;
  const r = ctx.xfpRates;
  if (u.kind === "nfl") {
    if (pos === "QB") return u.passAtt * r.perPassAtt + u.carries * 0.6 + u.rzOpps * 0.8;
    return u.targets * (r.perTarget[pos] ?? 1.4) + u.carries * (r.perCarry[pos] ?? 0.7) + u.rzOpps * (r.perRz[pos] ?? 1.6);
  }
  return u.minutes * (r.perMinute[pos] ?? 1) * (u.usagePct > 0 ? 0.7 + 0.3 * (u.usagePct / 20) : 1);
}

/** Player's historical points-per-xFP, shrunk toward 1.0 (league average). */
export function efficiency(ctx: AnalyticsContext, playerId: string): number {
  const p = ctx.player(playerId);
  if (!p) return 1;
  let actual = 0;
  let expected = 0;
  for (const g of ctx.logs(playerId)) {
    if (!g.played) continue;
    actual += g.fp;
    expected += observedXfp(ctx, p.position, g);
  }
  const K = ctx.snap.sport === "nfl" ? 45 : 150; // prior strength in points
  return clamp((actual + K) / (expected + K), 0.7, 1.35);
}

/** xFP of a game that already happened, from its observed usage. */
export function observedXfp(ctx: AnalyticsContext, pos: Position, g: { usage: unknown; stats: Record<string, number>; played: boolean }): number {
  if (!g.played) return 0;
  const usage = g.usage as Parameters<typeof isNflUsage>[0];
  const r = ctx.xfpRates;
  if (isNflUsage(usage)) {
    if (pos === "QB") return (g.stats.pass_att ?? 0) * r.perPassAtt + usage.carries * 0.6 + usage.redZoneOpps * 0.8;
    return usage.targets * (r.perTarget[pos] ?? 1.4) + usage.carries * (r.perCarry[pos] ?? 0.7) + usage.redZoneOpps * (r.perRz[pos] ?? 1.6);
  }
  return usage.minutes * (r.perMinute[pos] ?? 1) * (usage.usagePct > 0 ? 0.7 + 0.3 * (usage.usagePct / 20) : 1);
}

function envAndMatchup(ctx: AnalyticsContext, playerId: string, week: number) {
  const p = ctx.player(playerId)!;
  const games = ctx.gamesFor(p.teamId, week);
  if (!games.length) return { env: 1, matchup: 1, games: 0, marketGames: 0 };
  let env = 0;
  let matchup = 0;
  let marketGames = 0;
  for (const g of games) {
    const m = ctx.market(g.id);
    if (m) marketGames++;
    const home = g.homeTeamId === p.teamId;
    const implied = m ? (home ? m.homeImpliedTotal : m.awayImpliedTotal) : 0;
    const exp = ctx.snap.sport === "nfl" ? 0.6 : 0.4;
    env += implied && ctx.leagueAvgImplied ? Math.pow(implied / ctx.leagueAvgImplied, exp) : 1;
    matchup += ctx.defenseFactor(home ? g.awayTeamId : g.homeTeamId, p.position);
  }
  return { env: env / games.length, matchup: matchup / games.length, games: games.length, marketGames };
}

export function projectPlayer(
  ctx: AnalyticsContext,
  playerId: string,
  opts: { week?: number; overrides?: ScenarioOverrides; usageMap?: Map<string, UsageProj> } = {},
): ProjectionBreakdown {
  const p = ctx.player(playerId)!;
  const week = opts.week ?? ctx.snap.currentWeek;
  const future = week > ctx.snap.currentWeek;
  const usageMap = opts.usageMap ?? teamUsage(ctx, p.teamId, { ...opts.overrides, ignoreStatus: opts.overrides?.ignoreStatus || future });
  const usage = usageMap.get(playerId);
  const avail = availability(ctx, playerId);
  const scenarioOut = opts.overrides?.out?.includes(playerId);
  const playProbability = scenarioOut ? 0 : week === ctx.snap.currentWeek ? avail.playProbability : futurePlayProb(avail.status, week - ctx.snap.currentWeek);

  const xfp = xfpFor(ctx, p.position, usage && { ...usage, active: true });
  const eff = efficiency(ctx, playerId);
  // A backup QB stepping in plays below the starter's efficiency.
  const backupQbPenalty = p.position === "QB" && p.depthOrder > 1 && Boolean(usage?.active);
  const { env, matchup, games, marketGames } = envAndMatchup(ctx, playerId, week);
  const matchupClamped = clamp(matchup, 0.85, 1.15);
  const perGameIfActive = xfp * eff * env * matchupClamped * (backupQbPenalty ? 0.82 : 1);
  const median = round1(usage?.active ? perGameIfActive * playProbability : 0);

  const played = ctx.logs(playerId).filter((g) => g.played).map((g) => g.fp);
  const posCv = CV[p.position] ?? 0.5;
  const ownCv = played.length >= 3 && perGameIfActive > 0 ? sd(played) / Math.max(1, played.reduce((a, b) => a + b, 0) / played.length) : posCv;
  const cv = clamp(0.6 * posCv + 0.4 * ownCv, 0.18, 0.9);
  const sdPts = perGameIfActive * cv;
  // Availability risk widens the downside: a partial chance of zero.
  const floor = round1(Math.max(0, (perGameIfActive - 0.84 * sdPts * 0.9) * (playProbability < 0.8 ? playProbability * 0.6 : 1)));
  const ceiling = round1(playProbability > 0 ? perGameIfActive + 0.84 * sdPts * 1.2 : 0);
  const sample = clamp(played.length / (ctx.snap.sport === "nfl" ? 6 : 15), 0, 1);
  const confidence = Math.round(clamp(0.35 + 0.35 * sample + 0.2 * (1 - cv) - (1 - playProbability) * 0.3, 0.15, 0.92) * 100) / 100;
  const gamesInWeek = ctx.snap.sport === "nfl" ? Math.min(1, games) : games;

  return {
    projection: {
      playerId, week, available: played.length > 0 && games > 0 && xfp > 0, median, floor: Math.min(floor, median), ceiling: Math.max(ceiling, median), confidence,
      variance: round1(sdPts ** 2), rosValue: 0, gamesInWeek, weeklyMedian: round1(median * gamesInWeek), playProbability,
      modelVersion: PROJECTION_MODEL_VERSION,
      provenance: {
        source: `model:${PROJECTION_MODEL_VERSION}`, sourceTimestamp: ctx.snap.generatedAt, retrievedAt: ctx.snap.generatedAt,
        confidence, isProjection: true, kind: "projected",
      },
    },
    usage, xfp: round1(xfp), efficiency: Math.round(eff * 100) / 100, envFactor: Math.round(env * 100) / 100,
    matchupFactor: Math.round(matchup * 100) / 100, backupQbPenalty,
    components: {
      perGameIfActive: round1(perGameIfActive), matchupClamped: Math.round(matchupClamped * 1000) / 1000, marketGames, scheduledGames: games,
      posCv, ownCv: Math.round(ownCv * 1000) / 1000, cv: Math.round(cv * 1000) / 1000, sdPts: round1(sdPts), sampleGames: played.length, statusFuture: future,
    },
  };
}

/** Rough return-to-play curve for future weeks; transparent and conservative. */
function futurePlayProb(status: string, weeksAhead: number): number {
  if (status === "ir") return weeksAhead >= 4 ? 0.85 : 0;
  if (status === "out") return weeksAhead >= 1 ? 0.8 : 0;
  if (status === "doubtful") return 0.85;
  return 0.94;
}

/** Projections for many players with one usage model per team (fast path). */
export function projectMany(ctx: AnalyticsContext, playerIds: string[], week?: number, overrides?: ScenarioOverrides) {
  const byTeam = new Map<string, Map<string, UsageProj>>();
  const out = new Map<string, ProjectionBreakdown>();
  for (const id of playerIds) {
    const p = ctx.player(id);
    if (!p) continue;
    let um = byTeam.get(p.teamId);
    if (!um) {
      um = teamUsage(ctx, p.teamId, { ...overrides, ignoreStatus: overrides?.ignoreStatus || (week ?? ctx.snap.currentWeek) > ctx.snap.currentWeek });
      byTeam.set(p.teamId, um);
    }
    out.set(id, projectPlayer(ctx, id, { week, overrides, usageMap: um }));
  }
  return out;
}
