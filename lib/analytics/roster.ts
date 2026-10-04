import type { Position } from "@/lib/domain/types";
import { type AnalyticsContext, clamp, mean, round1, sd } from "./context";
import { optimalLineup, type LineupResult } from "./lineup";
import { allValues } from "./value";

/**
 * Roster intelligence. "Weekly strength" uses rest-of-season points per remaining
 * week, so a single bad matchup or a one-week absence doesn't distort roster grades.
 */

export type PosGroup = "QB" | "RB" | "WR" | "TE" | "G" | "F" | "C";
export const GROUPS: Record<"nfl" | "nba", PosGroup[]> = { nfl: ["QB", "RB", "WR", "TE"], nba: ["G", "F", "C"] };
export const groupOf = (pos: Position): PosGroup =>
  pos === "PG" || pos === "SG" ? "G" : pos === "SF" || pos === "PF" ? "F" : (pos as PosGroup);

export interface TeamProfile {
  teamId: string;
  playerIds: string[];
  lineupThisWeek: LineupResult; // current-week projections (injuries applied)
  lineupRos: LineupResult; // ROS points per remaining week
  weeklyThisWeek: number;
  weeklyRos: number;
  floorThisWeek: number;
  ceilingThisWeek: number;
  varianceThisWeek: number;
  groupStarter: Record<string, number>; // ROS weekly pts from starters in group
  groupDepth: Record<string, number>; // best bench ROS weekly pts in group
  avgAvailability: number;
  rosTotal: number;
}

export function remainingWeeks(ctx: AnalyticsContext) {
  return Math.max(1, ctx.snap.league.totalWeeks - ctx.snap.currentWeek + 1);
}

export function teamProfile(ctx: AnalyticsContext, teamId: string, rosterOverride?: string[]): TeamProfile {
  const vals = allValues(ctx);
  const ids = rosterOverride ?? ctx.rosterOf(teamId);
  const rw = remainingWeeks(ctx);
  const cand = (f: (id: string) => number) =>
    ids.map((id) => ({ playerId: id, position: ctx.player(id)!.position, value: f(id) }));
  const slots = ctx.snap.league.slots;
  const lineupThisWeek = optimalLineup(cand((id) => vals.get(id)?.week.projection.weeklyMedian ?? 0), slots);
  const lineupRos = optimalLineup(cand((id) => (vals.get(id)?.rosPoints ?? 0) / rw), slots);

  const groupStarter: Record<string, number> = {};
  const groupDepth: Record<string, number> = {};
  for (const s of lineupRos.starters) {
    if (!s.playerId) continue;
    const g = groupOf(ctx.player(s.playerId)!.position);
    groupStarter[g] = round1((groupStarter[g] ?? 0) + s.value);
  }
  for (const id of lineupRos.bench) {
    const g = groupOf(ctx.player(id)!.position);
    const v = (vals.get(id)?.rosPoints ?? 0) / rw;
    groupDepth[g] = round1(Math.max(groupDepth[g] ?? 0, v));
  }

  const starterIds = lineupThisWeek.starters.map((s) => s.playerId).filter((x): x is string => Boolean(x));
  const weekProj = starterIds.map((id) => vals.get(id)!.week.projection);
  return {
    teamId, playerIds: ids, lineupThisWeek, lineupRos,
    weeklyThisWeek: lineupThisWeek.total, weeklyRos: lineupRos.total,
    floorThisWeek: round1(weekProj.reduce((s, p) => s + p.weeklyMedian - (p.median - p.floor) * Math.sqrt(p.gamesInWeek), 0)),
    ceilingThisWeek: round1(weekProj.reduce((s, p) => s + p.weeklyMedian + (p.ceiling - p.median) * Math.sqrt(p.gamesInWeek), 0)),
    varianceThisWeek: weekProj.reduce((s, p) => s + p.variance * Math.max(1, p.gamesInWeek), 0),
    groupStarter, groupDepth,
    avgAvailability: round1(mean(starterIds.map((id) => vals.get(id)!.week.projection.playProbability * 100))),
    rosTotal: round1(ids.reduce((s, id) => s + (vals.get(id)?.rosPoints ?? 0), 0)),
  };
}

const leagueMemo = new WeakMap<AnalyticsContext, Map<string, TeamProfile>>();
export function leagueProfiles(ctx: AnalyticsContext): Map<string, TeamProfile> {
  const hit = leagueMemo.get(ctx);
  if (hit) return hit;
  const m = new Map(ctx.snap.fantasyTeams.map((t) => [t.id, teamProfile(ctx, t.id)]));
  leagueMemo.set(ctx, m);
  return m;
}

/** Map a raw value to 0–100 against the league distribution (50 = league average). */
export function scoreVsLeague(v: number, all: number[]): number {
  const m = mean(all);
  const s = sd(all) || Math.max(1, m * 0.1);
  return Math.round(clamp(50 + 22 * ((v - m) / s), 1, 99));
}

export interface Weakness {
  slot: string;
  severity: "CRITICAL" | "MODERATE" | "STRONG" | "OK";
  deltaPerWeek: number; // vs league average for that slot, ROS points/week
  group: PosGroup;
  note: string;
}

