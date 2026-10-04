import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { env } from "@/lib/config/env";

/**
 * Single choke point for internal tools. Today: open in development, token-cookie in
 * production. Swap the body for a Supabase role check when auth lands — callers stay the same.
 */
export async function adminAllowed(): Promise<boolean> {
  // Read the request first so every guarded route is dynamic — a gate must never be
  // evaluated once at build time and baked into a static page.
  const got = (await cookies()).get("fs_admin")?.value ?? "";
  if (process.env.NODE_ENV !== "production") return true;
  if (!env.ADMIN_TOKEN) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(env.ADMIN_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Pages: 404 rather than revealing that an admin surface exists. */
export async function requireAdmin(): Promise<void> {
  if (!(await adminAllowed())) notFound();
}
