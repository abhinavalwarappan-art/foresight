import type { DataSnapshot } from "@/lib/domain/snapshot";
import { buildContext, mean, round1 } from "./context";
import { PROJECTION_MODEL_VERSION, projectMany } from "./projection";

/**
 * Walk-forward backtest: for each completed week, rebuild the world using ONLY
 * games before that week, project, then score against what actually happened.
 * Injury statuses are not known historically, so everyone is treated as healthy —
 * unannounced absences count against the model, as they would in reality.
 * Compared against a naive season-average baseline.
 */
export interface WeekScore {
  week: number;
  n: number;
  mae: number;
  rmse: number;
  baselineMae: number;
  bias: number;
  coverage: number; // share of actuals inside floor–ceiling (target ≈ 60%)
  rankCorr: number; // mean Spearman within position
}

export interface BacktestReport {
  modelVersion: string;
  weeks: WeekScore[];
  overall: Omit<WeekScore, "week">;
  calibration: { bucket: string; predicted: number; actual: number; n: number }[];
}

function spearman(a: number[], b: number[]): number {
  if (a.length < 3) return 0;
  const rank = (xs: number[]) => {
    const idx = xs.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
    const r = new Array(xs.length);
    idx.forEach(([, i], k) => (r[i] = k));
    return r as number[];
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  const d2 = ra.reduce((s, r, i) => s + (r - rb[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

const memo = new WeakMap<DataSnapshot, BacktestReport>();

export function backtest(snap: DataSnapshot): BacktestReport {
  const hit = memo.get(snap);
  if (hit) return hit;
  const weeks: WeekScore[] = [];
  const buckets = new Map<number, { pred: number; act: number; n: number }>();
  const all = { err: [] as number[], base: [] as number[], cov: [] as number[], corr: [] as number[] };

  for (let w = 3; w < snap.currentWeek; w++) {
    const past: DataSnapshot = {
      ...snap, currentWeek: w,
      playerGames: snap.playerGames.filter((g) => g.week < w),
      players: snap.players.map((p) => ({ ...p, status: "healthy" })),
      injuries: [], markets: [], props: [],
    };
    const ctx = buildContext(past);
    const actualRows = snap.playerGames.filter((g) => g.week === w);
    const ids = [...new Set(actualRows.map((g) => g.playerId))];
    const proj = projectMany(ctx, ids, w);
    const truth = buildContext(snap);
    const rows: { pos: string; pred: number; act: number; base: number; floor: number; ceil: number }[] = [];
    for (const id of ids) {
      const pr = proj.get(id)?.projection;
      if (!pr || pr.median < 1) continue; // only fantasy-relevant projections
      const act = truth.logs(id).filter((g) => g.week === w).reduce((s, g) => s + g.fp, 0);
      const games = ctx.logs(id).filter((g) => g.played);
      const base = games.length ? mean(games.map((g) => g.fp)) * Math.max(1, pr.gamesInWeek) : 0;
      rows.push({ pos: ctx.player(id)!.position, pred: pr.weeklyMedian, act, base, floor: pr.weeklyMedian - (pr.median - pr.floor) * Math.sqrt(Math.max(1, pr.gamesInWeek)), ceil: pr.weeklyMedian + (pr.ceiling - pr.median) * Math.sqrt(Math.max(1, pr.gamesInWeek)) });
    }
    if (!rows.length) continue;
    const err = rows.map((r) => r.pred - r.act);
    const baseErr = rows.map((r) => Math.abs(r.base - r.act));
    const cov = rows.map((r) => (r.act >= r.floor && r.act <= r.ceil ? 1 : 0));
    const positions = [...new Set(rows.map((r) => r.pos))];
    const corr = positions.map((pos) => { const rs = rows.filter((r) => r.pos === pos); return spearman(rs.map((r) => r.pred), rs.map((r) => r.act)); });
    for (const r of rows) {
      const step = snap.sport === "nfl" ? 5 : 40;
      const b = Math.floor(r.pred / step) * step;
      const cur = buckets.get(b) ?? { pred: 0, act: 0, n: 0 };
      buckets.set(b, { pred: cur.pred + r.pred, act: cur.act + r.act, n: cur.n + 1 });
    }
    all.err.push(...err); all.base.push(...baseErr); all.cov.push(...cov); all.corr.push(...corr);
    weeks.push({
      week: w, n: rows.length, mae: round1(mean(err.map(Math.abs))), rmse: round1(Math.sqrt(mean(err.map((e) => e * e)))),
      baselineMae: round1(mean(baseErr)), bias: round1(mean(err)), coverage: Math.round(mean(cov) * 100), rankCorr: Math.round(mean(corr) * 100) / 100,
    });
  }
  const report: BacktestReport = {
    modelVersion: PROJECTION_MODEL_VERSION,
    weeks,
    overall: {
      n: all.err.length, mae: round1(mean(all.err.map(Math.abs))), rmse: round1(Math.sqrt(mean(all.err.map((e) => e * e)))),
      baselineMae: round1(mean(all.base)), bias: round1(mean(all.err)), coverage: Math.round(mean(all.cov) * 100), rankCorr: Math.round(mean(all.corr) * 100) / 100,
    },
    calibration: [...buckets.entries()].sort((a, b) => a[0] - b[0]).filter(([, v]) => v.n >= 5).map(([b, v]) => ({ bucket: `${b}–${b + (snap.sport === "nfl" ? 5 : 40)}`, predicted: round1(v.pred / v.n), actual: round1(v.act / v.n), n: v.n })),
  };
  memo.set(snap, report);
  return report;
}
