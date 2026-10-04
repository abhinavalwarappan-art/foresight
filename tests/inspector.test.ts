import { describe, expect, it } from "vitest";
import { freshness } from "@/lib/admin/freshness";
import { inspectPlayer, mappingIssues, toolArgTemplates } from "@/lib/admin/inspector";
import { mockMapping, normalizationChecks, syntheticRawFor } from "@/lib/admin/mock-provider-data";
import { runTool, toolResultMessage, TOOLS } from "@/lib/ai/tools";
import { buildContext } from "@/lib/analytics/context";
import { opportunity } from "@/lib/analytics/opportunity";
import { projectionTrace } from "@/lib/analytics/trace";
import type { DataSnapshot } from "@/lib/domain/snapshot";
import type { NflUsage } from "@/lib/domain/types";
import { getMockWorld } from "@/lib/mock/world";
import { sanitizeUrl } from "@/lib/providers/http";
import { redact } from "@/lib/providers/raw-store";
import type { SnapshotStatus } from "@/lib/providers/registry";
import { mapNbaStats, mapNflStats } from "@/lib/providers/sports/balldontlie";

const nflSnap = getMockWorld("nfl");
const nbaSnap = getMockWorld("nba");
const nfl = buildContext(nflSnap);
const status: SnapshotStatus = {
  mode: "mock", usingMock: true, fallbackReason: null, unmatchedPlayers: 0,
  providers: [
    { domain: "sports", name: "BALLDONTLIE", configured: false }, { domain: "sports", name: "SportsDataIO", configured: false },
    { domain: "sports", name: "Sportradar", configured: false }, { domain: "fantasy", name: "Sleeper", configured: true }, { domain: "fantasy", name: "Yahoo", configured: false },
  ],
};

describe("provider normalization: missing data is flagged, not zero-filled silently", () => {
  const team = { id: 1, abbreviation: "AAA", full_name: "A A", name: "A", location: "A", conference: "X", division: "Y" };
  const game = { id: 5, date: "2026-10-04T00:00:00Z", season: 2026, week: 5, status: "Final", home_team: team, visitor_team: { ...team, id: 2 }, home_team_score: 1, visitor_team_score: 0 };
  it("NFL base stats mark snap/route/air-yards/red-zone as unavailable, and missing targets too", () => {
    const g = mapNflStats({ player: { id: 9, first_name: "A", last_name: "B", position: "RB", team }, team, game, rushing_attempts: 12, receiving_targets: null }, "t");
    const u = g.usage as NflUsage;
    expect(u.unavailable).toEqual(expect.arrayContaining(["snapPct", "routePct", "airYards", "redZoneOpps", "targets"]));
    expect(u.carries).toBe(12);
  });
  it("NBA base stats flag tracking fields unavailable and usage as estimated", () => {
    const g = mapNbaStats({ min: null, fgm: 0, fga: 0, fg3m: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, turnover: 0, pts: 0, player: { id: 3, first_name: "A", last_name: "B", position: "C", team }, team, game }, 1, "t");
    expect(g.played).toBe(false); // null minutes = did not play, not "played 0"
    expect((g.usage as { unavailable?: string[] }).unavailable).toContain("potentialAssists");
    expect((g.usage as { estimated?: string[] }).estimated).toContain("usagePct");
  });
  it("synthetic provider payloads round-trip through the real adapter for every field (both sports)", () => {
    for (const snap of [nflSnap, nbaSnap]) {
      for (const p of snap.players.slice(0, 40)) {
        const bad = normalizationChecks(snap, p).checks.filter((c) => !c.match);
        expect(bad, `${p.id}`).toEqual([]);
      }
    }
  });
  it("synthetic raw records are always labeled synthetic", () => {
    const recs = syntheticRawFor(nflSnap, nflSnap.players[0]);
    expect(recs.length).toBeGreaterThan(1);
    expect(recs.every((r) => r.synthetic && r.cache === "mock")).toBe(true);
  });
});

describe("player ID mapping & ambiguous matches", () => {
  const { result, refs } = mockMapping(nflSnap);
  it("links every non-injected synthetic ref and never links the ambiguous one", () => {
    expect(result.map.size).toBe(nflSnap.players.length);
    expect(result.ambiguous).toHaveLength(1);
    expect(result.map.has(result.ambiguous[0].externalId)).toBe(false);
    expect(result.unmatched.map((u) => u.externalId)).toEqual(["9000002"]);
    expect(refs.length).toBe(nflSnap.players.length + 2);
  });
  it("same-name twins each keep their own identity", () => {
    const twins = nflSnap.players.filter((p) => p.firstName === result.ambiguous[0].firstName && p.lastName === result.ambiguous[0].lastName);
    expect(twins).toHaveLength(2);
    const linked = [...result.map.entries()].filter(([, id]) => twins.some((t) => t.id === id));
    expect(new Set(linked.map(([ext]) => ext)).size).toBe(2);
  });
  it("inspector surfaces the ambiguity with both candidates and leaves it unlinked", () => {
    const issues = mappingIssues(nfl).issues.filter((i) => i.kind === "AMBIGUOUS");
    expect(issues[0].candidates).toHaveLength(2);
    const twin = nflSnap.players.find((p) => p.firstName === issues[0].ref.firstName && p.lastName === issues[0].ref.lastName)!;
    const insp = inspectPlayer(nfl, status, twin.id)!;
    expect(insp.issues.some((i) => i.kind === "AMBIGUOUS")).toBe(true);
    expect(insp.identities.find((i) => i.provider === "yahoo")!.state).toBe("NOT CONFIGURED");
    expect(insp.identities.find((i) => i.provider === "balldontlie")!.state).toBe("SYNTHETIC");
  });
});

