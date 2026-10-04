import type { NextRequest } from "next/server";
import { z } from "zod";
import { sleeper } from "@/lib/providers/fantasy/sleeper";
import { currentSeason } from "@/lib/providers/registry";
import { LEAGUE_COOKIE, sportSchema } from "@/lib/services/core";
import { fail, guard, ok, parseJson } from "@/lib/util/api";

const lookup = z.object({ action: z.literal("lookup"), sport: sportSchema, username: z.string().trim().regex(/^[A-Za-z0-9_.-]{2,40}$/) });
const connect = z.object({ action: z.literal("connect"), sport: sportSchema, leagueId: z.string().regex(/^[0-9]{5,30}$/), userId: z.string().regex(/^[0-9]{3,30}$/) });
const disconnect = z.object({ action: z.literal("disconnect"), sport: sportSchema });
const schema = z.discriminatedUnion("action", [lookup, connect, disconnect]);

/** Sleeper league connection. Stores only public ids in an httpOnly cookie. */
export async function POST(req: NextRequest) {
  const blocked = guard(req, "league-connect", 20);
  if (blocked) return blocked;
  const parsed = await parseJson(req, schema);
  if ("error" in parsed) return fail(parsed.error);
  const body = parsed.data;

  if (body.action === "lookup") {
    try {
      const u = await fetch(`https://api.sleeper.app/v1/user/${encodeURIComponent(body.username)}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      const user = (await u.json()) as { user_id?: string } | null;
      if (!user?.user_id) return fail("No Sleeper user with that username.", 404);
      const leagues = await sleeper.listLeagues(user.user_id, body.sport, currentSeason(body.sport));
      return ok({ userId: user.user_id, leagues: leagues.data });
    } catch {
      return fail("Couldn't reach Sleeper. Try again in a moment.", 502);
    }
  }

  const res = ok({ connected: body.action === "connect" });
  const cookie = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 180 };
  if (body.action === "connect") res.cookies.set(LEAGUE_COOKIE(body.sport), JSON.stringify({ provider: "sleeper", leagueId: body.leagueId, userId: body.userId }), cookie);
  else res.cookies.set(LEAGUE_COOKIE(body.sport), "", { ...cookie, maxAge: 0 });
  return res;
}
