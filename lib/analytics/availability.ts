import type { InjuryDesignation } from "@/lib/domain/types";
import { type AnalyticsContext, clamp } from "./context";

/**
 * Availability / participation risk. Deliberately NOT a medical prediction:
 * it estimates how likely a player is to suit up and how settled the workload is,
 * from designations, practice, recent absences and history. Every factor is listed.
 */
export type PlayLabel = "Very Likely" | "Likely" | "Uncertain" | "Unlikely" | "Ruled Out";
export type WorkloadLabel = "Low" | "Moderate" | "Elevated" | "High";

export interface AvailabilityFactor {
  label: string;
  impact: number; // points on the 0–100 scale, signed
  detail: string;
}

export interface Availability {
  score: number; // 0–100
  playProbability: number; // 0–1
  expectedToPlay: PlayLabel;
  workloadUncertainty: WorkloadLabel;
  status: InjuryDesignation;
  factors: AvailabilityFactor[];
  /** Trace values: designation base score, unclamped sum, workload points. */
  base: number;
  rawScore: number;
  workloadPoints: number;
}

const BASE: Record<InjuryDesignation, number> = {
  healthy: 96, probable: 88, "day-to-day": 72, questionable: 55, doubtful: 18, out: 0, ir: 0,
};

export function availability(ctx: AnalyticsContext, playerId: string): Availability {
  const p = ctx.player(playerId);
  const status = p?.status ?? "healthy";
  const inj = ctx.injury(playerId);
  const factors: AvailabilityFactor[] = [];
  let score = BASE[status];
  if (status !== "healthy") {
    factors.push({ label: `Designation: ${status}`, impact: BASE[status] - 96, detail: inj?.note ?? "Official status from the injury report." });
  }

  if (inj && inj.practice.length && status !== "out" && status !== "ir") {
    const last = inj.practice[inj.practice.length - 1];
    const adj = last === "FP" ? 10 : last === "LP" ? 0 : -14;
    if (adj !== 0) factors.push({ label: `Practice: ${inj.practice.join(" / ")}`, impact: adj, detail: last === "FP" ? "Closed the week as a full participant." : "Did not practice late in the week." });
    else factors.push({ label: `Practice: ${inj.practice.join(" / ")}`, impact: 0, detail: "Limited sessions — playing, but workload may be managed." });
    score += adj;
  }

  const recent = ctx.logs(playerId).slice(-4);
  const missed = recent.filter((g) => !g.played).length;
  const hadRole = ctx.logs(playerId).some((g) => g.played);
  if (missed > 0 && hadRole && status !== "out" && status !== "ir") {
    const adj = -4 * missed;
    score += adj;
    factors.push({ label: `Missed ${missed} of last ${recent.length}`, impact: adj, detail: "Recent absences raise the chance of another missed game or a managed return." });
  }

  const history = ctx.snap.injuryHistory.filter((h) => h.playerId === playerId);
  const histMissed = history.reduce((s, h) => s + h.gamesMissed, 0);
  if (histMissed >= 5 && status !== "out" && status !== "ir") {
    score -= 3;
    factors.push({ label: `History: ${histMissed} games missed (prior seasons)`, impact: -3, detail: history.map((h) => `${h.bodyPart} '${String(h.season).slice(2)}`).join(", ") });
  }
  if (inj?.bodyPart && history.some((h) => h.bodyPart === inj.bodyPart) && status !== "out") {
    score -= 4;
    factors.push({ label: `Recurring: ${inj.bodyPart}`, impact: -4, detail: "Same body part as a prior absence." });
  }

  const rawScore = score;
  score = Math.round(clamp(score, 0, 99));
  const playProbability = status === "out" || status === "ir" ? 0 : clamp(score / 100 + 0.02, 0, 0.99);
  const expectedToPlay: PlayLabel =
    playProbability === 0 ? "Ruled Out" : playProbability >= 0.85 ? "Very Likely" : playProbability >= 0.65 ? "Likely" : playProbability >= 0.35 ? "Uncertain" : "Unlikely";

  let wl = 0;
  if (inj?.minutesRestriction) {
    wl += 2;
    factors.push({ label: `Minutes limit ~${inj.minutesRestriction}`, impact: 0, detail: "Reported restriction caps projected minutes." });
  }
  if (inj?.practice.includes("LP") || inj?.practice.includes("DNP")) wl += 1;
  if (missed > 0) wl += 1;
  if (status === "questionable" || status === "day-to-day") wl += 1;
  const workloadUncertainty: WorkloadLabel = status === "out" || status === "ir" ? "High" : wl >= 3 ? "High" : wl === 2 ? "Elevated" : wl === 1 ? "Moderate" : "Low";

  return { score, playProbability, expectedToPlay, workloadUncertainty, status, factors, base: BASE[status], rawScore, workloadPoints: wl };
}