describe("missing data renders as NOT AVAILABLE, never invented", () => {
  // Strip snap data from one player's games the way the live BALLDONTLIE adapter would.
  const p = nflSnap.players.find((x) => x.position === "WR" && x.depthOrder === 1)!;
  const stripped: DataSnapshot = {
    ...nflSnap,
    playerGames: nflSnap.playerGames.map((g) => g.playerId === p.id ? { ...g, usage: { ...(g.usage as NflUsage), snapPct: 0, routePct: 0, unavailable: ["snapPct", "routePct"] } } : g),
  };
  const ctx = buildContext(stripped);
  it("opportunity signals show NOT AVAILABLE instead of 0%", () => {
    const sig = opportunity(ctx, p.id).signals;
    expect(sig.find((s) => s.label === "Snap share")!.value).toBe("NOT AVAILABLE");
    expect(sig.find((s) => s.label === "Route participation")!.value).toBe("NOT AVAILABLE");
    expect(sig.find((s) => s.label === "Targets")!.value).not.toBe("NOT AVAILABLE");
  });
  it("projection trace reports the gap explicitly", () => {
    const t = projectionTrace(ctx, p.id);
    expect(t.inputs.find((i) => i.label === "Projected snap share")!.value).toBeNull();
    expect(t.notes.join(" ")).toMatch(/did not provide: .*snapPct/);
  });
});

describe("provenance, freshness & secret hygiene", () => {
  const now = Date.parse("2026-10-04T12:00:00Z");
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();
  it("labels freshness against the data-class TTL", () => {
    expect(freshness({ retrievedAt: at(10_000) }, "injuries", now).label).toBe("LIVE");
    expect(freshness({ retrievedAt: at(2 * 60_000) }, "player_meta", now).label).toBe("2 MIN AGO");
    expect(freshness({ retrievedAt: at(4 * 3_600_000) }, "player_meta", now).label).toBe("4 HOURS OLD");
    expect(freshness({ retrievedAt: at(20 * 60_000) }, "injuries", now).label).toBe("STALE");
    expect(freshness({ retrievedAt: at(0), stale: true }, undefined, now).label).toBe("STALE");
    expect(freshness({ retrievedAt: at(0), cache: "mock" }, undefined, now).tone).toBe("mock");
    expect(freshness(null).label).toBe("NOT AVAILABLE");
  });
  it("sanitizes secret query params and redacts credential-like keys", () => {
    const u = sanitizeUrl("https://api.the-odds-api.com/v4/sports/x/odds/?apiKey=SECRET123&regions=us");
    expect(u).not.toContain("SECRET123");
    expect(u).toContain("regions=us");
    expect(JSON.stringify(redact({ a: 1, Authorization: "k", nested: { api_key: "z", access_token: "t" } }))).not.toMatch(/"k"|"z"|"t"/);
  });
  it("every provenance row of an inspected player has a source and freshness label", () => {
    const insp = inspectPlayer(nfl, status, nflSnap.players[2].id)!;
    expect(insp.provenance.length).toBeGreaterThanOrEqual(10);
    for (const r of insp.provenance) expect(r.freshness.label.length).toBeGreaterThan(0);
    expect(insp.provenance.find((r) => r.metric === "Opportunity Score")!.cache).toBe("computed");
  });
});

describe("AI tool outputs", () => {
  const pid = nflSnap.players.find((p) => nfl.ownerOf(p.id) === nfl.userTeamId)!.id;
  const templates = toolArgTemplates(nfl, pid);
  it("every registered tool has a template and runs cleanly with it", async () => {
    for (const name of TOOLS.keys()) {
      expect(templates[name], name).toBeDefined();
      const r = await runTool(nfl, name, templates[name]);
      expect(r.ok, `${name}: ${JSON.stringify(r.result).slice(0, 200)}`).toBe(true);
    }
  });
  it("the LLM receives the result wrapped as data", async () => {
    const r = await runTool(nfl, "getPlayerProjection", { playerId: pid });
    const msg = JSON.parse(toolResultMessage(r.result));
    expect(msg.data.kind).toBe("projected");
    expect(msg.data.median).toBeTypeOf("number");
  });
  it("rejects unregistered tools and invalid args without throwing", async () => {
    expect((await runTool(nfl, "fetchUrl", { url: "https://x" })).ok).toBe(false);
    const bad = await runTool(nfl, "simulateScenario", { playerId: pid, type: "explode" });
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad.result)).toMatch(/Invalid arguments/);
  });
  it("tool payloads never contain credential-looking fields", async () => {
    for (const name of ["getPlayerProfile", "getPlayerNews", "getLeague", "getMarketExpectations"]) {
      const r = await runTool(nfl, name, templates[name]);
      expect(toolResultMessage(r.result)).not.toMatch(/api[_-]?key|authorization|secret/i);
    }
  });
});

describe("tool payload numeric hygiene", () => {
  it("projection confidence is a clean 2-decimal number (no float noise sent to the LLM)", async () => {
    for (const p of nflSnap.players.slice(0, 50)) {
      const r = await runTool(nfl, "getPlayerProjection", { playerId: p.id });
      const c = (r.result as { confidence: number }).confidence;
      expect(String(c).replace(/^0\./, "").length).toBeLessThanOrEqual(2);
    }
  });
});