export interface RosterAnalysis {
  profile: TeamProfile;
  scores: {
    overall: number; lineup: number; depth: number; upside: number; floor: number; availability: number; ros: number;
  };
  groupStrength: Record<string, number>;
  groupDepthScore: Record<string, number>;
  weaknesses: Weakness[];
  leagueAvgWeekly: number;
}

/** Ordinal slot labels: RB1, RB2, WR1… (NBA uses the slot names directly). */
function slotLabels(ctx: AnalyticsContext, lineup: LineupResult) {
  const counters: Record<string, number> = {};
  return lineup.starters.map((s) => {
    const pos = s.playerId ? ctx.player(s.playerId)!.position : s.slot;
    if (ctx.snap.sport === "nba") return { label: s.slot as string, value: s.value, pos, slot: s.slot };
    const key = s.slot === "FLEX" ? "FLEX" : pos;
    counters[key] = (counters[key] ?? 0) + 1;
    return { label: key === "FLEX" ? "FLEX" : `${key}${counters[key]}`, value: s.value, pos, slot: s.slot };
  });
}

export function analyzeRoster(ctx: AnalyticsContext, teamId: string, rosterOverride?: string[]): RosterAnalysis {
  const league = leagueProfiles(ctx);
  const profile = rosterOverride ? teamProfile(ctx, teamId, rosterOverride) : league.get(teamId) ?? teamProfile(ctx, teamId);
  const all = [...league.values()];
  const groups = GROUPS[ctx.snap.sport];

  const groupStrength: Record<string, number> = {};
  const groupDepthScore: Record<string, number> = {};
  for (const g of groups) {
    groupStrength[g] = scoreVsLeague(profile.groupStarter[g] ?? 0, all.map((p) => p.groupStarter[g] ?? 0));
    groupDepthScore[g] = scoreVsLeague(profile.groupDepth[g] ?? 0, all.map((p) => p.groupDepth[g] ?? 0));
  }
  const upside = (p: TeamProfile) => p.ceilingThisWeek - p.weeklyThisWeek;
  const floorGap = (p: TeamProfile) => p.floorThisWeek / Math.max(1, p.weeklyThisWeek);
  const depthTotal = (p: TeamProfile) => Object.values(p.groupDepth).reduce((a, b) => a + b, 0);
  const scores = {
    lineup: scoreVsLeague(profile.weeklyRos, all.map((p) => p.weeklyRos)),
    depth: scoreVsLeague(depthTotal(profile), all.map(depthTotal)),
    upside: scoreVsLeague(upside(profile), all.map(upside)),
    floor: scoreVsLeague(floorGap(profile), all.map(floorGap)),
    availability: Math.round(profile.avgAvailability),
    ros: scoreVsLeague(profile.rosTotal, all.map((p) => p.rosTotal)),
    overall: 0,
  };
  scores.overall = Math.round(scores.lineup * 0.45 + scores.ros * 0.2 + scores.depth * 0.15 + scores.upside * 0.1 + scores.availability * 0.1);

  // Slot-by-slot comparison against league average at the same slot
  const mine = slotLabels(ctx, profile.lineupRos);
  const leagueSlots = all.map((p) => slotLabels(ctx, p.lineupRos));
  const weaknesses: Weakness[] = mine.map((s, i) => {
    const avg = mean(leagueSlots.map((ls) => ls[i]?.value ?? 0));
    const delta = round1(s.value - avg);
    const rel = avg > 0 ? delta / avg : 0;
    const severity: Weakness["severity"] = rel <= -0.22 ? "CRITICAL" : rel <= -0.1 ? "MODERATE" : rel >= 0.12 ? "STRONG" : "OK";
    const g = groupOf((s.pos as Position) ?? "RB");
    const note =
      severity === "CRITICAL" ? `${Math.abs(delta)} expected pts/week below league average`
      : severity === "MODERATE" ? `${Math.abs(delta)} pts/week below average — upgrade worth exploring`
      : severity === "STRONG" ? `${delta} pts/week above average — no action recommended`
      : "Around league average";
    return { slot: s.label, severity, deltaPerWeek: delta, group: g, note };
  });
  // Depth weaknesses
  for (const g of groups) {
    if (groupDepthScore[g] <= 30) {
      weaknesses.push({ slot: `${g} depth`, severity: groupDepthScore[g] <= 15 ? "CRITICAL" : "MODERATE", deltaPerWeek: 0, group: g, note: `Bench ${g} depth grades ${groupDepthScore[g]}/100 — one injury exposes a starter slot` });
    }
  }
  const rank: Record<Weakness["severity"], number> = { CRITICAL: 0, MODERATE: 1, OK: 2, STRONG: 3 };
  weaknesses.sort((a, b) => rank[a.severity] - rank[b.severity] || a.deltaPerWeek - b.deltaPerWeek);

  return { profile, scores, groupStrength, groupDepthScore, weaknesses, leagueAvgWeekly: round1(mean(all.map((p) => p.weeklyRos))) };
}
