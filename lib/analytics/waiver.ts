import { type AnalyticsContext, clamp, round1 } from "./context";
import { analyzeRoster, groupOf, teamProfile } from "./roster";
import { allValues } from "./value";

export interface WaiverRec {
  playerId: string;
  rosterFit: number; // 0–100
  priority: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
  drop: string | null;
  weeklyBefore: number;
  weeklyAfter: number;
  thisWeekDelta: number;
}

/** Personalized waiver board: who helps THIS roster most, and who to cut for them. */
export function waiverRecommendations(ctx: AnalyticsContext, teamId = ctx.userTeamId, limit = 12): WaiverRec[] {
  const vals = allValues(ctx);
  const rostered = new Set(ctx.snap.rosters.flatMap((r) => [...r.playerIds, ...r.irIds]));
  const roster = ctx.rosterOf(teamId);
  const analysis = analyzeRoster(ctx, teamId);
  const base = analysis.profile;
  const starters = new Set(base.lineupRos.starters.map((s) => s.playerId));
  // Drop candidate: lowest ROS-value bench player
  const bench = roster.filter((id) => !starters.has(id)).sort((a, b) => (vals.get(a)!.value) - (vals.get(b)!.value));
  const worstBench = bench[0] ?? null;

  const pool = ctx.snap.players
    .filter((p) => !rostered.has(p.id) && p.status !== "out" && p.status !== "ir")
    .map((p) => vals.get(p.id)!)
    .filter((v) => v.week.projection.median > 0)
    .sort((a, b) => b.rosPoints - a.rosPoints)
    .slice(0, 40);

  const recs = pool.map((v) => {
    const p = ctx.player(v.playerId)!;
    const g = groupOf(p.position);
    const sameGroupBench = bench.filter((id) => groupOf(ctx.player(id)!.position) === g);
    const drop = worstBench;
    const after = teamProfile(ctx, teamId, roster.filter((id) => id !== drop).concat(v.playerId));
    const weeklyGain = round1(after.weeklyRos - base.weeklyRos);
    const thisWeekDelta = round1(after.weeklyThisWeek - base.weeklyThisWeek);
    const need = 100 - (analysis.groupStrength[g] ?? 50);
    const reasons: string[] = [];
    if ((analysis.groupStrength[g] ?? 50) < 45) reasons.push(`Your ${g} group grades ${analysis.groupStrength[g]}/100 — a weak spot`);
    if (v.opp.trend === "Rising" || v.opp.trend === "Strongly Rising") reasons.push(`Opportunity ${v.opp.trend.toLowerCase()} (${v.opp.trendPct > 0 ? "+" : ""}${v.opp.trendPct}%)`);
    if (v.tags.includes("INJURY OPPORTUNITY")) reasons.push(`Teammate injury: projected role +${Math.round(v.forwardRoleChange)}% vs recent usage`);
    if (v.breakout.flagged) reasons.push(`Breakout signal: opportunity ${v.opp.score} vs production ${v.opp.productionScore}`);
    const benchBest = sameGroupBench.map((id) => vals.get(id)!).sort((a, b) => b.week.projection.ceiling - a.week.projection.ceiling)[0];
    if (benchBest && v.week.projection.ceiling > benchBest.week.projection.ceiling) {
      reasons.push(`Higher ceiling (${v.week.projection.ceiling}) than your best ${g} bench option (${benchBest.week.projection.ceiling})`);
    }
    if (weeklyGain > 0) reasons.push(`Adds ${weeklyGain} pts/week to your optimal lineup`);
    const fit = Math.round(clamp(
      35 + weeklyGain * (ctx.snap.sport === "nfl" ? 6 : 1.2) + need * 0.25 + Math.max(0, v.opp.trendPct) * 0.4 + (v.tags.includes("INJURY OPPORTUNITY") ? 10 : 0) + v.value * 0.2,
      0, 99));
    return {
      playerId: v.playerId, rosterFit: fit, priority: fit >= 75 ? "HIGH" : fit >= 55 ? "MEDIUM" : "LOW",
      reasons: reasons.length ? reasons : ["Best available depth at the position"], drop,
      weeklyBefore: base.weeklyRos, weeklyAfter: after.weeklyRos, thisWeekDelta,
    } satisfies WaiverRec;
  });
  return recs.sort((a, b) => b.rosterFit - a.rosterFit).slice(0, limit);
}
