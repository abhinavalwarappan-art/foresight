import "server-only";
import type { AnalyticsContext } from "@/lib/analytics/context";
import { playerName } from "@/lib/analytics/context";
import { allTraces, type Trace } from "@/lib/analytics/trace";
import { allValues } from "@/lib/analytics/value";
import type { CacheClass } from "@/lib/cache/policy";
import type { Provenance } from "@/lib/domain/types";
import { normalizeName, type ExternalPlayerRef } from "@/lib/ids/mapping";
import { lastMappingReport, type SnapshotStatus } from "@/lib/providers/registry";
import { rawFor, redact, type RawRecord } from "@/lib/providers/raw-store";
import { mapPlayer } from "@/lib/providers/sports/balldontlie";
import { freshness, type Freshness } from "./freshness";
import { mockMapping, normalizationChecks, syntheticBdlId, syntheticRawFor, type NormalizationCheck } from "./mock-provider-data";

export const PROVIDERS = ["balldontlie", "sleeper", "yahoo", "sportsdataio", "sportradar"] as const;
export type InspectorProvider = (typeof PROVIDERS)[number];

export interface IdentityRow {
  provider: InspectorProvider;
  externalId: string | null;
  state: "LINKED" | "SYNTHETIC" | "NOT LINKED" | "NOT CONFIGURED";
  note: string;
}

export interface MappingIssue {
  kind: "AMBIGUOUS" | "UNMATCHED";
  provider: string;
  ref: ExternalPlayerRef;
  candidates: { id: string; name: string; team: string }[];
}

export interface ProvenanceRow {
  metric: string;
  source: string;
  sourceTimestamp: string | null;
  retrievedAt: string | null;
  kind: string;
  cache: string;
  freshness: Freshness;
}

const computed = (ctx: AnalyticsContext, engine: string): Provenance => ({
  source: `engine:${engine}`, sourceTimestamp: ctx.snap.generatedAt, retrievedAt: ctx.snap.generatedAt,
  confidence: null, isProjection: false, kind: "calculated", cache: "computed",
});

function provRow(metric: string, prov: Provenance | null | undefined, cls?: CacheClass): ProvenanceRow {
  if (!prov) return { metric, source: "NOT AVAILABLE", sourceTimestamp: null, retrievedAt: null, kind: "—", cache: "—", freshness: freshness(null) };
  return {
    metric, source: prov.source, sourceTimestamp: prov.sourceTimestamp, retrievedAt: prov.retrievedAt,
    kind: prov.kind, cache: prov.cache ?? (prov.stale ? "stale" : "unknown"), freshness: freshness(prov, cls),
  };
}

/** Issues (ambiguous/unmatched external refs) relevant to a player, from the last mapping run. */
export function mappingIssues(ctx: AnalyticsContext): { provider: string; source: "synthetic" | "live" | "none"; matched: number; issues: MappingIssue[] } {
  const candidatesFor = (ref: ExternalPlayerRef) => {
    const n = normalizeName(ref.firstName, ref.lastName);
    return ctx.snap.players
      .filter((p) => normalizeName(p.firstName, p.lastName) === n)
      .map((p) => ({ id: p.id, name: playerName(p), team: ctx.team(p.teamId)?.abbr ?? "" }));
  };
  if (ctx.snap.isMock) {
    const { result } = mockMapping(ctx.snap);
    return {
      provider: "sleeper (synthetic refs)", source: "synthetic", matched: result.map.size,
      issues: [
        ...result.ambiguous.map((ref) => ({ kind: "AMBIGUOUS" as const, provider: "sleeper", ref, candidates: candidatesFor(ref) })),
        ...result.unmatched.map((ref) => ({ kind: "UNMATCHED" as const, provider: "sleeper", ref, candidates: candidatesFor(ref) })),
      ],
    };
  }
  const rep = lastMappingReport(ctx.snap.sport);
  if (!rep) return { provider: "—", source: "none", matched: 0, issues: [] };
  return {
    provider: rep.provider, source: "live", matched: rep.matched,
    issues: [
      ...rep.ambiguous.map((ref) => ({ kind: "AMBIGUOUS" as const, provider: rep.provider, ref, candidates: candidatesFor(ref) })),
      ...rep.unmatched.slice(0, 200).map((ref) => ({ kind: "UNMATCHED" as const, provider: rep.provider, ref, candidates: candidatesFor(ref) })),
    ],
  };
}

export interface PlayerInspection {
  identity: { id: string; name: string; team: string; teamId: string; position: string; status: string; depthOrder: number };
  identities: IdentityRow[];
  issues: MappingIssue[];
  raw: RawRecord[];
  normalized: { player: unknown; recentGames: unknown[]; injury: unknown; projection: unknown; usageProjection: unknown };
  checks: NormalizationCheck[] | null;
  checkSource: "synthetic-roundtrip" | "live-remap" | "none";
  traces: Trace[];
  provenance: ProvenanceRow[];
}

