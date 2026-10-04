import type { NextRequest } from "next/server";
import { z } from "zod";
import { ask } from "@/lib/ai/agent";
import { loadContext, sportSchema } from "@/lib/services/core";
import { fail, guard, ok, parseJson } from "@/lib/util/api";

const schema = z.object({
  sport: sportSchema,
  question: z.string().trim().min(2).max(800),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(12).optional(),
});

export async function POST(req: NextRequest) {
  const blocked = guard(req, "ask", 15);
  if (blocked) return blocked;
  const parsed = await parseJson(req, schema);
  if ("error" in parsed) return fail(parsed.error);
  const { ctx } = await loadContext(parsed.data.sport);
  try {
    return ok(await ask(ctx, parsed.data.question, parsed.data.history));
  } catch (e) {
    console.error("[ask] failed", e);
    return fail("The analyst hit an error. Try rephrasing.", 500);
  }
}
