import type { Position } from "@/lib/domain/types";
import { type AnalyticsContext, ewma, isNflUsage, mean, round1 } from "./context";
import { observedXfp } from "./projection";

export type OpportunityTrend = "Strongly Rising" | "Rising" | "Stable" | "Falling" | "Strongly Falling";

export interface OpportunitySignal {
  label: string;
  value: string;
  raw: number;
}

export interface OpportunityReport {
  score: number; // 0–100, percentile of recent xFP within position
  trend: OpportunityTrend;
  trendPct: number; // per-game change, % of mean
  productionScore: number; // 0–100, percentile of recent actual FP within position
  recentXfp: number;
  recentFp: number;
  signals: OpportunitySignal[];
  history: { label: string; xfp: number; fp: number; played: boolean; primary: number; secondary: number }[];
}

const RECENT = 4;

interface PosPool {
  xfp: number[];
  fp: number[];
}
const poolMemo = new WeakMap<AnalyticsContext, Map<Position, PosPool>>();

function recentOf(ctx: AnalyticsContext, id: string) {
  const p = ctx.player(id)!;
  const played = ctx.logs(id).filter((g) => g.played).slice(-RECENT);
  return {
    xfp: ewma(played.map((g) => observedXfp(ctx, p.position, g))),
    fp: ewma(played.map((g) => g.fp)),
    n: played.length,
  };
}

/** Position comparison pool (recent xFP / FP for every player who has played). */
export function positionPool(ctx: AnalyticsContext, pos: Position): PosPool {
  return pools(ctx).get(pos) ?? { xfp: [], fp: [] };
}

function pools(ctx: AnalyticsContext): Map<Position, PosPool> {
  const hit = poolMemo.get(ctx);
  if (hit) return hit;
  const m = new Map<Position, PosPool>();
  for (const p of ctx.snap.players) {
    const r = recentOf(ctx, p.id);
    if (r.n === 0) continue;
    const pool = m.get(p.position) ?? { xfp: [], fp: [] };
    pool.xfp.push(r.xfp);
    pool.fp.push(r.fp);
    m.set(p.position, pool);
  }
  for (const pool of m.values()) {
    pool.xfp.sort((a, b) => a - b);
    pool.fp.sort((a, b) => a - b);
  }
  poolMemo.set(ctx, m);
  return m;
}

export function percentile(sorted: number[], v: number): number {
  if (!sorted.length) return 0;
  let lo = 0;
  while (lo < sorted.length && sorted[lo] < v) lo++;
  return Math.round((lo / sorted.length) * 100);
}

/** % change of the recent window vs the window before it, damped for small samples. */
export function trendWindows(series: number[], [recentN, priorN]: [number, number]) {
  if (series.length < recentN + 2) return null;
  return { recent: mean(series.slice(-recentN)), prior: mean(series.slice(-(recentN + priorN), -recentN)), base: Math.max(1, mean(series.slice(-(recentN + priorN)))), n: Math.min(series.length, recentN + priorN) };
}

export function trendOf(series: number[], [recentN, priorN]: [number, number]): number {
  if (series.length < recentN + 2) return 0;
  const recent = mean(series.slice(-recentN));
  const prior = mean(series.slice(-(recentN + priorN), -recentN));
  const base = Math.max(1, mean(series.slice(-(recentN + priorN))));
  const n = Math.min(series.length, recentN + priorN);
  return round1(((recent - prior) / base) * 100 * (n / (n + 2)));
}

export function trendLabel(pct: number): OpportunityTrend {
  if (pct >= 25) return "Strongly Rising";
  if (pct >= 10) return "Rising";
  if (pct <= -25) return "Strongly Falling";
  if (pct <= -10) return "Falling";
  return "Stable";
}

