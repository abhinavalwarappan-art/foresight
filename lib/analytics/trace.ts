import { availability } from "./availability";
import { type AnalyticsContext, ewma, playerName, round1 } from "./context";
import { NOT_AVAILABLE, positionPool, trendLabel, trendWindows } from "./opportunity";
import { observedXfp } from "./projection";
import { allValues } from "./value";

/**
 * Explainable traces for every derived metric. Each row is either a number we
 * actually computed/observed, or `null` → rendered as NOT AVAILABLE. Nothing is
 * filled in. Built from the same engine outputs the app uses (no re-implementation
 * of the math, so traces cannot drift from production numbers).
 */
export interface TraceRow {
  label: string;
  value: number | string | null; // null = NOT AVAILABLE
  unit?: string;
  delta?: number | null; // contribution of this step
  running?: number | null; // value after this step
  note?: string;
  kind?: "observed" | "calculated" | "projected" | "market";
}

export interface Trace {
  metric: string;
  result: number | string;
  inputs: TraceRow[];
  steps: TraceRow[];
  reconciles: boolean | null; // do the steps reproduce the engine output?
  notes: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function unavailableFields(ctx: AnalyticsContext, id: string): Set<string> {
  const played = ctx.logs(id).filter((g) => g.played).slice(-4);
  const fields = new Set<string>();
  if (!played.length) return fields;
  const first = (played[0].usage as { unavailable?: string[] }).unavailable ?? [];
  for (const f of first) if (played.every((g) => (g.usage as { unavailable?: string[] }).unavailable?.includes(f))) fields.add(f);
  return fields;
}

export function projectionTrace(ctx: AnalyticsContext, id: string): Trace {
  const v = allValues(ctx).get(id)!;
  const b = v.week;
  const c = b.components;
  const pr = b.projection;
  const missing = unavailableFields(ctx, id);
  const u = b.usage;
  const inputs: TraceRow[] = [];
  if (u?.kind === "nfl") {
    inputs.push(
      { label: "Projected targets / game", value: r2(u.targets), kind: "projected", note: missing.has("targets") ? "source lacks targets" : undefined },
      { label: "Projected carries / game", value: r2(u.carries), kind: "projected" },
      { label: "Projected red-zone opps", value: missing.has("redZoneOpps") ? null : r2(u.rzOpps), kind: "projected", note: missing.has("redZoneOpps") ? "not provided by source → contributes 0" : undefined },
      { label: "Projected snap share", value: missing.has("snapPct") ? null : Math.round(u.snapPct * 100), unit: "%", kind: "projected" },
      { label: "Target share (team)", value: r2(u.targetShare * 100), unit: "%", kind: "calculated" },
      { label: "Carry share (team RBs)", value: r2(u.carryShare * 100), unit: "%", kind: "calculated" },
    );
    if (u.passAtt) inputs.push({ label: "Team pass attempts / game", value: r2(u.passAtt), kind: "calculated" });
  } else if (u?.kind === "nba") {
    inputs.push(
      { label: "Projected minutes", value: r2(u.minutes), kind: "projected" },
      { label: "Projected usage rate", value: r2(u.usagePct), unit: "%", kind: "projected", note: "estimated from FGA/FTA/TOV when the source lacks usage" },
      { label: "Usage boost (teammates out)", value: r2(u.usageBoost), unit: "×", kind: "calculated" },
      { label: "Projected starter", value: missing.has("started") ? null : u.started ? "yes" : "no", kind: "projected" },
    );
  }
  inputs.push(
    { label: "League xFP rate (position)", value: ctx.snap.sport === "nfl" ? r2(ctx.xfpRates.perTarget[v.position] ?? ctx.xfpRates.perPassAtt) : r2(ctx.xfpRates.perMinute[v.position] ?? 0), unit: ctx.snap.sport === "nfl" ? (v.position === "QB" ? "pts/att" : "pts/target") : "pts/min", kind: "calculated" },
    { label: "Sample (played games)", value: c.sampleGames, kind: "observed" },
    { label: "Scheduled games this week", value: c.scheduledGames, kind: "observed" },
  );

  const steps: TraceRow[] = [];
  const baseline = v.opp.recentXfp;
  let running = baseline;
  const step = (label: string, next: number, note?: string, kind: TraceRow["kind"] = "calculated") => {
    steps.push({ label, value: r2(next - running), delta: r2(next - running), running: r2(next), note, kind });
    running = next;
  };
  steps.push({ label: "Baseline — recent opportunity × league-average efficiency (EWMA, last 4 played)", value: r2(baseline), running: r2(baseline), kind: "calculated" });
  step("Opportunity adjustment — projected role (redistribution, depth, restrictions)", b.xfp);
  step(`Recent-form / efficiency adjustment × ${b.efficiency}`, b.xfp * b.efficiency, "player points per xFP, shrunk toward 1.0");
  step(`Matchup adjustment × ${c.matchupClamped}`, b.xfp * b.efficiency * c.matchupClamped, `opponent vs ${v.position} = ${b.matchupFactor} (clamped 0.85–1.15)`);
  if (c.marketGames === 0) {
    steps.push({ label: "Market adjustment", value: null, delta: null, running: r2(running), note: "no betting line for this week — factor 1.00 applied", kind: "market" });
  } else {
    step(`Market adjustment × ${b.envFactor} (implied team total vs league avg)`, running * b.envFactor, `${c.marketGames}/${c.scheduledGames} games priced`, "market");
  }
  if (b.backupQbPenalty) step("Backup-QB adjustment × 0.82", running * 0.82);
  steps.push({ label: "= Per-game median if active", value: c.perGameIfActive, running: c.perGameIfActive, kind: "projected" });
  running = c.perGameIfActive;
  step(`Injury / availability adjustment × play probability ${r2(pr.playProbability)}`, (b.usage?.active ? c.perGameIfActive : 0) * pr.playProbability, b.usage?.active ? undefined : "inactive in usage model (out / not the starting QB)");
  steps.push({ label: "Final median (per game)", value: pr.median, running: pr.median, kind: "projected" });
  if (pr.gamesInWeek > 1) steps.push({ label: `Weekly median (× ${pr.gamesInWeek} games)`, value: pr.weeklyMedian, kind: "projected" });
  steps.push({ label: `Floor ≈ 20th pct (σ ${c.sdPts}, CV ${c.cv} = 0.6×pos ${c.posCv} + 0.4×own ${c.ownCv})`, value: pr.floor, kind: "projected" });
  steps.push({ label: "Ceiling ≈ 80th pct", value: pr.ceiling, kind: "projected" });
  steps.push({ label: "Confidence", value: Math.round(pr.confidence * 100), unit: "%", kind: "calculated" });

  return {
    metric: "Projection", result: pr.median, inputs, steps,
    reconciles: Math.abs(round1(running) - pr.median) <= 0.15,
    notes: [`Model ${pr.modelVersion}`, ...(missing.size ? [`Source did not provide: ${[...missing].join(", ")}`] : [])],
  };
}

export function opportunityTrace(ctx: AnalyticsContext, id: string): Trace {
  const v = allValues(ctx).get(id)!;
  const o = v.opp;
  const pool = positionPool(ctx, v.position);
  const p = ctx.player(id)!;
  const series = ctx.logs(id).filter((g) => g.played).map((g) => observedXfp(ctx, p.position, g));
  const win = trendWindows(series, ctx.snap.sport === "nfl" ? [2, 3] : [4, 6]);
  const inputs: TraceRow[] = o.signals.map((s) => ({ label: s.label, value: s.value === NOT_AVAILABLE ? null : s.value, kind: "observed" }));
  if (v.week.usage?.kind === "nfl") {
    inputs.push({ label: "Projected target share", value: r2(v.week.usage.targetShare * 100), unit: "%", kind: "calculated" });
    inputs.push({ label: "Projected carry share", value: r2(v.week.usage.carryShare * 100), unit: "%", kind: "calculated" });
  }
  const exactRecent = ewma(series.slice(-4)); // unrounded, as the engine ranks it
  const below = pool.xfp.filter((x) => x < exactRecent).length;
  const steps: TraceRow[] = [
    { label: "Recent xFP / game (EWMA of last 4 played, league-avg efficiency)", value: o.recentXfp, kind: "calculated" },
    { label: `Position pool (${v.position}) size`, value: pool.xfp.length, kind: "calculated" },
    { label: "Players in pool with lower recent xFP", value: below, kind: "calculated" },
    { label: "Opportunity Score = percentile", value: o.score, kind: "calculated" },
    { label: "Trend: recent window mean xFP", value: win ? r2(win.recent) : null, kind: "calculated" },
    { label: "Trend: prior window mean xFP", value: win ? r2(win.prior) : null, kind: "calculated" },
    { label: "Trend % = (recent − prior) / base × n/(n+2)", value: win ? o.trendPct : null, unit: "%", note: win ? undefined : "needs ≥ recent+2 played games", kind: "calculated" },
    { label: "Trend label (±10 / ±25 thresholds)", value: trendLabel(o.trendPct), kind: "calculated" },
    { label: "Production Score (recent fantasy pts percentile)", value: o.productionScore, kind: "calculated" },
    { label: "Recent fantasy points / game (observed EWMA)", value: o.recentFp, kind: "observed" },
  ];
  return { metric: "Opportunity Score", result: o.score, inputs, steps, reconciles: pool.xfp.length ? Math.round((below / pool.xfp.length) * 100) === o.score : null, notes: [] };
}

export function availabilityTrace(ctx: AnalyticsContext, id: string): Trace {
  const a = availability(ctx, id);
  const inj = ctx.injury(id);
  const inputs: TraceRow[] = [
    { label: "Official designation", value: a.status, kind: "observed" },
    { label: "Practice participation", value: inj?.practice.length ? inj.practice.join(" / ") : null, kind: "observed", note: inj ? undefined : "not on report" },
    { label: "Minutes restriction", value: inj?.minutesRestriction ?? null, kind: "observed" },
    { label: "Games missed (last 4 team games)", value: ctx.logs(id).slice(-4).filter((g) => !g.played).length, kind: "observed" },
    { label: "Prior-season games missed", value: ctx.snap.injuryHistory.length ? ctx.snap.injuryHistory.filter((h) => h.playerId === id).reduce((s, h) => s + h.gamesMissed, 0) : null, kind: "observed", note: ctx.snap.injuryHistory.length ? undefined : "no injury-history provider" },
    { label: "Back-to-back / short rest", value: null, note: "schedule-based detection not implemented", kind: "observed" },
  ];
  let running = a.base;
  const steps: TraceRow[] = [{ label: `Base for "${a.status}"`, value: a.base, running: a.base, kind: "calculated" }];
  for (const f of a.factors.filter((x) => !x.label.startsWith("Designation"))) {
    running += f.impact;
    steps.push({ label: f.label, value: f.impact, delta: f.impact, running, note: f.detail, kind: "calculated" });
  }
  steps.push({ label: "Clamp 0–99 → Availability Score", value: a.score, running: a.score, kind: "calculated" });
  steps.push({ label: "Play probability (0 if out/IR, else score/100 + 0.02)", value: r2(a.playProbability), kind: "calculated" });
  steps.push({ label: `Workload points → ${a.workloadUncertainty}`, value: a.workloadPoints, kind: "calculated" });
  return { metric: "Availability Score", result: a.score, inputs, steps, reconciles: Math.round(Math.min(99, Math.max(0, running))) === a.score, notes: ["Participation estimate — not a medical prediction."] };
}

export function valueTrace(ctx: AnalyticsContext, id: string): Trace {
  const v = allValues(ctx).get(id)!;
  const t = v.trace;
  const inputs: TraceRow[] = t.rosByWeek.map((w) => ({ label: `Week ${w.week} weekly median`, value: w.points, kind: "projected" }));
  const repl = t.replacementPlayerId ? ctx.player(t.replacementPlayerId) : undefined;
  const steps: TraceRow[] = [
    { label: "ROS points (sum of weekly medians)", value: v.rosPoints, kind: "projected" },
    { label: `Replacement level: ${v.position}${t.replacementIndex + 1} (${playerName(repl)})`, value: t.replacementLevel, kind: "calculated" },
    { label: "VORP = ROS − replacement", value: v.vorp, kind: "calculated" },
    { label: "Max VORP in league", value: t.maxVorp, kind: "calculated" },
    { label: v.vorp > 0 ? "Value = 30 + 70 × (VORP/max)^0.65" : "Value = clamp(30 + VORP/max × 60, 0, 29)", value: v.value, kind: "calculated" },
    { label: "Market rank (consensus)", value: `${v.position}${v.marketPosRank}`, kind: "market", note: ctx.snap.isMock ? "mock consensus: season PPG + noise" : "consensus proxy: season PPG rank" },
    { label: "Model rank (ROS points)", value: `${v.position}${v.modelPosRank}`, kind: "calculated" },
    { label: "Rank delta (market − model)", value: v.rankDelta, kind: "calculated" },
    { label: `Label thresholds: ≥${t.labelThresholds.strongBuy} SB, ≥${t.labelThresholds.buy} B, ≤${t.labelThresholds.sell} S, ≤${t.labelThresholds.strongSell} SS`, value: t.relevant ? v.label : `${v.label} (not fantasy-relevant → HOLD)`, kind: "calculated" },
    { label: "Value trend = trend% × 0.25 + forward role % × 0.08 (±15)", value: v.valueTrend, kind: "calculated" },
  ];
  const sum = round1(t.rosByWeek.reduce((s, w) => s + w.points, 0));
  return { metric: "Fantasy Value", result: v.value, inputs, steps, reconciles: Math.abs(sum - v.rosPoints) <= 0.5, notes: [] };
}

export function breakoutTrace(ctx: AnalyticsContext, id: string): Trace {
  const v = allValues(ctx).get(id)!;
  const steps: TraceRow[] = [
    { label: "Opportunity Score", value: v.opp.score, kind: "calculated" },
    { label: "Production Score", value: v.opp.productionScore, kind: "calculated" },
    { label: "Gap = opportunity − production", value: v.breakout.gap, kind: "calculated" },
    { label: "Opportunity trend %", value: v.opp.trendPct, unit: "%", kind: "calculated" },
    { label: "Forward role change (projected vs recent xFP)", value: v.forwardRoleChange, unit: "%", kind: "projected" },
    { label: "Score = 50 + gap + trend×0.5 + max(0, fwd)×0.3 (0–100)", value: v.breakout.score, kind: "calculated" },
    { label: "Rule A: gap ≥ 12 AND trend rising", value: v.trace.breakoutRule.gapRule ? "PASS" : "fail", kind: "calculated" },
    { label: "Rule B: forward role ≥ +30% AND projected > 0", value: v.trace.breakoutRule.forwardRule ? "PASS" : "fail", kind: "calculated" },
    { label: "Flagged (A or B)", value: v.breakout.flagged ? "YES" : "no", kind: "calculated" },
  ];
  return { metric: "Breakout Score", result: v.breakout.score, inputs: [], steps, reconciles: null, notes: [] };
}

export function regressionTrace(ctx: AnalyticsContext, id: string): Trace {
  const s = allValues(ctx).get(id)!.sustainability;
  const inputs: TraceRow[] = [
    { label: "Season fantasy points (observed)", value: s.actual, kind: "observed" },
    { label: "Season expected points from usage (xFP)", value: s.expected, kind: "calculated" },
    { label: "Shrinkage prior K (points)", value: s.prior, kind: "calculated" },
    { label: "TD share of points", value: s.tdShare === null ? null : Math.round(s.tdShare * 100), unit: "%", kind: "calculated", note: s.tdShare === null ? "NBA / no points" : undefined },
  ];
  let running = 0;
  const steps: TraceRow[] = [{ label: "Ratio = (actual + K) / (expected + K)", value: s.ratio, kind: "calculated" }];
  for (const a of s.adjustments) {
    running += a.impact;
    steps.push({ label: a.label, value: a.impact, delta: a.impact, running: round1(running), kind: "calculated" });
  }
  steps.push({ label: "Clamp 0–100 → Sustainability Score", value: s.score, kind: "calculated" });
  steps.push({ label: "Label (≥85 / 68 / 52 / 36)", value: s.label, kind: "calculated" });
  return { metric: "Regression / Sustainability", result: s.score, inputs, steps, reconciles: Math.round(Math.min(100, Math.max(0, running))) === s.score, notes: ["Higher = more sustainable. Low scores flag likely regression."] };
}

export function allTraces(ctx: AnalyticsContext, id: string): Trace[] {
  return [projectionTrace(ctx, id), opportunityTrace(ctx, id), availabilityTrace(ctx, id), valueTrace(ctx, id), breakoutTrace(ctx, id), regressionTrace(ctx, id)];
}
