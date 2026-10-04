import "server-only";
import { env } from "@/lib/config/env";
import type { DataSnapshot } from "@/lib/domain/snapshot";
import type { Player, PlayerGame, Provenance, Sport } from "@/lib/domain/types";
import { matchPlayers, type MatchResult } from "@/lib/ids/mapping";
import { getMockWorld } from "@/lib/mock/world";
import { fantasyPoints } from "@/lib/scoring";
import { sleeper } from "./fantasy/sleeper";
import { yahoo } from "./fantasy/yahoo";
import type { FantasyProvider } from "./fantasy/types";
import { allHealth, setState } from "./health";
import { theOddsApi } from "./odds/theOddsApi";
import { exa } from "./research/exa";
import { mockResearch } from "./research/mock";
import type { ResearchProvider } from "./research/types";
import { balldontlie } from "./sports/balldontlie";
import { sportradar, sportsDataIo } from "./sports/stubs";
import type { SportsProvider } from "./sports/types";

export interface LeagueConnection {
  provider: "sleeper" | "yahoo";
  leagueId: string;
  userId?: string;
}

export interface SnapshotStatus {
  mode: "mock" | "live";
  usingMock: boolean;
  fallbackReason: string | null;
  providers: { domain: string; name: string; configured: boolean }[];
  unmatchedPlayers: number;
}

const SPORTS_CHAIN: SportsProvider[] = [balldontlie, sportsDataIo, sportradar];
const FANTASY: Record<LeagueConnection["provider"], FantasyProvider> = { sleeper, yahoo };

export function providerStatus(): SnapshotStatus["providers"] {
  return [
    { domain: "sports", name: "BALLDONTLIE", configured: balldontlie.isConfigured() },
    { domain: "sports", name: "SportsDataIO", configured: Boolean(env.SPORTSDATAIO_API_KEY) },
    { domain: "sports", name: "Sportradar", configured: Boolean(env.SPORTRADAR_API_KEY_NBA || env.SPORTRADAR_API_KEY_NFL) },
    { domain: "fantasy", name: "Sleeper", configured: true },
    { domain: "fantasy", name: "Yahoo", configured: yahoo.isConfigured() },
    { domain: "odds", name: "The Odds API", configured: theOddsApi.isConfigured() },
    { domain: "research", name: "Exa", configured: exa.isConfigured() },
  ];
}

export const currentSeason = (sport: Sport, now = new Date()) =>
  sport === "nfl" ? (now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1) : now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;

const memo = new Map<string, { at: number; snap: DataSnapshot; status: SnapshotStatus }>();

/** Last identity-mapping outcome per sport, for the Data Inspector. */
export interface MappingReport {
  provider: string;
  leagueId: string;
  at: string;
  matched: number;
  unmatched: MatchResult["unmatched"];
  ambiguous: MatchResult["ambiguous"];
}
const mappingReports = new Map<Sport, MappingReport>();
export const lastMappingReport = (sport: Sport) => mappingReports.get(sport) ?? null;
const TTL = 5 * 60_000;

/**
 * The single entry point the service layer uses to get data.
 * mock mode → deterministic fictional world.
 * live mode → BALLDONTLIE (+ fallbacks) for sports, Sleeper/Yahoo for the league,
 * The Odds API for markets. Any unrecoverable gap falls back to mock — loudly,
 * with the reason surfaced in the UI. Nothing is silently fabricated.
 */
