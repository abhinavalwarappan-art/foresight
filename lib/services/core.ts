import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { availability } from "@/lib/analytics/availability";
import { type AnalyticsContext, buildContext, playerName } from "@/lib/analytics/context";
import { allValues } from "@/lib/analytics/value";
import type { Sport } from "@/lib/domain/types";
import { getSnapshot, type LeagueConnection, type SnapshotStatus } from "@/lib/providers/registry";

export const sportSchema = z.enum(["nfl", "nba"]);

const connSchema = z.object({
  provider: z.enum(["sleeper", "yahoo", "manual"]),
  leagueId: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/),
  userId: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/).optional(),
  syncedAt: z.string().datetime().optional(),
  playerIds: z.array(z.string().regex(/^(nfl|nba)-bdl-p\d+$/)).max(30).optional(),
  scoring: z.enum(["ppr", "half", "standard", "nba_points", "nba_9cat"]).optional(),
  slots: z.array(z.enum(["QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX", "WRRB_FLEX", "REC_FLEX", "K", "DST", "PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "BN", "IR"])).max(30).optional(),
});
export const LEAGUE_COOKIE = (sport: Sport) => `fs_league_${sport}`;

export async function leagueConnection(sport: Sport): Promise<LeagueConnection | null> {
  try {
    const raw = (await cookies()).get(LEAGUE_COOKIE(sport))?.value;
    if (!raw) return null;
    const parsed = connSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function loadContext(sport: Sport): Promise<{ ctx: AnalyticsContext; status: SnapshotStatus }> {
  const { snap, status } = await getSnapshot(sport, await leagueConnection(sport));
  return { ctx: buildContext(snap), status };
}

/** Serializable player card data used everywhere in the UI. */
export interface PlayerSummary {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  position: string;
  teamAbbr: string;
  teamColor: string;
  status: string;
  owner: string | null;
  ownerIsUser: boolean;
  value: number;
  valueTrend: number;
  label: string;
  tags: string[];
  modelPosRank: number;
  marketPosRank: number;
  rankDelta: number;
  proj: { median: number; floor: number; ceiling: number; weekly: number; confidence: number; gamesInWeek: number; playProbability: number };
  opp: { score: number; trend: string; trendPct: number; production: number };
  avail: { score: number; label: string; workload: string };
  sustainability: { score: number; label: string };
  breakout: { score: number; flagged: boolean; gap: number };
  rosPoints: number;
}

export function summarize(ctx: AnalyticsContext, id: string): PlayerSummary {
  const p = ctx.player(id)!;
  const v = allValues(ctx).get(id)!;
  const a = availability(ctx, id);
  const team = ctx.team(p.teamId);
  const owner = ctx.ownerOf(id);
  const pr = v.week.projection;
  return {
    id, name: playerName(p), firstName: p.firstName, lastName: p.lastName, position: p.position,
    teamAbbr: team?.abbr ?? "FA", teamColor: team?.color ?? "#64748B", status: p.status,
    owner: owner ? ctx.snap.fantasyTeams.find((t) => t.id === owner)?.name ?? null : null,
    ownerIsUser: owner === ctx.userTeamId,
    value: v.value, valueTrend: v.valueTrend, label: v.label, tags: v.tags,
    modelPosRank: v.modelPosRank, marketPosRank: v.marketPosRank, rankDelta: v.rankDelta,
    proj: { median: pr.median, floor: pr.floor, ceiling: pr.ceiling, weekly: pr.weeklyMedian, confidence: pr.confidence, gamesInWeek: pr.gamesInWeek, playProbability: pr.playProbability },
    opp: { score: v.opp.score, trend: v.opp.trend, trendPct: v.opp.trendPct, production: v.opp.productionScore },
    avail: { score: a.score, label: a.expectedToPlay, workload: a.workloadUncertainty },
    sustainability: { score: v.sustainability.score, label: v.sustainability.label },
    breakout: v.breakout,
    rosPoints: v.rosPoints,
  };
}

export const teamName = (ctx: AnalyticsContext, id: string) => ctx.snap.fantasyTeams.find((t) => t.id === id)?.name ?? "Unknown";
