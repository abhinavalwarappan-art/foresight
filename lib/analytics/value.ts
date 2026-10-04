import type { Position } from "@/lib/domain/types";
import { type AnalyticsContext, clamp, round1 } from "./context";
import { opportunity, type OpportunityReport } from "./opportunity";
import { observedXfp, projectMany, type ProjectionBreakdown } from "./projection";

export type StockLabel = "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";
export type StockTag = "BREAKOUT WATCH" | "REGRESSION WATCH" | "INJURY OPPORTUNITY" | "ROLE EXPANSION" | "ROLE DECLINE";
export type SustainabilityLabel = "Highly Sustainable" | "Sustainable" | "Neutral" | "Fragile" | "Likely Regression";

export interface PlayerValue {
  playerId: string;
  position: Position;
  rosPoints: number;
  vorp: number;
  value: number; // 0–100
  valueTrend: number; // signed, from opportunity trajectory
  modelPosRank: number;
  marketPosRank: number;
  rankDelta: number; // market − model (positive = model is higher than market)
  label: StockLabel;
  tags: StockTag[];
  breakout: { score: number; gap: number; flagged: boolean };
  sustainability: Sustainability;
  week: ProjectionBreakdown;
  opp: OpportunityReport;
  /** Recent-usage xFP vs forward-looking xFP: >0 means the role is about to grow. */
  forwardRoleChange: number;
  /** Intermediate values for the Data Inspector. */
  trace: {
    rosByWeek: { week: number; points: number }[];
    replacementIndex: number;
    replacementPlayerId: string | null;
    replacementLevel: number;
    maxVorp: number;
    relevant: boolean;
    labelThresholds: { strongBuy: number; buy: number; sell: number; strongSell: number };
    breakoutRule: { gapRule: boolean; forwardRule: boolean };
  };
}

export interface Sustainability {
  score: number;
  label: SustainabilityLabel;
  ratio: number;
  tdShare: number | null;
  actual: number;
  expected: number;
  prior: number;
  adjustments: { label: string; impact: number }[];
}

const memo = new WeakMap<AnalyticsContext, Map<string, PlayerValue>>();

/** Starters per position across the league → replacement level index. */
function replacementIndex(ctx: AnalyticsContext, pos: Position): number {
  const slots = ctx.snap.league.slots;
  const teams = ctx.snap.fantasyTeams.length;
  const direct = slots.filter((s) => s === pos).length;
  const flexShare: Partial<Record<Position, number>> =
    ctx.snap.sport === "nfl" ? { RB: 0.4, WR: 0.5, TE: 0.1 } : { PG: 0.7, SG: 0.7, SF: 0.7, PF: 0.7, C: 0.6 };
  const flexSlots = slots.filter((s) => s === "FLEX" || s === "G" || s === "F" || s === "UTIL").length;
  return Math.max(1, Math.round(teams * (direct + flexSlots * (flexShare[pos] ?? 0) * (ctx.snap.sport === "nba" ? 0.6 : 1))));
}

