import "server-only";
import { cache } from "react";
import { availability } from "@/lib/analytics/availability";
import { playerName } from "@/lib/analytics/context";
import { powerRankings } from "@/lib/analytics/league";
import { startSit, weekMatchup } from "@/lib/analytics/matchup";
import { analyzeRoster } from "@/lib/analytics/roster";
import { baselineOdds } from "@/lib/analytics/simulation";
import { findTrades } from "@/lib/analytics/trade-finder";
import { allValues } from "@/lib/analytics/value";
import { whatsChanging } from "@/lib/analytics/explain";
import { waiverRecommendations } from "@/lib/analytics/waiver";
import type { Sport } from "@/lib/domain/types";
import { researchProvider } from "@/lib/providers/registry";
import { loadContext, summarize, teamName } from "./core";

/** Request-scoped memo so layout + page share one context build. */
export const ctxFor = cache(async (sport: Sport) => loadContext(sport));

export async function shellData(sport: Sport) {
  const { ctx, status } = await ctxFor(sport);
  const vals = allValues(ctx);
  const userRoster = new Set(ctx.rosterOf(ctx.userTeamId));
  const notices = [
    ...ctx.snap.players
      .filter((p) => userRoster.has(p.id) && p.status !== "healthy")
      .map((p) => ({ id: `inj-${p.id}`, title: `${playerName(p)} — ${p.status.toUpperCase()}`, body: ctx.injury(p.id)?.note ?? "Status changed on the injury report.", href: `/${sport}/players/${p.id}`, tone: (p.status === "out" || p.status === "doubtful" ? "down" : "amber") as "down" | "amber" })),
    ...ctx.snap.players
      .filter((p) => !ctx.ownerOf(p.id) && vals.get(p.id)!.tags.includes("INJURY OPPORTUNITY"))
      .slice(0, 3)
      .map((p) => ({ id: `opp-${p.id}`, title: `Waiver opportunity: ${playerName(p)}`, body: `Projected role +${Math.round(vals.get(p.id)!.forwardRoleChange)}% after a teammate injury.`, href: `/${sport}/waivers`, tone: "violet" as const })),
  ];
  return {
    status,
    leagueName: ctx.snap.league.name,
    leagueMeta: `${ctx.snap.fantasyTeams.length} teams · ${ctx.snap.league.scoring.format.replace("_", " ").toUpperCase()} · Wk ${ctx.snap.currentWeek}`,
    userTeamName: teamName(ctx, ctx.userTeamId),
    notices,
    search: ctx.snap.players
      .map((p) => ({ id: p.id, name: playerName(p), pos: p.position, team: ctx.team(p.teamId)?.abbr ?? "", owner: ctx.ownerOf(p.id) ? teamName(ctx, ctx.ownerOf(p.id)!) : null, v: vals.get(p.id)!.value }))
      .sort((a, b) => b.v - a.v)
      .map(({ v: _v, ...rest }) => rest),
  };
}