export function opportunity(ctx: AnalyticsContext, playerId: string): OpportunityReport {
  const p = ctx.player(playerId)!;
  const pool = pools(ctx).get(p.position) ?? { xfp: [], fp: [] };
  const r = recentOf(ctx, playerId);
  const logs = ctx.logs(playerId);
  const playedX = logs.filter((g) => g.played).map((g) => observedXfp(ctx, p.position, g));
  const trendPct = trendOf(playedX, ctx.snap.sport === "nfl" ? [2, 3] : [4, 6]);

  const history = logs.map((g, i) => {
    const u = g.usage;
    const primary = isNflUsage(u) ? (p.position === "RB" ? u.carries : p.position === "QB" ? (g.stats.pass_att ?? 0) : u.targets) : u.minutes;
    const secondary = isNflUsage(u) ? Math.round(u.snapPct * 100) : u.usagePct;
    return {
      label: ctx.snap.sport === "nfl" ? `W${g.week}` : `G${i + 1}`,
      xfp: round1(observedXfp(ctx, p.position, g)), fp: g.fp, played: g.played, primary, secondary: round1(secondary),
    };
  });

  return {
    score: r.n ? percentile(pool.xfp, r.xfp) : 0,
    trend: trendLabel(trendPct),
    trendPct,
    productionScore: r.n ? percentile(pool.fp, r.fp) : 0,
    recentXfp: round1(r.xfp),
    recentFp: round1(r.fp),
    signals: signalsFor(ctx, playerId),
    history,
  };
}

export const NOT_AVAILABLE = "NOT AVAILABLE";

function signalsFor(ctx: AnalyticsContext, playerId: string): OpportunitySignal[] {
  const p = ctx.player(playerId)!;
  const played = ctx.logs(playerId).filter((g) => g.played).slice(-RECENT);
  // A field is unavailable when every recent game's source flagged it as not provided.
  const missing = (field: string) => played.length > 0 && played.every((g) => (g.usage as { unavailable?: string[] }).unavailable?.includes(field));
  const avgOf = (f: (u: Record<string, number | boolean>) => number) => round1(mean(played.map((g) => f(g.usage as unknown as Record<string, number | boolean>))));
  const sig = (label: string, field: string, scale = 1, suffix = ""): OpportunitySignal => {
    if (missing(field)) return { label, value: NOT_AVAILABLE, raw: Number.NaN };
    const v = avgOf((u) => Number(u[field]) * scale);
    return { label, value: `${v}${suffix}`, raw: v };
  };
  if (ctx.snap.sport === "nfl") {
    const base = [sig("Snap share", "snapPct", 100, "%")];
    if (p.position === "QB") {
      const att = round1(mean(played.map((g) => g.stats.pass_att ?? 0)));
      return [...base, { label: "Pass attempts", value: String(att), raw: att }, sig("Carries", "carries"), sig("Red-zone opps", "redZoneOpps")];
    }
    if (p.position === "RB") return [...base, sig("Carries", "carries"), sig("Targets", "targets"), sig("Red-zone opps", "redZoneOpps"), sig("Goal-line carries", "goalLineCarries")];
    return [...base, sig("Route participation", "routePct", 100, "%"), sig("Targets", "targets"), sig("Target share", "targetShare", 100, "%"), sig("Air yards", "airYards"), sig("Red-zone opps", "redZoneOpps")];
  }
  const startsMissing = missing("started");
  const starts = played.filter((g) => (g.usage as { started?: boolean }).started).length;
  const estimated = played.some((g) => (g.usage as { estimated?: string[] }).estimated?.includes("usagePct"));
  const usage = sig("Usage rate", "usagePct", 1, "%");
  return [
    sig("Minutes", "minutes"),
    estimated ? { ...usage, label: "Usage rate (estimated)" } : usage,
    sig("Touches", "touches"),
    sig("Shot attempts", "fga"),
    sig("Potential assists", "potentialAssists"),
    sig("Rebound chances", "reboundChances"),
    startsMissing ? { label: "Starts (last 4)", value: NOT_AVAILABLE, raw: Number.NaN } : { label: "Starts (last 4)", value: `${starts}/${played.length}`, raw: starts },
  ];
}
