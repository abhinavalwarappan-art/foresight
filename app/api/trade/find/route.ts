import type { NextRequest } from "next/server";
import { z } from "zod";
import { findTrades } from "@/lib/analytics/trade-finder";
import { loadContext, sportSchema, summarize, teamName } from "@/lib/services/core";
import { fail, guard, ok } from "@/lib/util/api";

const q = z.object({ sport: sportSchema, group: z.enum(["QB", "RB", "WR", "TE", "G", "F", "C"]).optional() });

export async function GET(req: NextRequest) {
  const blocked = guard(req, "trade-find", 15);
  if (blocked) return blocked;
  const parsed = q.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return fail("Invalid query.");
  const { ctx } = await loadContext(parsed.data.sport);
  const proposals = findTrades(ctx, ctx.userTeamId, { focusGroup: parsed.data.group, limit: 2 });
  return ok(proposals.map((p) => ({
    ...p,
    partnerName: teamName(ctx, p.partnerId),
    giveP: p.give.map((id) => summarize(ctx, id)),
    getP: p.get.map((id) => summarize(ctx, id)),
  })));
}
