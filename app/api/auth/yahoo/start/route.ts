import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { yahooAuthUrl, yahooConfigured } from "@/lib/providers/fantasy/yahoo";

/** Begin Yahoo OAuth 2.0 (authorization code). State cookie guards against CSRF. */
export async function GET(req: NextRequest) {
  if (!yahooConfigured()) return NextResponse.redirect(new URL("/connect?error=yahoo_not_configured", req.url));
  const state = randomBytes(16).toString("hex");
  const redirectUri = new URL("/api/auth/yahoo/callback", req.url).toString();
  const res = NextResponse.redirect(yahooAuthUrl(redirectUri, state));
  res.cookies.set("fs_yahoo_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return res;
}
