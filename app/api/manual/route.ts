import type { NextRequest } from "next/server";
import { z } from "zod";
import { balldontlie } from "@/lib/providers/sports/balldontlie";
import { invalidateSnapshot } from "@/lib/providers/registry";
import { LEAGUE_COOKIE, sportSchema } from "@/lib/services/core";
import { fail, guard, ok, parseJson } from "@/lib/util/api";

const slots = z.enum(["QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX", "WRRB_FLEX", "REC_FLEX", "K", "DST", "PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "BN", "IR"]);
const saveSchema = z.object({
  sport: sportSchema,
  playerIds: z.array(z.string().regex(/^(nfl|nba)-bdl-p\d+$/)).min(1).max(30),
  scoring: z.enum(["ppr", "half", "standard", "nba_points", "nba_9cat"]),
  slots: z.array(slots).min(1).max(30).optional(),
}).superRefine((v, ctx) => {
  if (v.playerIds.some((id) => !id.startsWith(`${v.sport}-`))) ctx.addIssue({ code: "custom", path: ["playerIds"], message: "Every player must match the selected sport." });
  if (v.sport === "nfl" && !["ppr", "half", "standard"].includes(v.scoring)) ctx.addIssue({ code: "custom", path: ["scoring"], message: "Choose an NFL scoring format." });
  if (v.sport === "nba" && !["nba_points", "nba_9cat"].includes(v.scoring)) ctx.addIssue({ code: "custom", path: ["scoring"], message: "Choose an NBA scoring format." });
});

export async function GET(req: NextRequest) {
  const blocked = guard(req, "manual-search", 60);
  if (blocked) return blocked;
  const url = new URL(req.url);
  const sport = sportSchema.safeParse(url.searchParams.get("sport"));
  const query = z.string().trim().min(2).max(60).safeParse(url.searchParams.get("q"));
  if (!sport.success || !query.success) return fail("Provide a valid sport and at least two search characters.");
  if (!balldontlie.isConfigured() || !balldontlie.searchPlayers) return fail("Real player search is not configured.", 503);
  try {
    const result = await balldontlie.searchPlayers(sport.data, query.data);
    return ok(result.data.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, position: p.position, teamId: p.teamId })));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Player search failed.", 502);
  }
}

export async function POST(req: NextRequest) {
  const blocked = guard(req, "manual-save", 30);
  if (blocked) return blocked;
  const parsed = await parseJson(req, saveSchema);
  if ("error" in parsed) return fail(parsed.error);
  const conn = { provider: "manual" as const, leagueId: "manual", ...parsed.data, syncedAt: new Date().toISOString() };
  invalidateSnapshot(parsed.data.sport, conn);
  const res = ok({ connected: true, playerCount: parsed.data.playerIds.length });
  res.cookies.set(LEAGUE_COOKIE(parsed.data.sport), JSON.stringify(conn), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
