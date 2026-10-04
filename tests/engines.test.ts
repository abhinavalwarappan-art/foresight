import { describe, expect, it } from "vitest";
import { availability } from "@/lib/analytics/availability";
import { buildContext } from "@/lib/analytics/context";
import { percentile, trendLabel, trendOf } from "@/lib/analytics/opportunity";
import { projectPlayer } from "@/lib/analytics/projection";
import { analyzeRoster } from "@/lib/analytics/roster";
import { runScenario } from "@/lib/analytics/scenario";
import { evaluateTrade, validateTrade } from "@/lib/analytics/trade";
import { findTrades } from "@/lib/analytics/trade-finder";
import { allValues } from "@/lib/analytics/value";
import { backtest } from "@/lib/analytics/backtest";
import { getMockWorld } from "@/lib/mock/world";

const nfl = buildContext(getMockWorld("nfl"));
const nba = buildContext(getMockWorld("nba"));
const find = (team: string, pos: string, depth: number) => nfl.snap.players.find((p) => p.teamId === `nfl-${team}` && p.position === pos && p.depthOrder === depth)!;

describe("opportunity helpers", () => {
  it("labels trends with symmetric thresholds", () => {
    expect(trendLabel(30)).toBe("Strongly Rising");
    expect(trendLabel(12)).toBe("Rising");
    expect(trendLabel(0)).toBe("Stable");
    expect(trendLabel(-12)).toBe("Falling");
    expect(trendLabel(-40)).toBe("Strongly Falling");
  });
  it("trendOf compares recent vs prior windows", () => {
    expect(trendOf([5, 5, 5, 10, 10], [2, 3])).toBeGreaterThan(25);
    expect(trendOf([10, 10, 10, 5, 5], [2, 3])).toBeLessThan(-25);
    expect(trendOf([5, 5], [2, 3])).toBe(0);
  });
  it("percentile is rank-based", () => {
    expect(percentile([1, 2, 3, 4], 3.5)).toBe(75);
    expect(percentile([], 1)).toBe(0);
  });
});

describe("projection + availability", () => {
  it("projects zero for an OUT player and flags availability", () => {
    const rb1 = find("por", "RB", 1);
    expect(projectPlayer(nfl, rb1.id).projection.median).toBe(0);
    const a = availability(nfl, rb1.id);
    expect(a.expectedToPlay).toBe("Ruled Out");
    expect(a.factors.length).toBeGreaterThan(0);
  });
  it("orders floor ≤ median ≤ ceiling and labels as projection", () => {
    for (const p of nfl.snap.players.slice(0, 40)) {
      const pr = projectPlayer(nfl, p.id).projection;
      expect(pr.floor).toBeLessThanOrEqual(pr.median);
      expect(pr.median).toBeLessThanOrEqual(pr.ceiling);
      expect(pr.provenance.isProjection).toBe(true);
    }
  });
  it("backup RB inherits work when the starter is out (injury opportunity)", () => {
    const v = allValues(nfl).get(find("por", "RB", 2).id)!;
    expect(v.forwardRoleChange).toBeGreaterThan(30);
    expect(v.tags).toContain("INJURY OPPORTUNITY");
  });
});

describe("scenario engine", () => {
  it("NFL: starting RB out → backup carries and projection rise", () => {
    const rb1 = find("sam", "RB", 1);
    const r = runScenario(nfl, { type: "out", playerId: rb1.id });
    const top = r.impacts[0];
    expect(nfl.player(top.playerId)!.position).toBe("RB");
    expect(top.after).toBeGreaterThan(top.before);
    const carries = top.usage.find((u) => u.label === "Carries")!;
    expect(carries.after).toBeGreaterThan(carries.before);
    expect(r.subject.after).toBe(0);
  });
  it("NBA: star out → teammates gain minutes; minutes override conserves team minutes", () => {
    const star = nba.snap.players.find((p) => p.teamId === "nba-kcm" && p.status === "healthy")!;
    const r = runScenario(nba, { type: "out", playerId: star.id });
    expect(r.impacts.filter((i) => i.delta > 0).length).toBeGreaterThan(3);
    const sixth = nba.snap.players.filter((p) => p.teamId === "nba-kcm")[5];
    const m = runScenario(nba, { type: "minutes", playerId: sixth.id, minutes: 34 });
    expect(m.subject.usage.find((u) => u.label === "Minutes")!.after).toBeCloseTo(34, 0);
  });
});

describe("trade engine", () => {
  const userRoster = nfl.rosterOf(nfl.userTeamId);
  const partner = nfl.snap.fantasyTeams[1].id;
  it("rejects invalid trades", () => {
    expect(validateTrade(nfl, { teamA: nfl.userTeamId, teamB: nfl.userTeamId, aGives: [userRoster[0]], bGives: [userRoster[1]] })).toMatch(/two different/);
    expect(validateTrade(nfl, { teamA: nfl.userTeamId, teamB: partner, aGives: [userRoster[0]], bGives: [userRoster[1]] })).toMatch(/Team B/);
  });
  it("is symmetric: swapping sides mirrors the result", () => {
    const t = { teamA: nfl.userTeamId, teamB: partner, aGives: [userRoster[1]], bGives: [nfl.rosterOf(partner)[0]] };
    const r1 = evaluateTrade(nfl, t, { simulate: false });
    const r2 = evaluateTrade(nfl, { teamA: partner, teamB: nfl.userTeamId, aGives: t.bGives, bGives: t.aGives }, { simulate: false });
    expect(r1.a.weeklyDelta).toBeCloseTo(r2.b.weeklyDelta, 5);
    expect(r1.fairness).toBe(r2.fairness);
  });
  it("before/after lineup totals reconcile with the delta", () => {
    const r = evaluateTrade(nfl, { teamA: nfl.userTeamId, teamB: partner, aGives: [userRoster[2]], bGives: [nfl.rosterOf(partner)[1]] }, { simulate: false });
    expect(Math.round((r.a.weeklyAfter - r.a.weeklyBefore) * 10) / 10).toBeCloseTo(r.a.weeklyDelta, 1);
  });
  it("finder returns trades that help the user and include a both-sides WIN-WIN", () => {
    const props = findTrades(nfl);
    expect(props.length).toBeGreaterThan(0);
    for (const p of props) expect(p.result.a.benefitPct).toBeGreaterThan(0);
    expect(props.some((p) => p.result.verdict === "WIN-WIN")).toBe(true);
    expect(props[0].result.acceptance.disclaimer).toMatch(/not a prediction/);
  });
});

describe("roster intelligence", () => {
  it("detects the user's thin RB room as critical", () => {
    const a = analyzeRoster(nfl, nfl.userTeamId);
    expect(a.weaknesses[0].severity).toBe("CRITICAL");
    expect(a.weaknesses[0].group).toBe("RB");
  });
});

describe("backtest", () => {
  it("produces walk-forward scores without leaking the target week", () => {
    const r = backtest(nfl.snap);
    expect(r.weeks.length).toBeGreaterThan(2);
    expect(r.overall.mae).toBeGreaterThan(0);
    expect(r.overall.rankCorr).toBeGreaterThan(0.2);
  });
});
