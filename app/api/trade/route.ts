import type { NextRequest } from "next/server";
import { z } from "zod";
import { evaluateTrade, validateTrade } from "@/lib/analytics/trade";
import { loadContext, sportSchema, summarize } from "@/lib/services/core";
import { fail, guard, ok, parseJson } from "@/lib/util/api";

const id = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/);
const schema = z.object({
  sport: sportSchema,
  teamA: id,
  teamB: id,
  aGives: z.array(id).min(1).max(5),
  bGives: z.array(id).min(1).max(5),
});

export async function POST(req: NextRequest) {
  const blocked = guard(req, "trade", 40);
  if (blocked) return blocked;
  const parsed = await parseJson(req, schema);
  if ("error" in parsed) return fail(parsed.error);
  const { sport, ...input } = parsed.data;
  const { ctx } = await loadContext(sport);
  const invalid = validateTrade(ctx, input);
  if (invalid) return fail(invalid);
  const result = evaluateTrade(ctx, input);
  const players = Object.fromEntries([...input.aGives, ...input.bGives].map((p) => [p, summarize(ctx, p)]));
  return ok({ result, players });
}