export async function homeData(sport: Sport) {
  const { ctx, status } = await ctxFor(sport);
  const vals = allValues(ctx);
  const me = ctx.userTeamId;
  const roster = analyzeRoster(ctx, me);
  const matchup = weekMatchup(ctx, me);
  const odds = baselineOdds(ctx).get(me)!;
  const myIds = ctx.rosterOf(me);
  const s = (id: string) => summarize(ctx, id);

  const injuries = myIds.filter((id) => ctx.player(id)!.status !== "healthy").map(s);
  const risers = [...vals.values()].filter((v) => v.value >= 25 && v.valueTrend >= 3).sort((a, b) => b.valueTrend - a.valueTrend).slice(0, 5).map((v) => s(v.playerId));
  const fallers = [...vals.values()].filter((v) => v.value >= 30 && v.valueTrend <= -3).sort((a, b) => a.valueTrend - b.valueTrend).slice(0, 5).map((v) => s(v.playerId));

  // Lineup suggestions: optimal lineup vs "last week's starters" isn't known in mock — flag injured starters + close calls.
  const lineup = roster.profile.lineupThisWeek;
  const starters = lineup.starters.filter((x) => x.playerId).map((x) => x.playerId!);
  const bench = lineup.bench;
  const lineupChanges = myIds
    .filter((id) => ["out", "doubtful", "ir"].includes(ctx.player(id)!.status) && (vals.get(id)!.rosPoints > 0))
    .map((id) => {
      const pos = ctx.player(id)!.position;
      const sub = bench.find((b) => ctx.player(b)!.position === pos) ?? starters.find((x) => ctx.player(x)!.position === pos && x !== id);
      return { out: s(id), in: sub ? s(sub) : null };
    });
  const closeCall = (() => {
    const flexy = starters.map((id) => vals.get(id)!).sort((a, b) => a.week.projection.weeklyMedian - b.week.projection.weeklyMedian)[0];
    const alt = bench.map((id) => vals.get(id)!).filter((v) => ctx.player(v.playerId)!.position === ctx.player(flexy?.playerId ?? "")?.position).sort((a, b) => b.week.projection.weeklyMedian - a.week.projection.weeklyMedian)[0];
    return flexy && alt ? startSit(ctx, flexy.playerId, alt.playerId, me) : null;
  })();

  const waivers = waiverRecommendations(ctx, me, 3).map((w) => ({ ...w, player: s(w.playerId), dropPlayer: w.drop ? s(w.drop) : null }));
  const trades = findTrades(ctx, me, { limit: 1 }).slice(0, 2).map((t) => ({ style: t.style, partner: teamName(ctx, t.partnerId), give: t.give.map(s), get: t.get.map(s), verdict: t.result.verdict, mine: t.result.a.benefitPct, theirs: t.result.b.benefitPct, acceptance: t.result.acceptance.level }));
  const activity = ctx.snap.transactions.slice(0, 5).map((t) => ({
    id: t.id, team: teamName(ctx, t.teamIds[0]), type: t.type,
    adds: t.adds.map((a) => (ctx.player(a.playerId) ? playerName(ctx.player(a.playerId)) : a.playerId)),
    drops: t.drops.map((d) => (ctx.player(d.playerId) ? playerName(ctx.player(d.playerId)) : d.playerId)),
    at: t.createdAt,
  }));

  const weakest = roster.weaknesses[0];
  const topWaiver = waivers[0];
  const insight = {
    title: weakest?.severity === "CRITICAL" ? `Your ${weakest.slot} is the swing factor` : "Your lineup is balanced — play the margins",
    body: weakest?.severity === "CRITICAL"
      ? `${weakest.slot} projects ${Math.abs(weakest.deltaPerWeek)} pts/week below the league average slot. ${topWaiver ? `${topWaiver.player.name} (roster fit ${topWaiver.rosterFit}) is the best free option; ` : ""}a trade from your ${roster.weaknesses.filter((w) => w.severity === "STRONG").map((w) => w.slot).join(", ") || "depth"} surplus closes more of the gap.`
      : "No slot grades as critical. Upside is best gained through waiver churn on rising-opportunity players.",
  };

  return {
    status, sport, week: ctx.snap.currentWeek, isMock: ctx.snap.isMock,
    teamName: teamName(ctx, me),
    record: (() => { const t = ctx.snap.fantasyTeams.find((x) => x.id === me)!; return `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`; })(),
    matchup: matchup && { ...matchup, opponentName: teamName(ctx, matchup.opponentId) },
    odds, scores: roster.scores, weaknesses: roster.weaknesses.slice(0, 4),
    injuries, risers, fallers, lineupChanges, closeCall: closeCall && { ...closeCall, aP: s(closeCall.a), bP: s(closeCall.b) },
    waivers, trades, activity, insight,
  };
}

export async function playersData(sport: Sport) {
  const { ctx } = await ctxFor(sport);
  return ctx.snap.players.map((p) => summarize(ctx, p.id)).filter((p) => p.rosPoints > 0 || p.proj.median > 0);
}

