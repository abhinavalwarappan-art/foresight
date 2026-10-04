import type { NextRequest } from "next/server";
import { z } from "zod";
import { runScenario } from "@/lib/analytics/scenario";
import { loadContext, sportSchema, summarize, teamName } from "@/lib/services/core";
import { fail, guard, ok, parseJson } from "@/lib/util/api";

const schema = z.object({
  sport: sportSchema,
  type: z.enum(["out", "starts", "minutes"]),
  playerId: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
  minutes: z.number().min(0).max(48).optional(),
});

export async function POST(req: NextRequest) {
  const blocked = guard(req, "scenario", 40);
  if (blocked) return blocked;
  const parsed = await parseJson(req, schema);
  if ("error" in parsed) return fail(parsed.error);
  const { sport, ...input } = parsed.data;
  if (input.type === "minutes" && sport !== "nba") return fail("Minutes scenarios are NBA-only.");
  const { ctx } = await loadContext(sport);
  if (!ctx.player(input.playerId)) return fail("Unknown player.", 404);
  const r = runScenario(ctx, input);
  const enrich = (i: typeof r.subject) => ({ ...i, player: summarize(ctx, i.playerId), ownerName: i.owner ? teamName(ctx, i.owner) : null });
  return ok({ ...r, subject: enrich(r.subject), impacts: r.impacts.map(enrich) });
}
