import type { DataSnapshot } from "@/lib/domain/snapshot";
import type {
  Game, GameMarket, Injury, NbaUsage, NflUsage, Player, PlayerGame, Position, Team,
} from "@/lib/domain/types";
import { fantasyPoints } from "@/lib/scoring";

/**
 * Precomputed indexes + league baselines over a snapshot. Every engine takes this.
 * Pure function of the snapshot → safe to memoize.
 */
export interface AnalyticsContext {
  snap: DataSnapshot;
  player: (id: string) => Player | undefined;
  team: (id: string) => Team | undefined;
  /** Chronological games for a player (played or not). */
  logs: (id: string) => (PlayerGame & { fp: number; order: number })[];
  injury: (id: string) => Injury | undefined;
  teammates: (playerId: string) => Player[];
  /** Upcoming games for a team in a given fantasy week. */
  gamesFor: (teamId: string, week: number) => Game[];
  market: (gameId: string) => GameMarket | undefined;
  leagueAvgImplied: number;
  /** Position-level expected fantasy points per unit of opportunity. */
  xfpRates: XfpRates;
  /** opponent teamId → position → points-allowed multiplier (shrunk to 1). */
  defenseFactor: (teamId: string, pos: Position) => number;
  rosterOf: (fantasyTeamId: string) => string[];
  ownerOf: (playerId: string) => string | null;
  userTeamId: string;
}

export interface XfpRates {
  perTarget: Partial<Record<Position, number>>;
  perCarry: Partial<Record<Position, number>>;
  perRz: Partial<Record<Position, number>>;
  perPassAtt: number;
  perMinute: Partial<Record<Position, number>>; // NBA
}

const memo = new WeakMap<DataSnapshot, AnalyticsContext>();

export const isNflUsage = (u: NflUsage | NbaUsage): u is NflUsage => "snapPct" in u;

