import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildContext } from "@/lib/analytics/context";
import { cacheClear } from "@/lib/cache/store";
import type { Game, Team } from "@/lib/domain/types";
import { getMockWorld } from "@/lib/mock/world";
import { getGameIntelligence, getPlayerOutlook, getWeeklyTeamOutlook } from "@/lib/services/intelligence";
import { openMeteo } from "@/lib/providers/weather/openMeteo";

describe("high-level intelligence services", () => {
  it("composes a player outlook with explicit historical sample sizes", async () => {
    const ctx = buildContext(getMockWorld("nba"));
    const id = ctx.rosterOf(ctx.userTeamId)[0];
    const out = await getPlayerOutlook(ctx, id);
    expect(out?.player.id).toBe(id);
    expect(out?.historical.last3.sampleSize).toBeLessThanOrEqual(3);
    expect(out?.projection.provenance.kind).toBe("projected");
  });

  it("produces a weekly distribution and lineup from the same projection model", async () => {
    const ctx = buildContext(getMockWorld("nfl"));
    const out = await getWeeklyTeamOutlook(ctx);
    expect(out.recommendedLineup).toHaveLength(ctx.snap.league.slots.filter((s) => s !== "BN" && s !== "IR").length);
    expect(out.team.median).toBeGreaterThan(0);
    expect(out.team.floor).toBeLessThanOrEqual(out.team.median!);
    expect(out.team.ceiling).toBeGreaterThanOrEqual(out.team.median!);
  });

  it("builds NBA game context without requesting weather", async () => {
    const ctx = buildContext(getMockWorld("nba"));
    const game = ctx.snap.games.find((g) => g.week === ctx.snap.currentWeek)!;
    const out = await getGameIntelligence(ctx, game.id);
    expect(out?.weather).toBeNull();
    expect(out?.rest).toHaveProperty("homeBackToBack");
  });
});

describe("Open-Meteo weather contract", () => {
  beforeEach(() => cacheClear());

  it("skips weather for a domed stadium", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await openMeteo.getGameWeather(game("nfl-bdl-t1"), team("DET"));
    expect(result).toMatchObject({ relevant: false, roof: "dome", temperatureF: null });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("normalizes the closest hourly outdoor forecast", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ hourly: { time: [futureHour()], temperature_2m: [41], relative_humidity_2m: [72], precipitation_probability: [35], precipitation: [0.04], weather_code: [61], wind_speed_10m: [18], wind_gusts_10m: [27] } }), { status: 200 })));
    const result = await openMeteo.getGameWeather(game("nfl-bdl-t2"), team("BUF"));
    expect(result).toMatchObject({ relevant: true, roof: "outdoor", temperatureF: 41, windMph: 18, windGustMph: 27, precipitationProbability: 35, condition: "Rain" });
  });
});

const futureHour = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 13) + ":00";
const game = (homeTeamId: string): Game => ({ id: "g-weather", sport: "nfl", season: 2026, week: 5, date: `${futureHour()}:00Z`, homeTeamId, awayTeamId: "away", status: "scheduled", homeScore: null, awayScore: null });
const team = (abbr: string): Team => ({ id: "home", sport: "nfl", abbr, city: "Test", name: "Team", conference: "AFC", color: "#000" });
