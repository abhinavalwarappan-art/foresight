import { allHealth, providerStatus } from "@/lib/providers/registry";
import { env } from "@/lib/config/env";
import { ok } from "@/lib/util/api";

/** Provider health — booleans only, never key material. */
export async function GET() {
  return ok({ mode: env.DATA_MODE, providers: providerStatus(), health: allHealth().map(({ provider, state, consecutiveFailures, lastError }) => ({ provider, state, consecutiveFailures, lastError })) });
}
