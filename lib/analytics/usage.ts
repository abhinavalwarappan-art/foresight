import type { Player } from "@/lib/domain/types";
import { type AnalyticsContext, clamp, ewma, isNflUsage } from "./context";

/**
 * Forward-looking usage model. Converts recent observed opportunity into expected
 * per-game opportunity, then redistributes the work of players who are OUT (now, or
 * in a hypothetical scenario) to their teammates. Projection, Scenario and Trade
 * engines all sit on top of this one model so their numbers agree with each other.
 */

export interface ScenarioOverrides {
  out?: string[]; // treat as inactive
  starts?: string[]; // promote to the top of the depth chart
  minutes?: Record<string, number>; // NBA minutes override
  /** Future weeks: assume currently injured players are back. */
  ignoreStatus?: boolean;
}

export interface NflUsageProj {
  kind: "nfl";
  active: boolean;
  targets: number;
  carries: number;
  rzOpps: number;
  snapPct: number;
  passAtt: number;
  targetShare: number;
  carryShare: number;
}

export interface NbaUsageProj {
  kind: "nba";
  active: boolean;
  minutes: number;
  usageBoost: number;
  started: boolean;
  usagePct: number;
}

export type UsageProj = NflUsageProj | NbaUsageProj;

const RECENT = 4;

/** Did this player play in most of the team's recent games? (i.e. baked into recent data) */
function recentlyActive(ctx: AnalyticsContext, id: string): boolean {
  const recent = ctx.logs(id).slice(-3);
  return recent.filter((g) => g.played).length >= 2;
}

/** Players unavailable for the projection (status) — excluding those already absent in the data. */
function statusOut(ctx: AnalyticsContext, p: Player): boolean {
  return p.status === "out" || p.status === "ir";
}

export function teamUsage(ctx: AnalyticsContext, teamId: string, ov: ScenarioOverrides = {}): Map<string, UsageProj> {
  const roster = ctx.snap.players.filter((p) => p.teamId === teamId);
  return ctx.snap.sport === "nfl" ? nflTeamUsage(ctx, roster, ov) : nbaTeamUsage(ctx, roster, ov);
}

function nflTeamUsage(ctx: AnalyticsContext, roster: Player[], ov: ScenarioOverrides): Map<string, UsageProj> {
  const out = new Set(ov.out ?? []);
  // Team volume from recent games (all players' logs share the same games).
  const teamGames = new Map<string, { tgt: number; car: number; rz: number; att: number }>();
  for (const p of roster) {
    for (const g of ctx.logs(p.id)) {
      if (!g.played || !isNflUsage(g.usage)) continue;
      const t = teamGames.get(g.gameId) ?? { tgt: 0, car: 0, rz: 0, att: 0 };
      t.tgt += g.usage.targets;
      t.car += p.position === "QB" ? 0 : g.usage.carries;
      t.rz += g.usage.redZoneOpps;
      t.att += g.stats.pass_att ?? 0;
      teamGames.set(g.gameId, t);
    }
  }
  const tg = [...teamGames.values()].slice(-RECENT);
  const avg = (k: "tgt" | "car" | "rz" | "att") => (tg.length ? tg.reduce((s, x) => s + x[k], 0) / tg.length : 0);
  const vol = { tgt: avg("tgt"), car: avg("car"), rz: avg("rz"), att: avg("att") };

  type Row = { p: Player; tShare: number; cShare: number; rShare: number; snap: number; qbCarries: number; active: boolean };
  const rows: Row[] = roster.map((p) => {
    const played = ctx.logs(p.id).filter((g) => g.played).slice(-RECENT);
    const pick = (f: (g: (typeof played)[number]) => number) => ewma(played.map(f));
    const t = teamGames;
    const share = (num: (g: (typeof played)[number]) => number, den: "tgt" | "car" | "rz") =>
      pick((g) => num(g) / Math.max(1, t.get(g.gameId)?.[den] ?? 1));
    const u = (g: (typeof played)[number]) => (isNflUsage(g.usage) ? g.usage : null);
    return {
      p,
      tShare: share((g) => u(g)?.targets ?? 0, "tgt"),
      cShare: p.position === "QB" ? 0 : share((g) => u(g)?.carries ?? 0, "car"),
      rShare: share((g) => u(g)?.redZoneOpps ?? 0, "rz"),
      snap: pick((g) => u(g)?.snapPct ?? 0),
      qbCarries: p.position === "QB" ? pick((g) => u(g)?.carries ?? 0) : 0,
      active: !out.has(p.id) && (ov.ignoreStatus || !statusOut(ctx, p)),
    };
  });

  // Promotions: swap shares with the current top player at that position.
  for (const id of ov.starts ?? []) {
    const r = rows.find((x) => x.p.id === id);
    if (!r) continue;
    const top = rows.filter((x) => x.p.position === r.p.position && x.p.id !== id && x.active).sort((a, b) => b.snap - a.snap)[0];
    if (top && top.snap > r.snap) {
      [r.tShare, top.tShare] = [top.tShare, r.tShare];
      [r.cShare, top.cShare] = [top.cShare, r.cShare];
      [r.rShare, top.rShare] = [top.rShare, r.rShare];
      [r.snap, top.snap] = [top.snap, r.snap];
    }
  }

  // Redistribute work of inactive players who were part of recent usage.
  for (const gone of rows.filter((r) => !r.active && (out.has(r.p.id) || recentlyActive(ctx, r.p.id)))) {
    const mates = rows.filter((r) => r.active && r.p.position !== "QB");
    const samePos = (r: Row) => r.p.position === gone.p.position;
    const nextUp = mates.filter(samePos).sort((a, b) => b.snap - a.snap)[0];
    const weight = (r: Row, base: number) => base * (samePos(r) ? 2 : 1) * (r === nextUp ? 1.6 : 1) + 0.005;
    const spread = (amount: number, key: "tShare" | "cShare" | "rShare", pool: Row[]) => {
      const w = pool.map((r) => weight(r, r[key]));
      const sum = w.reduce((a, b) => a + b, 0) || 1;
      pool.forEach((r, i) => (r[key] += (amount * w[i]) / sum));
    };
    if (gone.p.position === "QB") {
      // Backup QB inherits the role (with an efficiency haircut handled in projection).
      const backup = rows.filter((r) => r.active && r.p.position === "QB").sort((a, b) => a.p.depthOrder - b.p.depthOrder)[0];
      if (backup) { backup.snap = 1; backup.qbCarries = Math.max(backup.qbCarries, gone.qbCarries * 0.7); }
    } else {
      spread(gone.tShare, "tShare", mates);
      spread(gone.cShare, "cShare", mates.filter((r) => r.p.position === "RB"));
      spread(gone.rShare, "rShare", mates);
      if (nextUp) nextUp.snap = Math.max(nextUp.snap, Math.min(0.95, nextUp.snap + gone.snap * 0.75));
    }
    gone.tShare = gone.cShare = gone.rShare = gone.snap = 0;
  }

  const starterQb = rows.filter((r) => r.active && r.p.position === "QB").sort((a, b) => b.snap - a.snap || a.p.depthOrder - b.p.depthOrder)[0];
  const result = new Map<string, UsageProj>();
  for (const r of rows) {
    const isQb = r.p.position === "QB";
    result.set(r.p.id, {
      kind: "nfl",
      active: r.active && (!isQb || r === starterQb),
      targets: r.tShare * vol.tgt,
      carries: isQb ? (r === starterQb ? Math.max(r.qbCarries, 2) : 0) : r.cShare * vol.car,
      rzOpps: r.rShare * vol.rz,
      snapPct: clamp(r.snap, 0, 1),
      passAtt: isQb && r === starterQb ? vol.att : 0,
      targetShare: r.tShare,
      carryShare: r.cShare,
    });
  }
  return result;
}

