import { type AnalyticsContext, playerName, round1 } from "./context";
import { projectMany } from "./projection";
import type { ScenarioOverrides } from "./usage";
import { allValues } from "./value";

export type ScenarioType = "out" | "starts" | "minutes";

export interface ScenarioInput {
  type: ScenarioType;
  playerId: string;
  minutes?: number;
}

export interface ScenarioImpact {
  playerId: string;
  owner: string | null;
  isFreeAgent: boolean;
  before: number;
  after: number;
  delta: number;
  rankBefore: number;
  rankAfter: number;
  usage: { label: string; before: number; after: number; unit: string }[];
  waiverPriority: "HIGH" | "MEDIUM" | "LOW" | null;
}

export interface ScenarioResult {
  input: ScenarioInput;
  subject: ScenarioImpact;
  impacts: ScenarioImpact[];
  chain: string[];
}

function posRank(ctx: AnalyticsContext, playerId: string, value: number, baseline: Map<string, number>) {
  const pos = ctx.player(playerId)!.position;
  let rank = 1;
  for (const p of ctx.snap.players) {
    if (p.id === playerId || p.position !== pos) continue;
    if ((baseline.get(p.id) ?? 0) > value) rank++;
  }
  return rank;
}

/** Recompute a team's usage + projections under a hypothetical, rank the beneficiaries. */
export function runScenario(ctx: AnalyticsContext, input: ScenarioInput): ScenarioResult {
  const subject = ctx.player(input.playerId);
  if (!subject) throw new Error("Unknown player");
  const ov: ScenarioOverrides =
    input.type === "out" ? { out: [input.playerId] }
    : input.type === "starts" ? { starts: [input.playerId] }
    : { minutes: { [input.playerId]: input.minutes ?? 30 } };
  const team = ctx.snap.players.filter((p) => p.teamId === subject.teamId).map((p) => p.id);
  const vals = allValues(ctx);
  const baseAll = new Map(ctx.snap.players.map((p) => [p.id, vals.get(p.id)!.week.projection.median]));
  // Already ruled out? Compare against a healthy baseline so the impact is visible.
  const alreadyOut = input.type === "out" && (subject.status === "out" || subject.status === "ir");
  const before = projectMany(ctx, team, undefined, alreadyOut ? { ignoreStatus: true } : undefined);
  const after = projectMany(ctx, team, undefined, ov);
  const nfl = ctx.snap.sport === "nfl";

  const impact = (id: string): ScenarioImpact => {
    const b = before.get(id)!;
    const a = after.get(id)!;
    const ub = b.usage;
    const ua = a.usage;
    const usage: ScenarioImpact["usage"] = [];
    if (ub?.kind === "nfl" && ua?.kind === "nfl") {
      usage.push({ label: "Snap share", before: Math.round(ub.snapPct * 100), after: Math.round(ua.snapPct * 100), unit: "%" });
      if (ctx.player(id)!.position === "RB") usage.push({ label: "Carries", before: round1(ub.carries), after: round1(ua.carries), unit: "" });
      usage.push({ label: "Targets", before: round1(ub.targets), after: round1(ua.targets), unit: "" });
    } else if (ub?.kind === "nba" && ua?.kind === "nba") {
      usage.push({ label: "Minutes", before: round1(ub.minutes), after: round1(ua.minutes), unit: "" });
      usage.push({ label: "Usage", before: round1(ub.usagePct), after: round1(ua.usagePct), unit: "%" });
    }
    const owner = ctx.ownerOf(id);
    const delta = round1(a.projection.median - b.projection.median);
    const isFreeAgent = owner === null;
    const rel = b.projection.median > 0 ? delta / b.projection.median : delta > 0 ? 1 : 0;
    return {
      playerId: id, owner, isFreeAgent,
      before: b.projection.median, after: a.projection.median, delta,
      rankBefore: posRank(ctx, id, b.projection.median, baseAll), rankAfter: posRank(ctx, id, a.projection.median, baseAll),
      usage,
      waiverPriority: isFreeAgent && delta > 0 ? (rel >= 0.4 && a.projection.median >= (nfl ? 9 : 20) ? "HIGH" : rel >= 0.2 ? "MEDIUM" : "LOW") : null,
    };
  };

  const impacts = team.filter((id) => id !== input.playerId).map(impact).filter((i) => Math.abs(i.delta) >= 0.2).sort((a, b) => b.delta - a.delta);
  const subj = impact(input.playerId);
  const top = impacts[0];
  const name = playerName(subject);
  const verb = input.type === "out" ? "OUT" : input.type === "starts" ? "STARTS" : `PLAYS ${input.minutes} MIN`;
  const chain = [
    alreadyOut ? `${name} ${verb} (already ruled out — compared with a healthy baseline)` : `${name} ${verb}`,
    nfl ? "Targets, carries and red-zone work redistributed by role and depth chart" : "Minutes and usage redistributed by position group and rotation",
  ];
  if (top) {
    const u = top.usage[0];
    chain.push(`${playerName(ctx.player(top.playerId))}: ${u ? `${u.label.toLowerCase()} ${u.before}${u.unit} → ${u.after}${u.unit}` : "role grows"}`);
    chain.push(`Projection ${top.before} → ${top.after} (${top.delta > 0 ? "+" : ""}${top.delta})`);
    if (top.waiverPriority) chain.push(`Waiver priority ${top.waiverPriority}`);
    else chain.push(`Positional rank ${ctx.player(top.playerId)!.position}${top.rankBefore} → ${ctx.player(top.playerId)!.position}${top.rankAfter}`);
  }
  return { input, subject: subj, impacts, chain };
}
