import { describe, expect, it } from "vitest";
import { buildContext } from "@/lib/analytics/context";
import { allTraces, availabilityTrace, opportunityTrace, projectionTrace } from "@/lib/analytics/trace";
import { allValues } from "@/lib/analytics/value";
import { getMockWorld } from "@/lib/mock/world";

for (const sport of ["nfl", "nba"] as const) {
  const ctx = buildContext(getMockWorld(sport));
  describe(`${sport} analytics traces`, () => {
    it("every trace reproduces the engine output for every player", () => {
      const failures: string[] = [];
      for (const p of ctx.snap.players) {
        for (const t of allTraces(ctx, p.id)) if (t.reconciles === false) failures.push(`${p.id} ${t.metric}`);
      }
      expect(failures).toEqual([]);
    });
    it("projection trace final step equals the projection median", () => {
      for (const p of ctx.snap.players.slice(0, 60)) {
        const t = projectionTrace(ctx, p.id);
        const final = t.steps.find((s) => s.label.startsWith("Final median"))!;
        expect(final.value).toBe(allValues(ctx).get(p.id)!.week.projection.median);
      }
    });
    it("market step is NOT AVAILABLE (null) when no line exists, never invented", () => {
      const noMarket = ctx.snap.players.find((p) => allValues(ctx).get(p.id)!.week.components.marketGames === 0 && allValues(ctx).get(p.id)!.week.components.scheduledGames > 0);
      if (!noMarket) return; // every game priced in this world
      const step = projectionTrace(ctx, noMarket.id).steps.find((s) => s.label === "Market adjustment")!;
      expect(step.value).toBeNull();
    });
  });
}

describe("trace edge cases", () => {
  const nfl = buildContext(getMockWorld("nfl"));
  it("OUT player: availability trace shows ruled out and projection goes to zero via injury step", () => {
    const out = nfl.snap.players.find((p) => p.status === "out")!;
    expect(availabilityTrace(nfl, out.id).steps.find((s) => s.label.startsWith("Play probability"))!.value).toBe(0);
    expect(projectionTrace(nfl, out.id).steps.find((s) => s.label.startsWith("Final median"))!.value).toBe(0);
  });
  it("opportunity trace exposes the percentile inputs", () => {
    const p = nfl.snap.players.find((x) => x.position === "WR" && x.depthOrder === 1)!;
    const t = opportunityTrace(nfl, p.id);
    expect(t.steps.find((s) => s.label.includes("pool"))!.value).toBeGreaterThan(10);
    expect(t.inputs.some((i) => i.label === "Route participation")).toBe(true);
  });
  it("NBA has no injury-history-free gaps hidden: back-to-back is explicitly NOT AVAILABLE", () => {
    const nba = buildContext(getMockWorld("nba"));
    const t = availabilityTrace(nba, nba.snap.players[0].id);
    expect(t.inputs.find((i) => i.label.startsWith("Back-to-back"))!.value).toBeNull();
  });
});
