import { describe, expect, it } from "vitest";
import { categoryValue, fantasyPoints, SCORING_PRESETS } from "@/lib/scoring";

describe("fantasy scoring", () => {
  const wrLine = { rec: 8, rec_yds: 112, rec_td: 1, targets: 11 };
  it("scores NFL PPR / half / standard", () => {
    expect(fantasyPoints(wrLine, SCORING_PRESETS.ppr)).toBe(25.2);
    expect(fantasyPoints(wrLine, SCORING_PRESETS.half)).toBe(21.2);
    expect(fantasyPoints(wrLine, SCORING_PRESETS.standard)).toBe(17.2);
  });
  it("scores a QB line including interceptions", () => {
    expect(fantasyPoints({ pass_yds: 300, pass_td: 2, pass_int: 1, rush_yds: 20 }, SCORING_PRESETS.ppr)).toBe(20);
  });
  it("scores NBA points leagues and ignores unknown stats", () => {
    expect(fantasyPoints({ pts: 25, reb: 10, ast: 5, stl: 2, blk: 1, tov: 3, fg3m: 2, plus_minus: 9 }, SCORING_PRESETS.nba_points)).toBe(51.5);
  });
  it("values 9-cat lines relative to league norms (turnovers hurt)", () => {
    const base = { pts: 20, reb: 6, ast: 4, stl: 1, blk: 0.6, fg3m: 2, tov: 2, fgm: 7, fga: 15, ftm: 4, fta: 5 };
    expect(categoryValue(base)).toBeGreaterThan(0);
    expect(categoryValue({ ...base, tov: 5 })).toBeLessThan(categoryValue(base));
  });
});
