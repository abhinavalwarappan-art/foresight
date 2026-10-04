import type { ScoringFormat, ScoringSettings, StatLine } from "@/lib/domain/types";

const NFL_BASE: Record<string, number> = {
  pass_yds: 0.04,
  pass_td: 4,
  pass_int: -2,
  rush_yds: 0.1,
  rush_td: 6,
  rec_yds: 0.1,
  rec_td: 6,
  fum_lost: -2,
  two_pt: 2,
};

export const SCORING_PRESETS: Record<ScoringFormat, ScoringSettings> = {
  ppr: { format: "ppr", weights: { ...NFL_BASE, rec: 1 } },
  half: { format: "half", weights: { ...NFL_BASE, rec: 0.5 } },
  standard: { format: "standard", weights: { ...NFL_BASE, rec: 0 } },
  // Common points-league defaults (similar to most hosts' NBA points presets).
  nba_points: {
    format: "nba_points",
    weights: { pts: 1, reb: 1.2, ast: 1.5, stl: 3, blk: 3, tov: -1, fg3m: 0.5 },
  },
  // Category leagues: weights are unused for totals; see categoryValue().
  nba_9cat: { format: "nba_9cat", weights: {} },
};

export const NBA_CATEGORIES = ["pts", "reb", "ast", "stl", "blk", "fg3m", "fg_pct", "ft_pct", "tov"] as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Fantasy points for a stat line. Pure, unit-tested. */
export function fantasyPoints(stats: StatLine, scoring: ScoringSettings): number {
  if (scoring.format === "nba_9cat") return fantasyPoints(stats, SCORING_PRESETS.nba_points);
  let total = 0;
  for (const [stat, weight] of Object.entries(scoring.weights)) {
    total += (stats[stat] ?? 0) * weight;
  }
  return round1(total);
}

/**
 * Per-game category z-score-ish value for 9-cat. Uses league-typical means/sd so a
 * single player can be valued without the full pool. Percentages are volume-weighted.
 */
const CAT_REF: Record<string, { mean: number; sd: number }> = {
  pts: { mean: 14, sd: 6.5 },
  reb: { mean: 5.5, sd: 2.8 },
  ast: { mean: 3.4, sd: 2.3 },
  stl: { mean: 0.9, sd: 0.4 },
  blk: { mean: 0.6, sd: 0.5 },
  fg3m: { mean: 1.6, sd: 1.0 },
  tov: { mean: 1.8, sd: 0.9 },
};

export function categoryValue(stats: StatLine): number {
  let z = 0;
  for (const [cat, ref] of Object.entries(CAT_REF)) {
    const v = stats[cat] ?? 0;
    z += cat === "tov" ? -(v - ref.mean) / ref.sd : (v - ref.mean) / ref.sd;
  }
  const fga = stats.fga ?? 0;
  const fta = stats.fta ?? 0;
  if (fga > 0) z += ((stats.fgm ?? 0) / fga - 0.47) * fga * 0.25;
  if (fta > 0) z += ((stats.ftm ?? 0) / fta - 0.78) * fta * 0.3;
  return round1(z);
}
