import { type AnalyticsContext, clamp, playerName, round1 } from "./context";
import { analyzeRoster, GROUPS, leagueProfiles, teamProfile } from "./roster";
import { baselineOdds, simulateSeason } from "./simulation";
import { allValues } from "./value";

/**
 * Trade Lab. Every trade is evaluated from BOTH sides:
 *   rosters change → optimal lineups re-solved → weekly projections recomputed →
 *   positional strength/depth re-graded → season re-simulated → fairness & incentives.
 */

export interface TradeInput {
  teamA: string;
  teamB: string;
  aGives: string[];
  bGives: string[];
}

export interface TradeSideResult {
  teamId: string;
  receives: string[];
  sends: string[];
  weeklyBefore: number;
  weeklyAfter: number;
  weeklyDelta: number;
  thisWeekDelta: number;
  groupStrength: { group: string; before: number; after: number }[];
  groupDepth: { group: string; before: number; after: number }[];
  valueSent: number;
  valueReceived: number;
  rosSent: number;
  rosReceived: number;
  playoffBefore: number;
  playoffAfter: number;
  champBefore: number;
  champAfter: number;
  floorDelta: number;
  ceilingDelta: number;
  availabilityDelta: number;
  benefitPct: number; // relative change in weekly ROS lineup strength
  notes: string[];
}

export interface TradeResult {
  a: TradeSideResult;
  b: TradeSideResult;
  fairness: number; // 0–100 (raw value balance)
  verdict: "WIN-WIN" | "FAVORS A" | "FAVORS B" | "LOSE-LOSE" | "NEUTRAL";
  acceptance: AcceptanceEstimate;
  chain: string[];
}

export interface AcceptanceEstimate {
  level: "LOW" | "MEDIUM" | "HIGH";
  score: number; // 0–100 heuristic
  reasons: string[];
  disclaimer: string;
}

function applyTrade(ctx: AnalyticsContext, t: TradeInput) {
  const a = ctx.rosterOf(t.teamA).filter((id) => !t.aGives.includes(id)).concat(t.bGives);
  const b = ctx.rosterOf(t.teamB).filter((id) => !t.bGives.includes(id)).concat(t.aGives);
  return { a, b };
}

export function validateTrade(ctx: AnalyticsContext, t: TradeInput): string | null {
  if (t.teamA === t.teamB) return "A trade needs two different teams.";
  if (!t.aGives.length || !t.bGives.length) return "Each side must send at least one player.";
  const ra = new Set(ctx.rosterOf(t.teamA));
  const rb = new Set(ctx.rosterOf(t.teamB));
  if (t.aGives.some((id) => !ra.has(id))) return "Team A can only send players on its roster.";
  if (t.bGives.some((id) => !rb.has(id))) return "Team B can only send players on its roster.";
  return null;
}