export function inspectPlayer(ctx: AnalyticsContext, status: SnapshotStatus, id: string, provider?: InspectorProvider): PlayerInspection | null {
  const p = ctx.player(id);
  if (!p) return null;
  const snap = ctx.snap;
  const v = allValues(ctx).get(id)!;
  const configured = new Map(status.providers.map((x) => [x.name.toLowerCase().replace(/\s+/g, ""), x.configured]));
  const isConfigured = (prov: InspectorProvider) =>
    ({ balldontlie: configured.get("balldontlie"), sleeper: true, yahoo: configured.get("yahoo"), sportsdataio: configured.get("sportsdataio"), sportradar: configured.get("sportradar") })[prov] ?? false;

  // ── provider identities ──
  const mock = snap.isMock ? mockMapping(snap) : null;
  const mockSleeper = mock ? [...mock.result.map.entries()].find(([, internal]) => internal === id)?.[0] ?? null : null;
  const identities: IdentityRow[] = PROVIDERS.map((prov) => {
    if (snap.isMock) {
      if (prov === "balldontlie") return { provider: prov, externalId: String(syntheticBdlId(p)), state: "SYNTHETIC", note: "deterministic synthetic id (mock mode)" };
      if (prov === "sleeper") return mockSleeper ? { provider: prov, externalId: mockSleeper, state: "SYNTHETIC", note: "linked by the real matcher over synthetic refs" } : { provider: prov, externalId: null, state: "NOT LINKED", note: "matcher did not link a synthetic ref" };
      return { provider: prov, externalId: null, state: isConfigured(prov) ? "NOT LINKED" : "NOT CONFIGURED", note: "no adapter data in mock mode" };
    }
    const ext = p.ids[prov];
    if (ext) return { provider: prov, externalId: ext, state: "LINKED", note: prov === "balldontlie" ? "source of the normalized record" : "matched by name + position + team" };
    return { provider: prov, externalId: null, state: isConfigured(prov) ? "NOT LINKED" : "NOT CONFIGURED", note: isConfigured(prov) ? "no confident match — not guessed" : "provider not configured" };
  });
  const myName = normalizeName(p.firstName, p.lastName);
  const issues = mappingIssues(ctx).issues.filter((i) => normalizeName(i.ref.firstName, i.ref.lastName) === myName);

  // ── raw payloads ──
  let raw: RawRecord[] = snap.isMock ? syntheticRawFor(snap, p) : [...rawFor(`player:${id}`), ...(p.ids.sleeper ? rawFor(`sleeper:${p.ids.sleeper}`) : [])];
  if (provider) raw = raw.filter((r) => r.provider === provider);
  raw = raw.map((r) => ({ ...r, payload: redact(r.payload) }));

  // ── normalization check ──
  let checks: NormalizationCheck[] | null = null;
  let checkSource: PlayerInspection["checkSource"] = "none";
  if (snap.isMock) {
    checks = normalizationChecks(snap, p).checks;
    checkSource = "synthetic-roundtrip";
  } else {
    const bdl = rawFor(`player:${id}`).find((r) => r.provider === "balldontlie" && r.kind === "player");
    if (bdl) {
      const re = mapPlayer(snap.sport, bdl.payload as never);
      checks = (["firstName", "lastName", "position", "teamId", "jersey"] as const).map((f) => ({ field: `player.${f}`, normalized: re?.[f], internal: p[f], match: JSON.stringify(re?.[f]) === JSON.stringify(p[f]) }));
      checkSource = "live-remap";
    }
  }

  const games = ctx.logs(id);
  const lastGame = games[games.length - 1];
  const inj = ctx.injury(id) ?? null;
  const team = ctx.team(p.teamId);
  const gamesThisWeek = ctx.gamesFor(p.teamId, snap.currentWeek);
  const market = gamesThisWeek.map((g) => ctx.market(g.id)).find(Boolean) ?? null;

  const provenance: ProvenanceRow[] = [
    provRow("Player identity", snap.sources.sports, "player_meta"),
    provRow("Box score (latest game)", lastGame?.provenance, "completed_stats"),
    provRow("Usage signals (latest game)", lastGame?.provenance, "completed_stats"),
    provRow("Injury report", inj?.provenance ?? null, "injuries"),
    provRow("Market line (this week)", market?.provenance ?? null, "odds"),
    provRow("Fantasy roster / owner", snap.sources.fantasy, "fantasy_rosters"),
    provRow("Projection", v.week.projection.provenance),
    provRow("Opportunity Score", computed(ctx, "opportunity")),
    provRow("Availability Score", computed(ctx, "availability")),
    provRow("Fantasy Value", computed(ctx, "value")),
    provRow("Breakout Score", computed(ctx, "breakout")),
    provRow("Regression Score", computed(ctx, "sustainability")),
  ];
  provenance[1].kind = "observed";
  provenance[2].kind = "observed";

  return {
    identity: { id, name: playerName(p), team: team ? `${team.abbr} · ${team.city} ${team.name}` : p.teamId, teamId: p.teamId, position: p.position, status: p.status, depthOrder: p.depthOrder },
    identities: provider ? identities.filter((i) => i.provider === provider) : identities,
    issues,
    raw,
    normalized: {
      player: p,
      recentGames: games.slice(-4).map(({ fp: _fp, order: _o, ...g }) => g),
      injury: inj,
      projection: v.week.projection,
      usageProjection: v.week.usage ?? null,
    },
    checks, checkSource,
    traces: allTraces(ctx, id),
    provenance,
  };
}