const GROUP: Record<string, string> = { PG: "g", SG: "g", SF: "w", PF: "b", C: "b" };

function nbaTeamUsage(ctx: AnalyticsContext, roster: Player[], ov: ScenarioOverrides): Map<string, UsageProj> {
  const out = new Set(ov.out ?? []);
  type Row = { p: Player; min: number; usage: number; started: number; active: boolean };
  const rows: Row[] = roster.map((p) => {
    const played = ctx.logs(p.id).filter((g) => g.played).slice(-6);
    const nb = played.map((g) => (isNflUsage(g.usage) ? null : g.usage)).filter((u): u is NonNullable<typeof u> => u !== null);
    const inj = ctx.injury(p.id);
    let min = ewma(nb.map((u) => u.minutes), 0.35);
    if (inj?.minutesRestriction) min = Math.min(min, inj.minutesRestriction);
    return {
      p, min, usage: ewma(nb.map((u) => u.usagePct), 0.35), started: nb.filter((u) => u.started).length / Math.max(1, nb.length),
      active: !out.has(p.id) && (ov.ignoreStatus || !statusOut(ctx, p)),
    };
  });

  for (const id of ov.starts ?? []) {
    const r = rows.find((x) => x.p.id === id);
    if (r) { r.min = Math.max(r.min, 30); r.started = 1; }
  }
  const usageAll = rows.filter((r) => r.active || recentlyActive(ctx, r.p.id) || out.has(r.p.id)).reduce((s, r) => s + r.usage, 0);

  for (const gone of rows.filter((r) => !r.active && (out.has(r.p.id) || recentlyActive(ctx, r.p.id)))) {
    const mates = rows.filter((r) => r.active && r.min > 4);
    const w = mates.map((r) => r.min * (GROUP[r.p.position] === GROUP[gone.p.position] ? 1.8 : 1));
    const sum = w.reduce((a, b) => a + b, 0) || 1;
    mates.forEach((r, i) => (r.min += (gone.min * w[i]) / sum));
    if (gone.started > 0.5) {
      const heir = mates.filter((r) => GROUP[r.p.position] === GROUP[gone.p.position] && r.started < 0.5).sort((a, b) => b.min - a.min)[0];
      if (heir) heir.started = 1;
    }
    gone.min = 0;
  }

  // Explicit minute overrides: take/give the difference proportionally from teammates.
  for (const [id, target] of Object.entries(ov.minutes ?? {})) {
    const r = rows.find((x) => x.p.id === id);
    if (!r || !r.active) continue;
    const diff = target - r.min;
    r.min = target;
    const others = rows.filter((x) => x !== r && x.active && x.min > 0);
    const sum = others.reduce((s, x) => s + x.min, 0) || 1;
    others.forEach((x) => (x.min = Math.max(0, x.min - (diff * x.min) / sum)));
  }

  const usageActive = rows.filter((r) => r.active).reduce((s, r) => s + r.usage, 0) || 1;
  const boost = clamp(Math.sqrt(usageAll / usageActive), 1, 1.2);
  const result = new Map<string, UsageProj>();
  for (const r of rows) {
    result.set(r.p.id, {
      kind: "nba", active: r.active, minutes: clamp(r.min, 0, 40), usageBoost: r.active ? boost : 0,
      started: r.started >= 0.5, usagePct: r.usage * (r.active ? boost : 0),
    });
  }
  return result;
}
