import "server-only";
import { availability } from "@/lib/analytics/availability";
import { type AnalyticsContext, mean, playerName, round1 } from "@/lib/analytics/context";
import { teamProfile } from "@/lib/analytics/roster";
import { allValues } from "@/lib/analytics/value";
import { openMeteo } from "@/lib/providers/weather/openMeteo";

const windowSummary = (values: number[], n: number) => {
  const xs = values.slice(-n);
  return { sampleSize: xs.length, average: xs.length ? round1(mean(xs)) : null };
};

export async function getGameIntelligence(ctx: AnalyticsContext, gameId: string) {
  const game = ctx.snap.games.find((g) => g.id === gameId);
  if (!game) return null;
  const home = ctx.team(game.homeTeamId);
  const away = ctx.team(game.awayTeamId);
  const market = ctx.market(game.id) ?? null;
  const weather = ctx.snap.sport === "nfl" && home ? await openMeteo.getGameWeather(game, home).catch(() => null) : null;
  const previous = (teamId: string) => ctx.snap.games.filter((g) => g.status === "final" && (g.homeTeamId === teamId || g.awayTeamId === teamId) && Date.parse(g.date) < Date.parse(game.date)).sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
  const restDays = (teamId: string) => { const p = previous(teamId); return p ? Math.max(0, Math.floor((Date.parse(game.date) - Date.parse(p.date)) / 86_400_000)) : null; };
  return {
    game, venue: game.venue ?? null, home: home?.abbr ?? null, away: away?.abbr ?? null,
    rest: { homeDays: restDays(game.homeTeamId), awayDays: restDays(game.awayTeamId), homeBackToBack: ctx.snap.sport === "nba" && restDays(game.homeTeamId) === 1, awayBackToBack: ctx.snap.sport === "nba" && restDays(game.awayTeamId) === 1 },
    market, weather,
    availability: { home: ctx.snap.injuries.filter((i) => ctx.player(i.playerId)?.teamId === game.homeTeamId), away: ctx.snap.injuries.filter((i) => ctx.player(i.playerId)?.teamId === game.awayTeamId) },
    unavailable: [!market && "market", ctx.snap.sport === "nfl" && !weather && "weather", !ctx.snap.playerGames.length && "historical stats"].filter(Boolean),
  };
}

export async function getPlayerOutlook(ctx: AnalyticsContext, playerId: string) {
  const p = ctx.player(playerId);
  if (!p) return null;
  const value = allValues(ctx).get(playerId)!;
  const logs = ctx.logs(playerId).filter((g) => g.played);
  const fp = logs.map((g) => g.fp);
  const games = ctx.gamesFor(p.teamId, ctx.snap.currentWeek);
  const gameContexts = await Promise.all(games.map((g) => getGameIntelligence(ctx, g.id)));
  return {
    player: { id: p.id, name: playerName(p), position: p.position, team: ctx.team(p.teamId)?.abbr ?? null, status: p.status },
    ownership: ctx.ownerOf(playerId), projection: value.week.projection, opportunity: value.opp, availability: availability(ctx, playerId),
    trends: { classification: value.opp.trend, rateOfChangePct: value.opp.trendPct, absolute: value.opp.history.slice(-10) },
    historical: { last3: windowSummary(fp, 3), last5: windowSummary(fp, 5), last10: windowSummary(fp, 10), season: windowSummary(fp, fp.length) },
    games: gameContexts.filter(Boolean),
    unavailable: [!logs.length && "historical stats", !games.length && "upcoming schedule"].filter(Boolean),
  };
}

export async function getWeeklyTeamOutlook(ctx: AnalyticsContext, teamId = ctx.userTeamId) {
  const profile = teamProfile(ctx, teamId);
  const values = allValues(ctx);
  const ids = ctx.rosterOf(teamId);
  const starters = profile.lineupThisWeek.starters.map((s) => s.playerId).filter((id): id is string => Boolean(id));
  const projections = starters.map((id) => values.get(id)!.week.projection);
  const projectionAvailable = projections.length > 0 && projections.every((p) => p.available !== false);
  const outlooks = await Promise.all(ids.map((id) => getPlayerOutlook(ctx, id)));
  const sum = (field: "floor" | "weeklyMedian" | "ceiling") => round1(projections.reduce((n, p) => n + (field === "weeklyMedian" ? p.weeklyMedian : p[field] * Math.max(1, p.gamesInWeek)), 0));
  return {
    period: { season: ctx.snap.season, week: ctx.snap.currentWeek }, league: { id: ctx.snap.league.id, name: ctx.snap.league.name, scoring: ctx.snap.league.scoring, slots: ctx.snap.league.slots }, teamId,
    players: outlooks.filter(Boolean), recommendedLineup: profile.lineupThisWeek.starters, bench: profile.lineupThisWeek.bench,
    team: projectionAvailable ? { floor: sum("floor"), median: sum("weeklyMedian"), ceiling: sum("ceiling"), confidence: round1(mean(projections.map((p) => p.confidence))) } : { floor: null, median: null, ceiling: null, confidence: 0 },
    flags: { injury: ids.filter((id) => ctx.player(id)?.status !== "healthy"), upside: ids.filter((id) => (values.get(id)?.breakout.score ?? 0) >= 65), falling: ids.filter((id) => values.get(id)?.opp.trend.includes("Falling")) },
    dataFreshness: ctx.snap.sources,
    unavailable: [!projectionAvailable && "team projection", !ctx.snap.playerGames.length && "historical stats", !ctx.snap.injuries.length && "structured injuries", !ctx.snap.markets.length && "market"].filter(Boolean),
  };
}
