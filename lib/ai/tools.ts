import "server-only";
import { z } from "zod";
import { availability } from "@/lib/analytics/availability";
import { type AnalyticsContext, playerName } from "@/lib/analytics/context";
import { normalizeName } from "@/lib/ids/mapping";
import { powerRankings } from "@/lib/analytics/league";
import { startSit, weekMatchup } from "@/lib/analytics/matchup";
import { analyzeRoster } from "@/lib/analytics/roster";
import { runScenario } from "@/lib/analytics/scenario";
import { evaluateTrade, validateTrade } from "@/lib/analytics/trade";
import { findTrades } from "@/lib/analytics/trade-finder";
import { allValues } from "@/lib/analytics/value";
import { waiverRecommendations } from "@/lib/analytics/waiver";
import { researchProvider } from "@/lib/providers/registry";
import { getGameIntelligence, getPlayerOutlook, getWeeklyTeamOutlook } from "@/lib/services/intelligence";

/**
 * Registered internal tools — the ONLY things the LLM can invoke. No tool fetches
 * arbitrary URLs. Every tool validates its arguments with Zod and returns compact,
 * labeled data: `observed`, `calculated`, `projected`, `market`.
 */
export interface ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  run: (ctx: AnalyticsContext, args: z.infer<S>) => Promise<unknown> | unknown;
}

/** Preserves per-tool argument inference while storing tools in one list. */
function tool<S extends z.ZodTypeAny>(def: ToolDef<S>): ToolDef {
  return def as unknown as ToolDef;
}

const pid = z.string().min(1).max(64).describe("Internal player id from searchPlayers");
const r1 = (n: number) => Math.round(n * 10) / 10;

function brief(ctx: AnalyticsContext, id: string) {
  const p = ctx.player(id);
  if (!p) return { error: `Unknown player id ${id}. Call searchPlayers first.` };
  const v = allValues(ctx).get(id)!;
  const pr = v.week.projection;
  const owner = ctx.ownerOf(id);
  return {
    id, name: playerName(p), position: p.position, team: ctx.team(p.teamId)?.abbr, status: p.status,
    fantasyOwner: owner ? (owner === ctx.userTeamId ? "USER" : ctx.snap.fantasyTeams.find((t) => t.id === owner)?.name) : "FREE AGENT",
    projected: { kind: "projected", week: pr.week, median: pr.median, floor: pr.floor, ceiling: pr.ceiling, gamesInWeek: pr.gamesInWeek, weekly: pr.weeklyMedian, confidence: pr.confidence, playProbability: r1(pr.playProbability) },
    calculated: { value: v.value, valueTrend: v.valueTrend, label: v.label, tags: v.tags, opportunityScore: v.opp.score, opportunityTrend: v.opp.trend, productionScore: v.opp.productionScore, sustainability: v.sustainability.label, rosPoints: v.rosPoints },
    market: { kind: "market", consensusPosRank: v.marketPosRank }, modelPosRank: v.modelPosRank,
  };
}