export function allValues(ctx: AnalyticsContext): Map<string, PlayerValue> {
  const hit = memo.get(ctx);
  if (hit) return hit;
  const { snap } = ctx;
  const ids = snap.players.map((p) => p.id);
  const now = projectMany(ctx, ids, snap.currentWeek);
  const ros = new Map<string, number>(ids.map((id) => [id, now.get(id)?.projection.weeklyMedian ?? 0]));
  const byWeek = new Map<string, { week: number; points: number }[]>(ids.map((id) => [id, [{ week: snap.currentWeek, points: now.get(id)?.projection.weeklyMedian ?? 0 }]]));
  for (let w = snap.currentWeek + 1; w <= snap.league.totalWeeks; w++) {
    const fut = projectMany(ctx, ids, w);
    for (const id of ids) {
      const pts = fut.get(id)?.projection.weeklyMedian ?? 0;
      ros.set(id, (ros.get(id) ?? 0) + pts);
      byWeek.get(id)!.push({ week: w, points: pts });
    }
  }

  // Replacement level & VORP per position
  const byPos = new Map<Position, string[]>();
  for (const p of snap.players) byPos.set(p.position, [...(byPos.get(p.position) ?? []), p.id]);
  const vorp = new Map<string, number>();
  const repl = new Map<Position, { index: number; playerId: string | null; level: number }>();
  const modelPosRank = new Map<string, number>();
  const marketPosRank = new Map<string, number>();
  for (const [pos, list] of byPos) {
    const sorted = [...list].sort((a, b) => (ros.get(b) ?? 0) - (ros.get(a) ?? 0));
    sorted.forEach((id, i) => modelPosRank.set(id, i + 1));
    const ri = replacementIndex(ctx, pos);
    const replId = sorted[Math.min(sorted.length - 1, ri)] ?? null;
    const level = replId ? ros.get(replId) ?? 0 : 0;
    repl.set(pos, { index: ri, playerId: replId, level: round1(level) });
    for (const id of list) vorp.set(id, (ros.get(id) ?? 0) - level);
    [...list].sort((a, b) => (snap.consensusRank[a] ?? 9999) - (snap.consensusRank[b] ?? 9999)).forEach((id, i) => marketPosRank.set(id, i + 1));
  }
  const maxVorp = Math.max(...[...vorp.values()], 1);

  const out = new Map<string, PlayerValue>();
  for (const p of snap.players) {
    const v = vorp.get(p.id) ?? 0;
    const value = v > 0 ? Math.round(30 + 70 * Math.pow(v / maxVorp, 0.65)) : Math.round(clamp(30 + (v / maxVorp) * 60, 0, 29));
    const opp = opportunity(ctx, p.id);
    const week = now.get(p.id)!;
    const forwardRoleChange = opp.recentXfp > 0.5 ? round1(((week.xfp - opp.recentXfp) / opp.recentXfp) * 100) : week.xfp > 3 ? 100 : 0;

    const model = modelPosRank.get(p.id) ?? 99;
    const market = marketPosRank.get(p.id) ?? 99;
    const delta = market - model;
    const scale = p.position === "QB" || p.position === "TE" ? 0.6 : 1;
    // Only meaningful for fantasy-relevant players
    const relevant = model <= replacementIndex(ctx, p.position) * 1.6 || market <= replacementIndex(ctx, p.position) * 1.6;
    const label: StockLabel = !relevant ? "HOLD"
      : delta >= 9 * scale ? "STRONG BUY" : delta >= 3 * scale ? "BUY" : delta <= -9 * scale ? "STRONG SELL" : delta <= -3 * scale ? "SELL" : "HOLD";

    const gap = opp.score - opp.productionScore;
    const gapRule = gap >= 12 && (opp.trend === "Rising" || opp.trend === "Strongly Rising");
    const forwardRule = forwardRoleChange >= 30 && week.projection.median > 0;
    const breakoutFlag = gapRule || forwardRule;
    const breakoutScore = Math.round(clamp(50 + gap + opp.trendPct * 0.5 + Math.max(0, forwardRoleChange) * 0.3, 0, 100));

    const sus = sustainability(ctx, p.id, opp);
    const tags: StockTag[] = [];
    if (breakoutFlag && week.projection.median > 0) tags.push("BREAKOUT WATCH");
    if (sus.label === "Likely Regression" || sus.label === "Fragile") tags.push("REGRESSION WATCH");
    if (forwardRoleChange >= 25 && ctx.teammates(p.id).some((t) => t.status === "out" || t.status === "ir")) tags.push("INJURY OPPORTUNITY");
    if (opp.trend === "Strongly Rising" || opp.trend === "Rising") tags.push("ROLE EXPANSION");
    if (opp.trend === "Strongly Falling") tags.push("ROLE DECLINE");

    out.set(p.id, {
      playerId: p.id, position: p.position, rosPoints: round1(ros.get(p.id) ?? 0), vorp: round1(v), value,
      valueTrend: Math.round(clamp(opp.trendPct * 0.25 + forwardRoleChange * 0.08, -15, 15)),
      modelPosRank: model, marketPosRank: market, rankDelta: delta, label, tags,
      breakout: { score: breakoutScore, gap, flagged: breakoutFlag },
      sustainability: sus, week: { ...week, projection: { ...week.projection, rosValue: value } }, opp, forwardRoleChange,
      trace: {
        rosByWeek: byWeek.get(p.id)!.map((x) => ({ week: x.week, points: round1(x.points) })),
        replacementIndex: repl.get(p.position)?.index ?? 0, replacementPlayerId: repl.get(p.position)?.playerId ?? null,
        replacementLevel: repl.get(p.position)?.level ?? 0, maxVorp: round1(maxVorp), relevant,
        labelThresholds: { strongBuy: 9 * scale, buy: 3 * scale, sell: -3 * scale, strongSell: -9 * scale },
        breakoutRule: { gapRule, forwardRule },
      },
    });
  }
  memo.set(ctx, out);
  return out;
}

function sustainability(ctx: AnalyticsContext, id: string, opp: OpportunityReport): Sustainability {
  const p = ctx.player(id)!;
  const played = ctx.logs(id).filter((g) => g.played);
  const actual = played.reduce((s, g) => s + g.fp, 0);
  const expected = played.reduce((s, g) => s + observedXfp(ctx, p.position, g), 0);
  const K = ctx.snap.sport === "nfl" ? 20 : 60;
  const ratio = Math.round(((actual + K) / (expected + K)) * 100) / 100;
  let tdShare: number | null = null;
  if (ctx.snap.sport === "nfl" && actual > 0) {
    const tdPts = played.reduce((s, g) => s + ((g.stats.rush_td ?? 0) + (g.stats.rec_td ?? 0)) * 6 + (g.stats.pass_td ?? 0) * 4, 0);
    tdShare = Math.round((tdPts / actual) * 100) / 100;
  }
  const adjustments: { label: string; impact: number }[] = [{ label: "Base: 100 − (ratio − 0.9) × 160", impact: round1(100 - (ratio - 0.9) * 160) }];
  let score = 100 - (ratio - 0.9) * 160;
  if (tdShare !== null && tdShare > 0.42) { const d = -(tdShare - 0.42) * 80; score += d; adjustments.push({ label: `TD dependence (${Math.round(tdShare * 100)}% of points > 42%)`, impact: round1(d) }); }
  if (opp.trend === "Falling") { score -= 6; adjustments.push({ label: "Opportunity falling", impact: -6 }); }
  if (opp.trend === "Strongly Falling") { score -= 12; adjustments.push({ label: "Opportunity strongly falling", impact: -12 }); }
  score = Math.round(clamp(score, 0, 100));
  const label: SustainabilityLabel = score >= 85 ? "Highly Sustainable" : score >= 68 ? "Sustainable" : score >= 52 ? "Neutral" : score >= 36 ? "Fragile" : "Likely Regression";
  return { score, label, ratio, tdShare, actual: round1(actual), expected: round1(expected), prior: K, adjustments };
}

export function playerValue(ctx: AnalyticsContext, id: string): PlayerValue | undefined {
  return allValues(ctx).get(id);
}