export async function getSnapshot(sport: Sport, conn?: LeagueConnection | null): Promise<{ snap: DataSnapshot; status: SnapshotStatus }> {
  const providers = providerStatus();
  const mock = (reason: string | null) => ({
    snap: getMockWorld(sport),
    status: { mode: env.DATA_MODE, usingMock: true, fallbackReason: reason, providers, unmatchedPlayers: 0 } satisfies SnapshotStatus,
  });
  if (env.DATA_MODE === "mock") {
    for (const p of ["balldontlie", "sleeper", "the-odds-api", "exa"]) setState(p, "mock");
    return mock(null);
  }
  if (!conn) return mock("Live mode is on, but no fantasy league is connected yet.");

  const key = `${sport}:${conn.provider}:${conn.leagueId}:${conn.userId ?? ""}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit;
  try {
    const built = await buildLive(sport, conn);
    const value = { at: Date.now(), ...built, status: { ...built.status, providers } };
    memo.set(key, value);
    return value;
  } catch (e) {
    if (hit) return { ...hit, status: { ...hit.status, fallbackReason: `Serving cached snapshot: ${(e as Error).message}` } };
    return mock(`Live providers failed: ${(e as Error).message}`);
  }
}

async function firstWorking<T>(chain: SportsProvider[], f: (p: SportsProvider) => Promise<T>): Promise<T> {
  const errors: string[] = [];
  for (const p of chain) {
    if (!p.isConfigured()) continue;
    try {
      return await f(p);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  throw new Error(errors.length ? errors.join("; ") : "no sports provider configured (set BALLDONTLIE_API_KEY)");
}

async function buildLive(sport: Sport, conn: LeagueConnection): Promise<{ snap: DataSnapshot; status: SnapshotStatus }> {
  const season = currentSeason(sport);
  const [teams, players, games, injuries, league] = await Promise.all([
    firstWorking(SPORTS_CHAIN, (p) => p.getTeams(sport)),
    firstWorking(SPORTS_CHAIN, (p) => p.getPlayers(sport)),
    firstWorking(SPORTS_CHAIN, (p) => p.getGames(sport, season)),
    firstWorking(SPORTS_CHAIN, (p) => p.getInjuries(sport)).catch(() => null),
    FANTASY[conn.provider].getLeague(conn.leagueId, { userId: conn.userId, sport }),
  ]);

  const recentCutoff = Date.now() - (sport === "nfl" ? 70 : 24) * 86_400_000;
  const completed = games.data.filter((g) => g.status === "final" && Date.parse(g.date) >= recentCutoff);
  const pg = await firstWorking(SPORTS_CHAIN, (p) => p.getPlayerGames(sport, season, completed.map((g) => g.id)));

  const playerGames: PlayerGame[] = pg.data;

  // Map league players (provider ids) → internal ids
  const abbr = new Map(teams.data.map((t) => [t.id, t.abbr]));
  const match = matchPlayers(league.data.players, players.data, (tid) => abbr.get(tid) ?? "");
  mappingReports.set(sport, { provider: conn.provider, leagueId: conn.leagueId, at: new Date().toISOString(), matched: match.map.size, unmatched: match.unmatched, ambiguous: match.ambiguous });
  const toInternal = (id: string) => match.map.get(id);
  const rosters = league.data.rosters.map((r) => ({
    ...r,
    playerIds: r.playerIds.map(toInternal).filter((x): x is string => Boolean(x)),
    irIds: r.irIds.map(toInternal).filter((x): x is string => Boolean(x)),
  }));
  const injuryMap = new Map((injuries?.data ?? []).map((i) => [i.playerId, i]));
  const reverse = new Map([...match.map.entries()].map(([ext, internal]) => [internal, ext]));
  const mappedPlayers: Player[] = players.data.map((p) => {
    const ext = reverse.get(p.id);
    const hint = ext ? league.data.hints[ext] : undefined;
    return {
      ...p,
      ids: { ...p.ids, ...(ext ? { [conn.provider]: ext } : {}) },
      status: injuryMap.get(p.id)?.designation ?? p.status,
      depthOrder: hint?.depthOrder ?? p.depthOrder,
    };
  });

  const currentWeek = league.data.league.currentWeek;
  const scheduledWeek = games.data.filter((g) => g.week === currentWeek);
  const odds = theOddsApi.isConfigured()
    ? await theOddsApi.getGameMarkets(sport, scheduledWeek, teams.data).catch(() => ({ data: [], provenance: liveProv("the-odds-api") }))
    : { data: [], provenance: liveProv("none") };

  // Consensus proxy: season PPG rank (clearly labeled; replace with ADP/ECR provider later)
  const ppg = new Map<string, { s: number; n: number }>();
  for (const g of playerGames) {
    if (!g.played) continue;
    const a = ppg.get(g.playerId) ?? { s: 0, n: 0 };
    ppg.set(g.playerId, { s: a.s + fantasyPoints(g.stats, league.data.league.scoring), n: a.n + 1 });
  }
  const consensusRank: Record<string, number> = {};
  [...mappedPlayers].sort((a, b) => avg(ppg.get(b.id)) - avg(ppg.get(a.id))).forEach((p, i) => (consensusRank[p.id] = i + 1));

  const snap: DataSnapshot = {
    sport, season, currentWeek, generatedAt: new Date().toISOString(), isMock: false,
    teams: teams.data, players: mappedPlayers, games: games.data, playerGames,
    injuries: injuries?.data ?? [], injuryHistory: [], depthCharts: [], markets: odds.data, props: [], consensusRank,
    league: league.data.league, fantasyTeams: league.data.teams, rosters, matchups: league.data.matchups,
    transactions: league.data.transactions.map((t) => ({
      ...t,
      adds: t.adds.map((a) => ({ ...a, playerId: toInternal(a.playerId) ?? a.playerId })),
      drops: t.drops.map((d) => ({ ...d, playerId: toInternal(d.playerId) ?? d.playerId })),
    })),
    research: [],
    sources: { sports: players.provenance, fantasy: league.provenance, odds: odds.provenance, research: liveProv(exa.isConfigured() ? "exa" : "none") },
  };
  return {
    snap,
    status: { mode: "live", usingMock: false, fallbackReason: null, providers: [], unmatchedPlayers: match.unmatched.length + match.ambiguous.length },
  };
}

const avg = (x?: { s: number; n: number }) => (x && x.n ? x.s / x.n : 0);
function liveProv(source: string): Provenance {
  return { source, sourceTimestamp: null, retrievedAt: new Date().toISOString(), confidence: null, isProjection: false, kind: "observed" };
}

export function researchProvider(): ResearchProvider {
  return env.DATA_MODE === "live" && exa.isConfigured() ? exa : mockResearch;
}

export { allHealth };