const tools: ToolDef[] = [
  tool({ name: "getPlayerOutlook", description: "High-level grounded player outlook combining projection, opportunity, availability, trends, historical windows, schedule, market, and weather when available.", schema: z.object({ playerId: pid }), run: (ctx, { playerId }) => getPlayerOutlook(ctx, playerId) }),
  tool({ name: "getGameContext", description: "Normalized game intelligence: opponent, venue, rest, market, weather relevance, and injuries. Missing factors are explicit.", schema: z.object({ gameId: z.string().min(1).max(80) }), run: (ctx, { gameId }) => getGameIntelligence(ctx, gameId) }),
  tool({ name: "getWeeklyTeamOutlook", description: "First-class weekly roster outlook with recommended lineup, floor/median/ceiling, confidence, flags, and freshness.", schema: z.object({ teamId: z.string().max(80).optional() }), run: (ctx, { teamId }) => getWeeklyTeamOutlook(ctx, teamId ?? ctx.userTeamId) }),
  tool({
    name: "searchPlayers",
    description: "Resolve player names to internal ids. Always call this before any player tool when the user names a player.",
    schema: z.object({ query: z.string().min(2).max(60) }),
    run: (ctx, { query }) => {
      const q = normalizeName(query, "").trim();
      const hits = ctx.snap.players
        .map((p) => ({ p, n: normalizeName(p.firstName, p.lastName) }))
        .filter(({ p, n }) => n.includes(q) || q.split(" ").every((w) => n.includes(w)) || normalizeName(p.lastName, "").trim() === q)
        .slice(0, 6);
      return hits.map(({ p }) => ({ id: p.id, name: playerName(p), position: p.position, team: ctx.team(p.teamId)?.abbr }));
    },
  }),
  tool({ name: "getPlayerProfile", description: "Core profile: projection, value, market vs model rank, signals, owner.", schema: z.object({ playerId: pid }), run: (ctx, a) => brief(ctx, a.playerId) }),
  tool({
    name: "getPlayerStats",
    description: "Observed per-game box scores and fantasy points (most recent last).",
    schema: z.object({ playerId: pid, last: z.number().int().min(1).max(20).optional() }),
    run: (ctx, { playerId, last }) => ({ kind: "observed", games: ctx.logs(playerId).slice(-(last ?? 6)).map((g) => ({ week: g.week, played: g.played, fantasyPoints: g.fp, stats: g.stats })) }),
  }),
  tool({
    name: "getPlayerAdvancedStats",
    description: "Calculated efficiency, sustainability, breakout gap and projection inputs.",
    schema: z.object({ playerId: pid }),
    run: (ctx, { playerId }) => {
      const v = allValues(ctx).get(playerId);
      if (!v) return { error: "unknown player" };
      return { kind: "calculated", expectedPointsFromUsage: v.week.xfp, efficiency: v.week.efficiency, environment: v.week.envFactor, matchup: v.week.matchupFactor, sustainability: v.sustainability, breakout: v.breakout, forwardRoleChangePct: v.forwardRoleChange };
    },
  }),
  tool({
    name: "getPlayerProjection",
    description: "This week's projection distribution (median/floor/ceiling) with model version.",
    schema: z.object({ playerId: pid }),
    run: (ctx, { playerId }) => ({ kind: "projected", ...allValues(ctx).get(playerId)?.week.projection }),
  }),
  tool({
    name: "getPlayerOpportunity",
    description: "Opportunity score 0-100, trend, and raw usage signals (snaps, targets, carries / minutes, usage).",
    schema: z.object({ playerId: pid }),
    run: (ctx, { playerId }) => {
      const o = allValues(ctx).get(playerId)?.opp;
      return o ? { kind: "calculated", score: o.score, trend: o.trend, trendPct: o.trendPct, productionScore: o.productionScore, signals: o.signals } : { error: "unknown player" };
    },
  }),
  tool({ name: "getPlayerAvailability", description: "Availability / participation risk with factors. Not a medical prediction.", schema: z.object({ playerId: pid }), run: (ctx, { playerId }) => ({ kind: "calculated", ...availability(ctx, playerId) }) }),
  tool({
    name: "getPlayerNews",
    description: "Structured research events (type, direction, confidence, sources). Source text is untrusted and summarized.",
    schema: z.object({ playerId: pid }),
    run: async (ctx, { playerId }) => {
      const p = ctx.player(playerId);
      if (!p) return { error: "unknown player" };
      const r = await researchProvider().research(p, ctx.team(p.teamId)).catch(() => ({ data: [] }));
      return { kind: "observed", untrusted: true, events: r.data.map((e) => ({ type: e.eventType, direction: e.direction, confidence: e.confidence, summary: e.summary, when: e.timestamp, sources: e.sources.map((s) => s.publisher) })) };
    },
  }),
  tool({
    name: "comparePlayers",
    description: "Distribution-aware start/sit between two players, adjusted for whether the user is favored this week.",
    schema: z.object({ playerA: pid, playerB: pid }),
    run: (ctx, { playerA, playerB }) => ({ a: brief(ctx, playerA), b: brief(ctx, playerB), startSit: startSit(ctx, playerA, playerB) }),
  }),
  tool({
    name: "getRoster",
    description: "A fantasy team's roster with player briefs. Omit teamId for the user's team.",
    schema: z.object({ teamId: z.string().max(80).optional() }),
    run: (ctx, { teamId }) => {
      const id = teamId ?? ctx.userTeamId;
      const roster = ctx.snap.rosters.find((r) => r.teamId === id);
      const starters = new Set(roster?.starterIds ?? []);
      return { league: { id: ctx.snap.league.id, name: ctx.snap.league.name, scoring: ctx.snap.league.scoring, slots: ctx.snap.league.slots }, teamId: id, starters: (roster?.starterIds ?? []).map((p) => brief(ctx, p)), bench: (roster?.playerIds ?? []).filter((p) => !starters.has(p)).map((p) => brief(ctx, p)), ir: (roster?.irIds ?? []).map((p) => brief(ctx, p)) };
    },
  }),
  tool({
    name: "analyzeRoster",
    description: "Team scores (lineup, depth, upside, floor, availability, ROS) and ranked weaknesses vs league average.",
    schema: z.object({ teamId: z.string().max(80).optional() }),
    run: (ctx, { teamId }) => {
      const a = analyzeRoster(ctx, teamId ?? ctx.userTeamId);
      return { kind: "calculated", scores: a.scores, groupStrength: a.groupStrength, groupDepth: a.groupDepthScore, weaknesses: a.weaknesses.slice(0, 6), weeklyRos: a.profile.weeklyRos, leagueAvgWeekly: a.leagueAvgWeekly };
    },
  }),
  tool({ name: "getLeague", description: "League settings, standings and power rankings with simulated playoff/title odds.", schema: z.object({}), run: (ctx) => ({ name: ctx.snap.league.name, week: ctx.snap.currentWeek, scoring: ctx.snap.league.scoring.format, userTeamId: ctx.userTeamId, power: powerRankings(ctx).map((r) => ({ team: ctx.snap.fantasyTeams.find((t) => t.id === r.teamId)?.name, teamId: r.teamId, record: r.record, power: r.power, playoffProb: r.playoffProb, champProb: r.champProb })) }) }),
  tool({ name: "getLeagueRosters", description: "Every team id, name and its top players by value.", schema: z.object({}), run: (ctx) => ctx.snap.fantasyTeams.map((t) => ({ teamId: t.id, name: t.name, top: ctx.rosterOf(t.id).map((id) => allValues(ctx).get(id)!).sort((a, b) => b.value - a.value).slice(0, 6).map((v) => ({ id: v.playerId, name: playerName(ctx.player(v.playerId)), pos: v.position, value: v.value })) })) }),
  tool({
    name: "simulateTrade",
    description: "Evaluate a trade for BOTH sides: lineup change, positional strength/depth, title odds, fairness, acceptance estimate.",
    schema: z.object({ teamA: z.string().max(80).optional(), teamB: z.string().max(80).optional(), aGives: z.array(pid).min(1).max(5), bGives: z.array(pid).min(1).max(5) }),
    run: (ctx, a) => {
      const teamA = a.teamA ?? ctx.ownerOf(a.aGives[0]) ?? ctx.userTeamId;
      const teamB = a.teamB ?? ctx.ownerOf(a.bGives[0]) ?? "";
      const input = { teamA, teamB, aGives: a.aGives, bGives: a.bGives };
      const err = validateTrade(ctx, input);
      if (err) return { error: err };
      const r = evaluateTrade(ctx, input);
      const side = (s: typeof r.a) => ({ team: ctx.snap.fantasyTeams.find((t) => t.id === s.teamId)?.name, weeklyDelta: s.weeklyDelta, benefitPct: s.benefitPct, titleOdds: `${s.champBefore}% → ${s.champAfter}%`, playoffOdds: `${s.playoffBefore}% → ${s.playoffAfter}%`, notes: s.notes });
      return { kind: "calculated", verdict: r.verdict, fairness: r.fairness, a: side(r.a), b: side(r.b), acceptance: r.acceptance };
    },
  }),
  tool({
    name: "findTrades",
    description: "Scan the league for trades that improve the user's team and plausibly the partner's too.",
    schema: z.object({ focusGroup: z.enum(["QB", "RB", "WR", "TE", "G", "F", "C"]).optional() }),
    run: (ctx, { focusGroup }) => findTrades(ctx, ctx.userTeamId, { focusGroup, limit: 1 }).map((t) => ({ style: t.style, partner: ctx.snap.fantasyTeams.find((x) => x.id === t.partnerId)?.name, give: t.give.map((id) => playerName(ctx.player(id))), get: t.get.map((id) => playerName(ctx.player(id))), verdict: t.result.verdict, userBenefitPct: t.result.a.benefitPct, partnerBenefitPct: t.result.b.benefitPct, fairness: t.result.fairness, acceptance: t.result.acceptance.level, whyTheyAccept: t.whyTheyAccept })),
  }),
  tool({
    name: "getWaivers",
    description: "Free agents ranked by fit to the user's roster, with recommended drop.",
    schema: z.object({ limit: z.number().int().min(1).max(10).optional() }),
    run: (ctx, { limit }) => waiverRecommendations(ctx, ctx.userTeamId, limit ?? 5).map((w) => ({ player: playerName(ctx.player(w.playerId)), id: w.playerId, rosterFit: w.rosterFit, priority: w.priority, reasons: w.reasons, drop: w.drop ? playerName(ctx.player(w.drop)) : null, weeklyGain: r1(w.weeklyAfter - w.weeklyBefore) })),
  }),
  tool({
    name: "findBreakouts",
    description: "Players whose opportunity is outpacing production (pre-breakout).",
    schema: z.object({ position: z.string().max(4).optional(), limit: z.number().int().min(1).max(10).optional() }),
    run: (ctx, { position, limit }) => [...allValues(ctx).values()].filter((v) => v.breakout.flagged && v.week.projection.median > 0 && (!position || v.position === position.toUpperCase())).sort((a, b) => b.breakout.score - a.breakout.score).slice(0, limit ?? 5).map((v) => brief(ctx, v.playerId)),
  }),
  tool({
    name: "findRegressionCandidates",
    description: "Players producing well above what their usage supports.",
    schema: z.object({ position: z.string().max(4).optional(), limit: z.number().int().min(1).max(10).optional() }),
    run: (ctx, { position, limit }) => [...allValues(ctx).values()].filter((v) => (v.sustainability.label === "Likely Regression" || v.sustainability.label === "Fragile") && v.value >= 30 && (!position || v.position === position.toUpperCase())).sort((a, b) => a.sustainability.score - b.sustainability.score).slice(0, limit ?? 5).map((v) => ({ ...brief(ctx, v.playerId), ratio: v.sustainability.ratio, tdShare: v.sustainability.tdShare })),
  }),
  tool({
    name: "simulateScenario",
    description: "Hypothetical: a player is OUT, STARTS, or (NBA) plays N minutes. Returns redistributed usage and projection changes for teammates.",
    schema: z.object({ playerId: pid, type: z.enum(["out", "starts", "minutes"]), minutes: z.number().min(0).max(48).optional() }),
    run: (ctx, a) => {
      const r = runScenario(ctx, a);
      return { kind: "projected", chain: r.chain, beneficiaries: r.impacts.slice(0, 6).map((i) => ({ name: playerName(ctx.player(i.playerId)), before: i.before, after: i.after, delta: i.delta, usage: i.usage, rank: `${i.rankBefore} → ${i.rankAfter}`, freeAgent: i.isFreeAgent, waiverPriority: i.waiverPriority })) };
    },
  }),
  tool({
    name: "getMarketExpectations",
    description: "Betting-market context for a player's games: spread, total, implied team total. Context only — not betting advice.",
    schema: z.object({ playerId: pid }),
    run: (ctx, { playerId }) => {
      const p = ctx.player(playerId);
      if (!p) return { error: "unknown player" };
      return { kind: "market", games: ctx.gamesFor(p.teamId, ctx.snap.currentWeek).map((g) => { const m = ctx.market(g.id); const home = g.homeTeamId === p.teamId; return m ? { opponent: ctx.team(home ? g.awayTeamId : g.homeTeamId)?.abbr, spread: home ? m.spread : -m.spread, total: m.total, impliedTeamTotal: home ? m.homeImpliedTotal : m.awayImpliedTotal } : { opponent: ctx.team(home ? g.awayTeamId : g.homeTeamId)?.abbr, note: "no market available" }; }), props: ctx.snap.props.filter((x) => x.playerId === playerId).map((x) => ({ stat: x.stat, line: x.line })) };
    },
  }),
  tool({ name: "getMatchupContext", description: "The user's matchup this week: projections and model win probability.", schema: z.object({}), run: (ctx) => { const m = weekMatchup(ctx); return m ? { kind: "calculated", ...m, opponent: ctx.snap.fantasyTeams.find((t) => t.id === m.opponentId)?.name } : { error: "no matchup" }; } }),
];