export async function playerDetail(sport: Sport, id: string) {
  const { ctx } = await ctxFor(sport);
  const p = ctx.player(id);
  if (!p) return null;
  const v = allValues(ctx).get(id)!;
  const research = await researchProvider().research(p, ctx.team(p.teamId)).catch(() => ({ data: [], provenance: null }));
  const logs = ctx.logs(id).map((g, i) => ({
    label: sport === "nfl" ? `W${g.week}` : `G${i + 1}`, played: g.played, fp: g.fp,
    opp: ctx.team(g.opponentTeamId)?.abbr ?? "", stats: g.stats, usage: g.usage,
  }));
  const team = ctx.team(p.teamId);
  const teammatesOut = ctx.teammates(id).filter((t) => t.status === "out" || t.status === "ir").map((t) => playerName(t));
  const avail = availability(ctx, id);
  return {
    summary: summarize(ctx, id), value: v, availability: avail, logs, research: research.data,
    changing: whatsChanging(playerName(p), v, avail, teammatesOut),
    teamName: team ? `${team.city} ${team.name}` : "", teammatesOut, injury: ctx.injury(id) ?? null,
    history: ctx.snap.injuryHistory.filter((h) => h.playerId === id),
    scoringFormat: ctx.snap.league.scoring.format, isMock: ctx.snap.isMock,
  };
}

export async function rosterData(sport: Sport) {
  const { ctx } = await ctxFor(sport);
  const me = ctx.userTeamId;
  const a = analyzeRoster(ctx, me);
  const s = (id: string) => summarize(ctx, id);
  return {
    analysis: { scores: a.scores, groupStrength: a.groupStrength, groupDepthScore: a.groupDepthScore, weaknesses: a.weaknesses, leagueAvgWeekly: a.leagueAvgWeekly, weeklyRos: a.profile.weeklyRos, weeklyThisWeek: a.profile.weeklyThisWeek },
    starters: a.profile.lineupThisWeek.starters.map((x) => ({ slot: x.slot, value: x.value, player: x.playerId ? s(x.playerId) : null })),
    bench: a.profile.lineupThisWeek.bench.map(s),
    teamName: teamName(ctx, me),
  };
}

export async function waiversData(sport: Sport) {
  const { ctx } = await ctxFor(sport);
  const recs = waiverRecommendations(ctx, ctx.userTeamId, 12);
  const rostered = new Set(ctx.snap.rosters.flatMap((r) => r.playerIds));
  const generic = [...allValues(ctx).values()].filter((v) => !rostered.has(v.playerId) && v.week.projection.median > 0).sort((a, b) => b.rosPoints - a.rosPoints).slice(0, 15).map((v) => summarize(ctx, v.playerId));
  return {
    recs: recs.map((r) => ({ ...r, player: summarize(ctx, r.playerId), dropPlayer: r.drop ? summarize(ctx, r.drop) : null })),
    generic,
  };
}

export async function leagueData(sport: Sport) {
  const { ctx } = await ctxFor(sport);
  const rows = powerRankings(ctx).map((r) => ({ ...r, name: teamName(ctx, r.teamId), manager: ctx.snap.fantasyTeams.find((t) => t.id === r.teamId)!.manager, isUser: r.teamId === ctx.userTeamId }));
  const standings = [...ctx.snap.fantasyTeams].sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
  return { rows, standings, playoffTeams: ctx.snap.league.playoffTeams, week: ctx.snap.currentWeek, totalWeeks: ctx.snap.league.totalWeeks };
}

/** Trade Lab builder data: every roster with compact player summaries. */
export async function tradeLabData(sport: Sport) {
  const { ctx } = await ctxFor(sport);
  return {
    userTeamId: ctx.userTeamId,
    teams: ctx.snap.fantasyTeams.map((t) => ({
      id: t.id, name: t.name, manager: t.manager, isUser: t.isUser,
      players: ctx.rosterOf(t.id).map((id) => summarize(ctx, id)).sort((a, b) => b.value - a.value),
    })),
  };
}
