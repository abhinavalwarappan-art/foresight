import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAllowed } from "@/lib/admin/guard";
import { runTool, toolResultMessage, TOOLS } from "@/lib/ai/tools";
import { loadContext, sportSchema } from "@/lib/services/core";
import { fail, guard, ok, parseJson } from "@/lib/util/api";

const schema = z.object({
  sport: sportSchema,
  tool: z.string().min(1).max(64),
  args: z.unknown(),
});

/**
 * DEV/ADMIN: execute a registered AI tool exactly as the agent would and return the
 * literal string the LLM receives. Unregistered names are rejected; args are validated
 * by the tool's own Zod schema.
 */
export async function POST(req: NextRequest) {
  if (!(await adminAllowed())) return fail("Not found.", 404);
  const blocked = guard(req, "admin-tools", 60);
  if (blocked) return blocked;
  const parsed = await parseJson(req, schema);
  if ("error" in parsed) return fail(parsed.error);
  const { sport, tool, args } = parsed.data;
  if (!TOOLS.has(tool)) return fail(`Tool "${tool}" is not registered.`, 404);
  const { ctx } = await loadContext(sport);
  const started = performance.now();
  const r = await runTool(ctx, tool, args);
  const llmMessage = toolResultMessage(r.result);
  return ok({ tool, ok: r.ok, durationMs: Math.round(performance.now() - started), bytes: llmMessage.length, llmMessage, result: r.result });
}