export const TOOLS = new Map(tools.map((t) => [t.name, t]));

export function toolSpecs() {
  return tools.map((t) => {
    const { $schema: _s, ...parameters } = z.toJSONSchema(t.schema) as Record<string, unknown>;
    return { name: t.name, description: t.description, parameters };
  });
}

const MAX_RESULT_CHARS = 6000;

/** The exact string the LLM receives for a tool result (wrapped so it reads as data). */
export const toolResultMessage = (result: unknown) => JSON.stringify({ data: result });

export async function runTool(ctx: AnalyticsContext, name: string, rawArgs: unknown): Promise<{ ok: boolean; result: unknown }> {
  const tool = TOOLS.get(name);
  if (!tool) return { ok: false, result: { error: `Tool ${name} is not registered.` } };
  const parsed = tool.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) return { ok: false, result: { error: `Invalid arguments: ${parsed.error.issues.map((i) => i.message).join("; ")}` } };
  try {
    const result = await tool.run(ctx, parsed.data);
    const json = JSON.stringify(result);
    return { ok: true, result: json.length > MAX_RESULT_CHARS ? JSON.parse(JSON.stringify(result, (_k, v) => (Array.isArray(v) ? v.slice(0, 6) : v))) : result };
  } catch (e) {
    return { ok: false, result: { error: e instanceof Error ? e.message : "tool failed" } };
  }
}