export function buildContext(snap: DataSnapshot): AnalyticsContext {
  const hit = memo.get(snap);
  if (hit) return hit;

  const playerMap = new Map(snap.players.map((p) => [p.id, p]));
  const teamMap = new Map(snap.teams.map((t) => [t.id, t]));
  const gameOrder = new Map(snap.games.map((g, i) => [g.id, i]));
  const scoring = snap.league.scoring;

  const logMap = new Map<string, (PlayerGame & { fp: number; order: number })[]>();
  for (const pg of snap.playerGames) {
    const arr = logMap.get(pg.playerId) ?? [];
    arr.push({ ...pg, fp: pg.played ? fantasyPoints(pg.stats, scoring) : 0, order: gameOrder.get(pg.gameId) ?? 0 });
    logMap.set(pg.playerId, arr);
  }
  for (const arr of logMap.values()) arr.sort((a, b) => a.order - b.order);

  const injuryMap = new Map(snap.injuries.map((i) => [i.playerId, i]));
  const byTeam = new Map<string, Player[]>();
  for (const p of snap.players) byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p]);
  const marketMap = new Map(snap.markets.map((m) => [m.gameId, m]));
  const implied = snap.markets.flatMap((m) => [m.homeImpliedTotal, m.awayImpliedTotal]);
  const leagueAvgImplied = implied.length ? implied.reduce((a, b) => a + b, 0) / implied.length : 0;

  // ── xFP rates: league points per opportunity unit, by position ──
  const xfpRates: XfpRates = { perTarget: {}, perCarry: {}, perRz: {}, perPassAtt: 0, perMinute: {} };
  if (snap.sport === "nfl") {
    const agg: Record<string, { pts: number; tgt: number; car: number; rz: number }> = {};
    let qbPts = 0;
    let qbAtt = 0;
    for (const p of snap.players) {
      for (const g of logMap.get(p.id) ?? []) {
        if (!g.played || !isNflUsage(g.usage)) continue;
        if (p.position === "QB") {
          qbPts += g.fp;
          qbAtt += g.stats.pass_att ?? 0;
          continue;
        }
        const a = (agg[p.position] ??= { pts: 0, tgt: 0, car: 0, rz: 0 });
        a.pts += g.fp; a.tgt += g.usage.targets; a.car += g.usage.carries; a.rz += g.usage.redZoneOpps;
      }
    }
    for (const [pos, a] of Object.entries(agg)) {
      // Split points: rz opps carry a TD premium; the rest split by touches.
      const rzPts = a.rz * 1.6;
      const base = Math.max(0, a.pts - rzPts);
      const units = a.tgt * 1.8 + a.car; // a target ≈ 1.8x a carry in PPR value
      const per = units > 0 ? base / units : 0;
      xfpRates.perTarget[pos as Position] = per * 1.8;
      xfpRates.perCarry[pos as Position] = per;
      xfpRates.perRz[pos as Position] = 1.6;
    }
    xfpRates.perPassAtt = qbAtt > 0 ? qbPts / qbAtt : 0.5;
  } else {
    const agg: Record<string, { pts: number; min: number }> = {};
    for (const p of snap.players) {
      for (const g of logMap.get(p.id) ?? []) {
        if (!g.played || isNflUsage(g.usage)) continue;
        const a = (agg[p.position] ??= { pts: 0, min: 0 });
        a.pts += g.fp; a.min += g.usage.minutes;
      }
    }
    for (const [pos, a] of Object.entries(agg)) xfpRates.perMinute[pos as Position] = a.min ? a.pts / a.min : 1;
  }

  // ── Defense vs position: points allowed / league average, shrunk ──
  const allowed = new Map<string, { pts: number; n: number }>();
  const posTotals = new Map<string, { pts: number; n: number }>();
  for (const p of snap.players) {
    for (const g of logMap.get(p.id) ?? []) {
      if (!g.played) continue;
      const k = `${g.opponentTeamId}|${p.position}`;
      const a = allowed.get(k) ?? { pts: 0, n: 0 };
      allowed.set(k, { pts: a.pts + g.fp, n: a.n + 1 });
      const t = posTotals.get(p.position) ?? { pts: 0, n: 0 };
      posTotals.set(p.position, { pts: t.pts + g.fp, n: t.n + 1 });
    }
  }
  const defenseFactor = (teamId: string, pos: Position) => {
    const a = allowed.get(`${teamId}|${pos}`);
    const t = posTotals.get(pos);
    if (!a || !t || t.n === 0) return 1;
    const avg = t.pts / t.n;
    const raw = a.pts / a.n / (avg || 1);
    const w = a.n / (a.n + 30); // shrinkage
    return 1 + (raw - 1) * w;
  };

  const rosterMap = new Map(snap.rosters.map((r) => [r.teamId, r.playerIds]));
  const owner = new Map<string, string>();
  for (const r of snap.rosters) for (const id of [...r.playerIds, ...r.irIds]) owner.set(id, r.teamId);
  const gamesByTeamWeek = new Map<string, Game[]>();
  for (const g of snap.games) {
    for (const t of [g.homeTeamId, g.awayTeamId]) {
      const k = `${t}|${g.week}`;
      gamesByTeamWeek.set(k, [...(gamesByTeamWeek.get(k) ?? []), g]);
    }
  }

  const ctx: AnalyticsContext = {
    snap,
    player: (id) => playerMap.get(id),
    team: (id) => teamMap.get(id),
    logs: (id) => logMap.get(id) ?? [],
    injury: (id) => injuryMap.get(id),
    teammates: (id) => {
      const p = playerMap.get(id);
      return p ? (byTeam.get(p.teamId) ?? []).filter((x) => x.id !== id) : [];
    },
    gamesFor: (teamId, week) => gamesByTeamWeek.get(`${teamId}|${week}`) ?? [],
    market: (gameId) => marketMap.get(gameId),
    leagueAvgImplied,
    xfpRates,
    defenseFactor,
    rosterOf: (tid) => rosterMap.get(tid) ?? [],
    ownerOf: (pid) => owner.get(pid) ?? null,
    userTeamId: snap.fantasyTeams.find((t) => t.isUser)?.id ?? snap.fantasyTeams[0].id,
  };
  memo.set(snap, ctx);
  return ctx;
}

export const playerName = (p: Player | undefined) => (p ? `${p.firstName} ${p.lastName}` : "Unknown");

/** Exponentially weighted mean, most recent last. */
export function ewma(values: number[], alpha = 0.45): number {
  if (!values.length) return 0;
  let m = values[0];
  for (let i = 1; i < values.length; i++) m = alpha * values[i] + (1 - alpha) * m;
  return m;
}

export function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xm = (n - 1) / 2;
  const ym = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - xm) * (y - ym);
    den += (x - xm) ** 2;
  });
  return den ? num / den : 0;
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};
export const round1 = (n: number) => Math.round(n * 10) / 10;
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
