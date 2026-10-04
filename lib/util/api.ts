import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";

/** Consistent envelope for every API route. */
export type ApiResponse<T> = { success: true; data: T; error: null } | { success: false; data: null; error: string };

export const ok = <T>(data: T, init?: ResponseInit) => NextResponse.json<ApiResponse<T>>({ success: true, data, error: null }, init);
export const fail = (error: string, status = 400) => NextResponse.json<ApiResponse<never>>({ success: false, data: null, error }, { status });

const buckets = new Map<string, { count: number; reset: number }>();

/** Fixed-window per-IP limiter. Swap for Upstash/Vercel KV in production. */
export function rateLimit(req: NextRequest, key: string, limit = 30, windowMs = 60_000): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const k = `${key}:${ip}`;
  const now = Date.now();
  const b = buckets.get(k);
  if (!b || b.reset < now) {
    buckets.set(k, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= limit;
}

/** Reject cross-site POSTs (CSRF-lite for cookie-bearing routes). */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export async function parseJson<S extends z.ZodTypeAny>(req: NextRequest, schema: S): Promise<{ data: z.infer<S> } | { error: string }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: "Body must be valid JSON." };
  }
  const r = schema.safeParse(body);
  if (!r.success) return { error: r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") };
  return { data: r.data };
}

export function guard(req: NextRequest, key: string, limit?: number) {
  if (!sameOrigin(req)) return fail("Cross-origin request rejected.", 403);
  if (!rateLimit(req, key, limit)) return fail("Too many requests — slow down a little.", 429);
  return null;
}
