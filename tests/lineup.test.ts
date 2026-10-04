import { describe, expect, it } from "vitest";
import { optimalLineup } from "@/lib/analytics/lineup";

describe("optimal lineup", () => {
  it("fills single-position slots before FLEX and puts the best leftover in FLEX", () => {
    const r = optimalLineup(
      [
        { playerId: "qb", position: "QB", value: 20 },
        { playerId: "rb1", position: "RB", value: 18 }, { playerId: "rb2", position: "RB", value: 12 }, { playerId: "rb3", position: "RB", value: 11 },
        { playerId: "wr1", position: "WR", value: 17 }, { playerId: "wr2", position: "WR", value: 10 }, { playerId: "wr3", position: "WR", value: 9 },
        { playerId: "te", position: "TE", value: 8 },
      ],
      ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN"],
    );
    expect(r.starters.find((s) => s.slot === "FLEX")?.playerId).toBe("rb3");
    expect(r.bench).toEqual(["wr3"]);
    expect(r.total).toBe(96);
  });
  it("leaves a slot empty rather than playing an ineligible player", () => {
    const r = optimalLineup([{ playerId: "a", position: "PG", value: 30 }], ["C", "UTIL"]);
    expect(r.starters[0].playerId).toBeNull();
    expect(r.starters[1].playerId).toBe("a");
  });
  it("NBA combo slots: G takes guards, F takes forwards", () => {
    const r = optimalLineup(
      [{ playerId: "pg", position: "PG", value: 40 }, { playerId: "sg", position: "SG", value: 35 }, { playerId: "sf", position: "SF", value: 30 }],
      ["PG", "G", "F"],
    );
    expect(r.starters.map((s) => s.playerId)).toEqual(["pg", "sg", "sf"]);
  });
});
