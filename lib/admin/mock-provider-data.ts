import "server-only";
import type { DataSnapshot } from "@/lib/domain/snapshot";
import type { Injury, Player, PlayerGame } from "@/lib/domain/types";
import { type ExternalPlayerRef, matchPlayers, type MatchResult } from "@/lib/ids/mapping";
import { mapDesignation, mapNbaStats, mapNflStats, mapPlayer } from "@/lib/providers/sports/balldontlie";
import type { RawRecord } from "@/lib/providers/raw-store";

/**
 * SYNTHETIC provider payloads for mock mode. They are built from the mock world in the
 * exact response shapes of the real providers (BALLDONTLIE OpenAPI, Sleeper docs) and
 * then pushed back through the REAL adapters, so normalization can be validated before
 * any credential exists. Always labeled `synthetic: true` — never presented as real.
 */

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 900_000 + 100_000;
};
export const syntheticBdlId = (p: Player) => hash(`bdl:${p.id}`);
export const syntheticSleeperId = (p: Player) => String(hash(`sleeper:${p.id}`));

const MOCK_ENDPOINT = (sport: string, path: string) => `synthetic://api.balldontlie.io/${sport}/v1/${path}`;

function bdlTeam(snap: DataSnapshot, teamId: string) {
  const t = snap.teams.find((x) => x.id === teamId)!;
  const id = hash(`bdlteam:${t.id}`) % 1000;
  return snap.sport === "nfl"
    ? { id, conference: t.conference, division: t.conference, location: t.city, name: t.name, full_name: `${t.city} ${t.name}`, abbreviation: t.abbr }
    : { id, conference: t.conference, division: t.conference, city: t.city, name: t.name, full_name: `${t.city} ${t.name}`, abbreviation: t.abbr };
}

const NFL_POS_NAME: Record<string, string> = { QB: "Quarterback", RB: "Running Back", WR: "Wide Receiver", TE: "Tight End", K: "Place Kicker" };
const NBA_POS: Record<string, string> = { PG: "G", SG: "G-F", SF: "F", PF: "F-C", C: "C" };

export function syntheticBdlPlayer(snap: DataSnapshot, p: Player) {
  return snap.sport === "nfl"
    ? { id: syntheticBdlId(p), first_name: p.firstName, last_name: p.lastName, position: NFL_POS_NAME[p.position], position_abbreviation: p.position, height: null, weight: null, jersey_number: String(p.jersey), college: null, experience: `${p.experience}th Season`, age: p.age, team: bdlTeam(snap, p.teamId) }
    : { id: syntheticBdlId(p), first_name: p.firstName, last_name: p.lastName, position: NBA_POS[p.position], height: null, weight: null, jersey_number: String(p.jersey), college: null, country: null, draft_year: null, draft_round: null, draft_number: null, team: bdlTeam(snap, p.teamId) };
}

function syntheticGame(snap: DataSnapshot, gameId: string) {
  const g = snap.games.find((x) => x.id === gameId)!;
  return { id: hash(`bdlgame:${g.id}`), date: g.date, season: g.season, week: g.week, status: g.status === "final" ? "Final" : g.date, home_team: bdlTeam(snap, g.homeTeamId), visitor_team: bdlTeam(snap, g.awayTeamId), home_team_score: g.homeScore, visitor_team_score: g.awayScore };
}

export function syntheticBdlStats(snap: DataSnapshot, p: Player, g: PlayerGame) {
  const s = g.stats;
  const base = { player: syntheticBdlPlayer(snap, p), team: bdlTeam(snap, p.teamId), game: syntheticGame(snap, g.gameId) };
  if (snap.sport === "nfl") {
    return {
      ...base,
      passing_attempts: s.pass_att ?? null, passing_yards: s.pass_yds ?? null, passing_touchdowns: s.pass_td ?? null, passing_interceptions: s.pass_int ?? null,
      rushing_attempts: s.rush_att ?? null, rushing_yards: s.rush_yds ?? null, rushing_touchdowns: s.rush_td ?? null,
      receptions: s.rec ?? null, receiving_yards: s.rec_yds ?? null, receiving_touchdowns: s.rec_td ?? null, receiving_targets: s.targets ?? null, fumbles_lost: s.fum_lost ?? null,
    };
  }
  const min = s.min ?? 0;
  return { ...base, id: hash(`bdlstat:${p.id}:${g.gameId}`), min: `${Math.floor(min)}:${String(Math.round((min % 1) * 60)).padStart(2, "0")}`, fgm: s.fgm ?? 0, fga: s.fga ?? 0, fg3m: s.fg3m ?? 0, ftm: s.ftm ?? 0, fta: s.fta ?? 0, reb: s.reb ?? 0, ast: s.ast ?? 0, stl: s.stl ?? 0, blk: s.blk ?? 0, turnover: s.tov ?? 0, pts: s.pts ?? 0 };
}

export function syntheticBdlInjury(snap: DataSnapshot, p: Player, inj: Injury) {
  const status = { out: "Out", ir: "Injured Reserve", doubtful: "Doubtful", questionable: "Questionable", probable: "Probable", "day-to-day": "Day-To-Day", healthy: "Active" }[inj.designation];
  return snap.sport === "nfl"
    ? { player: syntheticBdlPlayer(snap, p), status, comment: inj.note, date: inj.reportedAt }
    : { player: syntheticBdlPlayer(snap, p), status, description: inj.note, return_date: null };
}