export function inspectTeam(ctx: AnalyticsContext, teamId: string) {
  const t = ctx.team(teamId);
  if (!t) return null;
  const roster = ctx.snap.players.filter((p) => p.teamId === teamId).sort((a, b) => a.position.localeCompare(b.position) || a.depthOrder - b.depthOrder);
  const raw = ctx.snap.isMock ? [] : rawFor(`team:${teamId}`).map((r) => ({ ...r, payload: redact(r.payload) }));
  return { team: t, raw, roster: roster.map((p) => ({ id: p.id, name: playerName(p), position: p.position, depth: p.depthOrder, status: p.status })), depth: ctx.snap.depthCharts.filter((d) => d.teamId === teamId) };
}

export function inspectGame(ctx: AnalyticsContext, gameId: string) {
  const g = ctx.snap.games.find((x) => x.id === gameId);
  if (!g) return null;
  const market = ctx.market(gameId) ?? null;
  const raw = ctx.snap.isMock ? [] : rawFor(`game:${gameId}`).map((r) => ({ ...r, payload: redact(r.payload) }));
  const lines = ctx.snap.playerGames.filter((x) => x.gameId === gameId && x.played).map((x) => ({ playerId: x.playerId, name: playerName(ctx.player(x.playerId)), stats: x.stats }));
  return { game: g, market, marketFreshness: freshness(market?.provenance ?? null, "odds"), raw, lines, home: ctx.team(g.homeTeamId)?.abbr, away: ctx.team(g.awayTeamId)?.abbr };
}

export function inspectLeague(ctx: AnalyticsContext) {
  const s = ctx.snap;
  const raw = s.isMock ? [] : rawFor(`league:${s.league.id}`).map((r) => ({ ...r, payload: redact(r.payload) }));
  return {
    league: s.league, teams: s.fantasyTeams, rosterSizes: s.rosters.map((r) => ({ teamId: r.teamId, players: r.playerIds.length, starters: r.starterIds?.length ?? null, ir: r.irIds.length })),
    mapping: mappingIssues(ctx), raw, freshness: freshness(s.sources.fantasy, "fantasy_league"),
  };
}

/** Bootstrap example arguments for the tool inspector from the selected player. */
export function toolArgTemplates(ctx: AnalyticsContext, playerId: string): Record<string, unknown> {
  const p = ctx.player(playerId);
  const owner = ctx.ownerOf(playerId);
  const other = ctx.snap.fantasyTeams.find((t) => t.id !== (owner ?? ctx.userTeamId))?.id ?? ctx.userTeamId;
  const counterpart = ctx.rosterOf(other)[0] ?? playerId;
  const samePos = ctx.snap.players.find((x) => x.id !== playerId && x.position === p?.position && ctx.ownerOf(x.id) === ctx.userTeamId)?.id ?? ctx.rosterOf(ctx.userTeamId)[0];
  const pid = { playerId };
  return {
    getPlayerOutlook: pid, getGameContext: { gameId: ctx.snap.games.find((g) => g.week === ctx.snap.currentWeek)?.id ?? ctx.snap.games[0]?.id ?? "unavailable" }, getWeeklyTeamOutlook: {},
    searchPlayers: { query: p ? p.lastName : "smith" },
    getPlayerProfile: pid, getPlayerStats: { playerId, last: 4 }, getPlayerAdvancedStats: pid, getPlayerProjection: pid,
    getPlayerOpportunity: pid, getPlayerAvailability: pid, getPlayerNews: pid, getMarketExpectations: pid,
    comparePlayers: { playerA: playerId, playerB: samePos },
    getRoster: {}, analyzeRoster: {}, getLeague: {}, getLeagueRosters: {}, getMatchupContext: {},
    simulateTrade: owner ? { aGives: [playerId], bGives: [counterpart] } : { aGives: [ctx.rosterOf(ctx.userTeamId)[1]], bGives: [counterpart] },
    findTrades: {}, getWaivers: { limit: 5 }, findBreakouts: { position: p?.position, limit: 5 }, findRegressionCandidates: { limit: 5 },
    simulateScenario: { playerId, type: "out" },
  };
}
