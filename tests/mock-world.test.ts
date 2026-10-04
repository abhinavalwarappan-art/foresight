import { describe, expect, it } from "vitest";
import { getMockWorld } from "@/lib/mock/world";

describe("mock world", () => {
  for (const sport of ["nfl", "nba"] as const) {
    it(`${sport}: is deterministic and well-formed`, () => {
      const w = getMockWorld(sport);
      expect(w.isMock).toBe(true);
      expect(w.players.length).toBeGreaterThan(150);
      expect(w.rosters).toHaveLength(10);
      const ids = new Set(w.players.map((p) => p.id));
      for (const r of w.rosters) for (const id of r.playerIds) expect(ids.has(id)).toBe(true);
      const rostered = w.rosters.flatMap((r) => r.playerIds);
      expect(new Set(rostered).size).toBe(rostered.length);
      expect(w.playerGames.length).toBeGreaterThan(500);
      expect(w.fantasyTeams.reduce((s, t) => s + t.wins + t.losses + t.ties, 0)).toBe((w.currentWeek - 1) * 10);
    });
  }
});