export function syntheticSleeperPlayer(snap: DataSnapshot, p: Player) {
  return {
    player_id: syntheticSleeperId(p), first_name: p.firstName, last_name: p.lastName, position: p.position,
    team: snap.teams.find((t) => t.id === p.teamId)?.abbr ?? null,
    injury_status: p.status === "healthy" ? null : p.status === "questionable" ? "Questionable" : p.status === "out" ? "Out" : p.status,
    depth_chart_order: p.depthOrder, number: p.jersey, years_exp: p.experience, age: p.age, sport: snap.sport,
  };
}

export interface NormalizationCheck {
  field: string;
  normalized: unknown; // what our adapter produced from the synthetic raw payload
  internal: unknown; // what the mock world holds
  match: boolean;
}

/** Re-normalize the synthetic payloads through the REAL adapters and diff against the mock world. */
export function normalizationChecks(snap: DataSnapshot, p: Player) {
  const viaAdapter = mapPlayer(snap.sport, syntheticBdlPlayer(snap, p) as never);
  const checks: NormalizationCheck[] = [];
  const add = (field: string, a: unknown, b: unknown) => checks.push({ field, normalized: a, internal: b, match: JSON.stringify(a) === JSON.stringify(b) });
  add("player.firstName", viaAdapter?.firstName, p.firstName);
  add("player.lastName", viaAdapter?.lastName, p.lastName);
  // BDL generalizes NBA positions (G, F, F-C…) so exact NBA positions cannot round-trip.
  add("player.position", viaAdapter?.position, p.position);
  add("player.jersey", viaAdapter?.jersey, p.jersey);
  const games = snap.playerGames.filter((g) => g.playerId === p.id && g.played);
  const last = games[games.length - 1];
  let statsViaAdapter: PlayerGame | null = null;
  if (last) {
    const raw = syntheticBdlStats(snap, p, last);
    statsViaAdapter = snap.sport === "nfl" ? mapNflStats(raw as never, snap.generatedAt) : mapNbaStats(raw as never, last.week, snap.generatedAt);
    for (const [k, v] of Object.entries(last.stats)) add(`stats.${k} (${last.gameId})`, statsViaAdapter.stats[k], v);
  }
  const inj = snap.injuries.find((i) => i.playerId === p.id);
  if (inj) add("injury.designation", mapDesignation(String(syntheticBdlInjury(snap, p, inj).status)), inj.designation);
  return { checks, playerViaAdapter: viaAdapter, statsViaAdapter };
}

/** Raw records for a mock player, in provider shapes, labeled synthetic. */
export function syntheticRawFor(snap: DataSnapshot, p: Player): RawRecord[] {
  const at = snap.generatedAt;
  const out: RawRecord[] = [
    { provider: "balldontlie", kind: "player", entityKey: `player:${p.id}`, endpoint: MOCK_ENDPOINT(snap.sport, "players/active"), retrievedAt: at, cache: "mock", synthetic: true, payload: syntheticBdlPlayer(snap, p) },
    { provider: "sleeper", kind: "player", entityKey: `player:${p.id}`, endpoint: `synthetic://api.sleeper.app/v1/players/${snap.sport}`, retrievedAt: at, cache: "mock", synthetic: true, payload: syntheticSleeperPlayer(snap, p) },
  ];
  for (const g of snap.playerGames.filter((x) => x.playerId === p.id && x.played).slice(-4)) {
    out.push({ provider: "balldontlie", kind: "stats", entityKey: `player:${p.id}`, endpoint: MOCK_ENDPOINT(snap.sport, `stats?game_ids[]=${hash(`bdlgame:${g.gameId}`)}`), retrievedAt: at, cache: "mock", synthetic: true, payload: syntheticBdlStats(snap, p, g) });
  }
  const inj = snap.injuries.find((i) => i.playerId === p.id);
  if (inj) out.push({ provider: "balldontlie", kind: "injury", entityKey: `player:${p.id}`, endpoint: MOCK_ENDPOINT(snap.sport, "player_injuries"), retrievedAt: at, cache: "mock", synthetic: true, payload: syntheticBdlInjury(snap, p, inj) });
  return out;
}

const mappingMemo = new WeakMap<DataSnapshot, { result: MatchResult; refs: ExternalPlayerRef[] }>();

/**
 * Run the REAL matcher over synthetic Sleeper refs for every rostered mock player, plus
 * two injected edge cases: a same-name free agent (ambiguous) and an unknown player.
 */
export function mockMapping(snap: DataSnapshot) {
  const hit = mappingMemo.get(snap);
  if (hit) return hit;
  const abbr = (tid: string) => snap.teams.find((t) => t.id === tid)?.abbr ?? "";
  const refs: ExternalPlayerRef[] = snap.players.map((p) => ({ externalId: syntheticSleeperId(p), firstName: p.firstName, lastName: p.lastName, position: p.position, teamAbbr: abbr(p.teamId) }));
  const counts = new Map<string, number>();
  for (const p of snap.players) counts.set(`${p.firstName} ${p.lastName}|${p.position}`, (counts.get(`${p.firstName} ${p.lastName}|${p.position}`) ?? 0) + 1);
  const twin = snap.players.find((p) => (counts.get(`${p.firstName} ${p.lastName}|${p.position}`) ?? 0) > 1);
  if (twin) refs.push({ externalId: "9000001", firstName: twin.firstName, lastName: twin.lastName, position: twin.position, teamAbbr: null });
  refs.push({ externalId: "9000002", firstName: "Unlisted", lastName: "Prospect", position: snap.sport === "nfl" ? "RB" : "SF", teamAbbr: null });
  const result = matchPlayers(refs, snap.players, abbr);
  const value = { result, refs };
  mappingMemo.set(snap, value);
  return value;
}
