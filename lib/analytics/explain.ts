import type { PlayerValue } from "./value";
import type { Availability } from "./availability";

/**
 * "What's changing?" — a narrative built ONLY from structured engine output.
 * Deterministic so it works without an LLM; the AI analyst can expand on it via tools.
 */
export function whatsChanging(name: string, v: PlayerValue, a: Availability, teammatesOut: string[]): string[] {
  const out: string[] = [];
  const o = v.opp;
  if (v.forwardRoleChange >= 20 && teammatesOut.length) {
    out.push(`${teammatesOut.join(", ")} ${teammatesOut.length > 1 ? "are" : "is"} out. Redistributed work lifts ${name}'s expected opportunity ${Math.round(v.forwardRoleChange)}% above recent usage.`);
  } else if (v.forwardRoleChange <= -20) {
    out.push(`Projected role is ${Math.abs(Math.round(v.forwardRoleChange))}% below recent usage${a.playProbability === 0 ? " — not expected to play this week" : ""}.`);
  }
  if (o.trend !== "Stable") out.push(`Opportunity is ${o.trend.toLowerCase()} (${o.trendPct > 0 ? "+" : ""}${o.trendPct}% recent window vs prior).`);
  if (v.breakout.flagged && v.breakout.gap >= 8) out.push(`Opportunity score ${o.score} vs production score ${o.productionScore}: usage is ahead of the box score — a classic pre-breakout gap.`);
  const s = v.sustainability;
  if (s.label === "Likely Regression" || s.label === "Fragile") {
    out.push(`Producing ${Math.round((s.ratio - 1) * 100)}% above what this usage typically yields${s.tdShare !== null ? `, with ${Math.round(s.tdShare * 100)}% of points from touchdowns` : ""}. Expect some give-back.`);
  } else if (s.ratio < 0.92) {
    out.push(`Producing ${Math.round((1 - s.ratio) * 100)}% below what this usage usually yields — positive regression is more likely than not.`);
  }
  if (Math.abs(v.rankDelta) >= 3) {
    out.push(`Market rank ${v.position}${v.marketPosRank}; model rank ${v.position}${v.modelPosRank} → ${v.label}.`);
  }
  if (a.factors.length && a.status !== "healthy") out.push(`Availability ${a.score}/100 (${a.expectedToPlay.toLowerCase()} to play): ${a.factors[0].label.toLowerCase()}.`);
  if (!out.length) out.push("Role, efficiency and availability are all stable. Current value reflects the projection.");
  return out;
}
