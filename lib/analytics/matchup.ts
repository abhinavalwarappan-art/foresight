import { type AnalyticsContext, playerName, round1 } from "./context";
import { leagueProfiles } from "./roster";
import { normalCdf } from "./simulation";
import { allValues } from "./value";

export interface WeekMatchup {
  week: number;
  teamId: string;
  opponentId: string;
  projected: number;
  opponentProjected: number;
  winProbability: number; // 0–1, model-based
  sd: number;
}

export function weekMatchup(ctx: AnalyticsContext, teamId = ctx.userTeamId): WeekMatchup | null {
  const week = ctx.snap.currentWeek;
  const m = ctx.snap.matchups.find((x) => x.week === week && (x.homeTeamId === teamId || x.awayTeamId === teamId));
  if (!m) return null;
  const opp = m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId;
  const prof = leagueProfiles(ctx);
  const me = prof.get(teamId)!;
  const them = prof.get(opp)!;
  const sd = Math.sqrt(me.varianceThisWeek + them.varianceThisWeek) || 1;
  return {
    week, teamId, opponentId: opp, projected: me.weeklyThisWeek, opponentProjected: them.weeklyThisWeek,
    winProbability: Math.round(normalCdf((me.weeklyThisWeek - them.weeklyThisWeek) / sd) * 1000) / 1000, sd: round1(sd),
  };
}

export interface StartSitResult {
  a: string;
  b: string;
  pick: string;
  mode: "upside" | "floor" | "median";
  probAOutscoresB: number;
  explanation: string[];
}

/** Distribution-aware start/sit that adapts to whether you're favored. */
export function startSit(ctx: AnalyticsContext, a: string, b: string, teamId = ctx.userTeamId): StartSitResult {
  const vals = allValues(ctx);
  const pa = vals.get(a)!.week.projection;
  const pb = vals.get(b)!.week.projection;
  const mu = weekMatchup(ctx, teamId);
  const wp = mu?.winProbability ?? 0.5;
  const mode: StartSitResult["mode"] = wp < 0.4 ? "upside" : wp > 0.62 ? "floor" : "median";
  const score = (p: typeof pa) =>
    mode === "upside" ? p.weeklyMedian + 0.5 * (p.ceiling - p.median) * p.gamesInWeek
    : mode === "floor" ? p.weeklyMedian - 0.5 * (p.median - p.floor) * p.gamesInWeek
    : p.weeklyMedian;
  const pick = score(pa) >= score(pb) ? a : b;
  const sd = Math.sqrt(pa.variance * Math.max(1, pa.gamesInWeek) + pb.variance * Math.max(1, pb.gamesInWeek)) || 1;
  const prob = Math.round(normalCdf((pa.weeklyMedian - pb.weeklyMedian) / sd) * 100) / 100;
  const n = (id: string) => playerName(ctx.player(id));
  const explanation = [
    mu ? `You're projected ${mu.projected} vs ${mu.opponentProjected} (${Math.round(wp * 100)}% win probability, model-based).` : "No matchup found this week.",
    mode === "upside" ? "As an underdog, variance is your friend — weighting ceiling outcomes."
      : mode === "floor" ? "As the favorite, protect the lead — weighting floor outcomes."
      : "Close matchup — deciding on median projection.",
    `${n(a)}: ${pa.floor}–${pa.median}–${pa.ceiling}${pa.gamesInWeek > 1 ? ` × ${pa.gamesInWeek} games` : ""}. ${n(b)}: ${pb.floor}–${pb.median}–${pb.ceiling}${pb.gamesInWeek > 1 ? ` × ${pb.gamesInWeek} games` : ""}.`,
    `${n(a)} outscores ${n(b)} in about ${Math.round(prob * 100)}% of simulated outcomes.`,
  ];
  return { a, b, pick, mode, probAOutscoresB: prob, explanation };
}
