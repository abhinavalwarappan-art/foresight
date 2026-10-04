import "server-only";
import { z } from "zod";

/**
 * Server-side environment. Never import from a client component — `server-only`
 * makes that a build error so provider keys can't leak into bundles.
 * Every key is optional: missing keys degrade to mock adapters, never crash.
 */
const schema = z.object({
  DATA_MODE: z.enum(["mock", "live"]).default("mock"),
  AI_PROVIDER: z.enum(["openai", "gemini", "mock", ""]).default(""),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  BALLDONTLIE_API_KEY: z.string().optional(),
  SPORTSDATAIO_API_KEY: z.string().optional(),
  SPORTRADAR_API_KEY: z.string().optional(),
  THE_ODDS_API_KEY: z.string().optional(),
  YAHOO_CLIENT_ID: z.string().optional(),
  YAHOO_CLIENT_SECRET: z.string().optional(),
  EXA_API_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  ADMIN_TOKEN: z.string().min(24).optional(),
});

const blankToUndefined = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]),
);

const parsed = schema.safeParse(blankToUndefined);
if (!parsed.success) {
  console.error("[env] invalid environment, falling back to mock mode", parsed.error.flatten().fieldErrors);
}

export const env = parsed.success ? parsed.data : schema.parse({});

export const has = (key: keyof typeof env): boolean => Boolean(env[key]);

export function resolvedAiProvider(): "openai" | "gemini" | "mock" {
  if (env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY) return "openai";
  if (env.AI_PROVIDER === "gemini" && env.GEMINI_API_KEY) return "gemini";
  return "mock";
}
