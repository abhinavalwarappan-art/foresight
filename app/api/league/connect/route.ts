import type { NextRequest } from "next/server";
import { z } from "zod";
import { invalidateSleeperLeague, resolveSleeperUser, sleeper } from "@/lib/providers/fantasy/sleeper";
import { currentSeason, invalidateSnapshot } from "@/lib/providers/registry";
import { LEAGUE_COOKIE, sportSchema } from "@/lib/services/core";
import { fail, guard, ok, parseJson } from "@/lib/util/api";

const lookup = z.object({ action: z.literal("lookup"), sport: sportSchema, username: z.string().trim().regex(/^[A-Za-z0-9_.-]{2,40}$/) });
const connect = z.object({ action: z.literal("connect"), sport: sportSchema, leagueId: z.string().regex(/^[0-9]{5,30}$/), userId: z.string().regex(/^[0-9]{3,30}$/) });
const sync = z.object({ action: z.literal("sync"), sport: z.literal("nfl"), leagueId: z.string().regex(/^[0-9]{5,30}$/), userId: z.string().regex(/^[0-9]{3,30}$/) });
const disconnect = z.object({ action: z.literal("disconnect"), sport: sportSchema });
const schema = z.discriminatedUnion("action", [lookup, connect, sync, disconnect]);

/** Sleeper league connection. Stores only public ids in an httpOnly cookie. */
export async function POST(req: NextRequest) {
  const blocked = guard(req, "league-connect", 20);
  if (blocked) return blocked;
  const parsed = await parseJson(req, schema);
  if ("error" in parsed) return fail(parsed.error);
  const body = parsed.data;

  if (body.action === "lookup") {
    if (body.sport !== "nfl") return fail("Sleeper league import currently supports NFL.", 400);
    try {
      const user = await resolveSleeperUser(body.username);
      const leagues = await sleeper.listLeagues(user.userId, body.sport, currentSeason(body.sport));
      return ok({ userId: user.userId, displayName: user.displayName, leagues: leagues.data });
    } catch (e) {
      if ((e as Error).message === "USER_NOT_FOUND") return fail("No Sleeper user with that username.", 404);
      if ((e as Error).message === "MALFORMED_USER") return fail("Sleeper returned an unexpected user response.", 502);
      return fail("Couldn't reach Sleeper. Try again in a moment.", 502);
    }
  }

  if (body.action === "sync") {
    try {
      invalidateSleeperLeague(body.leagueId);
      invalidateSnapshot(body.sport, { provider: "sleeper", leagueId: body.leagueId, userId: body.userId });
      await sleeper.getLeague(body.leagueId, { userId: body.userId, sport: body.sport });
      const syncedAt = new Date().toISOString();
      const res = ok({ connected: true, syncedAt });
      res.cookies.set(LEAGUE_COOKIE(body.sport), JSON.stringify({ provider: "sleeper", leagueId: body.leagueId, userId: body.userId, syncedAt }), cookieOptions());
      return res;
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Sleeper sync failed.", 502);
    }
  }

  const res = ok({ connected: body.action === "connect" });
  const cookie = cookieOptions();
  if (body.action === "connect") {
    const syncedAt = new Date().toISOString();
    res.cookies.set(LEAGUE_COOKIE(body.sport), JSON.stringify({ provider: "sleeper", leagueId: body.leagueId, userId: body.userId, syncedAt }), cookie);
  } else res.cookies.set(LEAGUE_COOKIE(body.sport), "", { ...cookie, maxAge: 0 });
  return res;
}

const cookieOptions = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 180 });