export function evaluateTrade(ctx: AnalyticsContext, t: TradeInput, opts: { simulate?: boolean } = {}): TradeResult {
  const simulate = opts.simulate ?? true;
  const vals = allValues(ctx);
  const league = leagueProfiles(ctx);
  const after = applyTrade(ctx, t);
  const odds = simulate ? baselineOdds(ctx) : null;
  const pa = teamProfile(ctx, t.teamA, after.a);
  const pb = teamProfile(ctx, t.teamB, after.b);
  const oddsAfter = simulate ? simulateSeason(ctx, { [t.teamA]: pa.weeklyRos, [t.teamB]: pb.weeklyRos }) : null;

  const side = (teamId: string, sends: string[], receives: string[], prof: typeof pa): TradeSideResult => {
    const before = league.get(teamId)!;
    const rBefore = analyzeRoster(ctx, teamId);
    const rAfter = analyzeRoster(ctx, teamId, prof.playerIds);
    const sum = (ids: string[], f: (id: string) => number) => round1(ids.reduce((s, id) => s + f(id), 0));
    const groups = GROUPS[ctx.snap.sport];
    const weeklyDelta = round1(prof.weeklyRos - before.weeklyRos);
    const notes: string[] = [];
    for (const g of groups) {
      const d = rAfter.groupStrength[g] - rBefore.groupStrength[g];
      if (d >= 8) notes.push(`${g} starters improve ${rBefore.groupStrength[g]} → ${rAfter.groupStrength[g]}`);
      if (d <= -8) notes.push(`${g} starters weaken ${rBefore.groupStrength[g]} → ${rAfter.groupStrength[g]}`);
      const dd = rAfter.groupDepthScore[g] - rBefore.groupDepthScore[g];
      if (dd <= -15) notes.push(`${g} depth thins ${rBefore.groupDepthScore[g]} → ${rAfter.groupDepthScore[g]}`);
    }
    const overflow = prof.playerIds.length - ctx.rosterOf(teamId).length;
    if (overflow > 0) notes.push(`Must clear ${overflow} roster spot${overflow > 1 ? "s" : ""} (drop a bench player)`);
    const benchOnly = receives.every((id) => !prof.lineupRos.starters.some((s) => s.playerId === id));
    if (benchOnly) notes.push("Incoming players would not crack the optimal lineup");
    return {
      teamId, receives, sends,
      weeklyBefore: before.weeklyRos, weeklyAfter: prof.weeklyRos, weeklyDelta,
      thisWeekDelta: round1(prof.weeklyThisWeek - before.weeklyThisWeek),
      groupStrength: groups.map((g) => ({ group: g, before: rBefore.groupStrength[g], after: rAfter.groupStrength[g] })),
      groupDepth: groups.map((g) => ({ group: g, before: rBefore.groupDepthScore[g], after: rAfter.groupDepthScore[g] })),
      valueSent: sum(sends, (id) => vals.get(id)?.value ?? 0),
      valueReceived: sum(receives, (id) => vals.get(id)?.value ?? 0),
      rosSent: sum(sends, (id) => vals.get(id)?.rosPoints ?? 0),
      rosReceived: sum(receives, (id) => vals.get(id)?.rosPoints ?? 0),
      playoffBefore: odds?.get(teamId)?.playoffProb ?? 0,
      playoffAfter: oddsAfter?.get(teamId)?.playoffProb ?? 0,
      champBefore: odds?.get(teamId)?.champProb ?? 0,
      champAfter: oddsAfter?.get(teamId)?.champProb ?? 0,
      floorDelta: round1(prof.floorThisWeek - before.floorThisWeek),
      ceilingDelta: round1(prof.ceilingThisWeek - before.ceilingThisWeek),
      availabilityDelta: round1(prof.avgAvailability - before.avgAvailability),
      benefitPct: round1((weeklyDelta / Math.max(1, before.weeklyRos)) * 100),
      notes,
    };
  };

  const a = side(t.teamA, t.aGives, t.bGives, pa);
  const b = side(t.teamB, t.bGives, t.aGives, pb);

  // Fairness: balance of rest-of-season VORP-style value moving each way.
  const vorp = (ids: string[]) => ids.reduce((s, id) => s + Math.max(0, vals.get(id)?.vorp ?? 0) + (vals.get(id)?.rosPoints ?? 0) * 0.15, 0);
  const va = vorp(t.aGives);
  const vb = vorp(t.bGives);
  const fairness = Math.round(clamp(100 - (Math.abs(va - vb) / Math.max(1, Math.max(va, vb))) * 100, 0, 100));

  const tol = 0.5;
  const verdict: TradeResult["verdict"] =
    a.benefitPct > tol && b.benefitPct > tol ? "WIN-WIN"
    : a.benefitPct < -tol && b.benefitPct < -tol ? "LOSE-LOSE"
    : a.benefitPct - b.benefitPct > 1.5 ? "FAVORS A"
    : b.benefitPct - a.benefitPct > 1.5 ? "FAVORS B" : "NEUTRAL";

  const nm = (ids: string[]) => ids.map((id) => playerName(ctx.player(id))).join(" + ");
  const chain = [
    `${nm(t.aGives)} ⇄ ${nm(t.bGives)}`,
    "Rosters swapped; optimal lineups re-solved for both teams",
    `Weekly ROS lineup: A ${a.weeklyDelta >= 0 ? "+" : ""}${a.weeklyDelta}, B ${b.weeklyDelta >= 0 ? "+" : ""}${b.weeklyDelta}`,
    simulate ? `Season re-simulated (${a.champBefore}% → ${a.champAfter}% / ${b.champBefore}% → ${b.champAfter}% title odds)` : "Season simulation skipped",
    `Value balance → fairness ${fairness}/100 → ${verdict}`,
  ];

  return { a, b, fairness, verdict, acceptance: acceptanceEstimate(ctx, b, fairness), chain };
}

/** Heuristic only — we cannot know another person's preferences. */
export function acceptanceEstimate(ctx: AnalyticsContext, them: TradeSideResult, fairness: number): AcceptanceEstimate {
  const vals = allValues(ctx);
  const reasons: string[] = [];
  let score = 40;
  if (them.benefitPct > 2) { score += 22; reasons.push(`Their weekly lineup improves ${them.benefitPct}%`); }
  else if (them.benefitPct > 0.5) { score += 10; reasons.push("Modest lineup improvement for them"); }
  else if (them.benefitPct < -1) { score -= 22; reasons.push("Their starting lineup gets worse"); }
  if (fairness >= 85) { score += 15; reasons.push("Raw value is closely balanced"); }
  else if (fairness < 65) { score -= 15; reasons.push("Raw value is lopsided — managers anchor on name value"); }
  const filled = them.groupStrength.filter((g) => g.after - g.before >= 10);
  if (filled.length) { score += 10; reasons.push(`Fills a need at ${filled.map((g) => g.group).join(", ")}`); }
  const thinned = them.groupDepth.filter((g) => g.after - g.before <= -20);
  if (thinned.length) { score -= 8; reasons.push(`Costs them depth at ${thinned.map((g) => g.group).join(", ")}`); }
  const hotIncoming = them.receives.filter((id) => (vals.get(id)?.valueTrend ?? 0) >= 4);
  if (hotIncoming.length) { score += 5; reasons.push("They receive a player whose value is trending up"); }
  const sellingHot = them.sends.filter((id) => (vals.get(id)?.valueTrend ?? 0) >= 4);
  if (sellingHot.length) { score -= 6; reasons.push("They'd give up a player on the rise — harder sell"); }
  score = Math.round(clamp(score, 0, 100));
  return {
    level: score >= 65 ? "HIGH" : score >= 42 ? "MEDIUM" : "LOW",
    score, reasons,
    disclaimer: "Heuristic estimate from value balance, roster need and incentives — not a prediction of any manager's behavior.",
  };
}
