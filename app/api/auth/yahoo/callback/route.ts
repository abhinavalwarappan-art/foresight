import { NextResponse, type NextRequest } from "next/server";
import { yahooExchangeCode } from "@/lib/providers/fantasy/yahoo";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get("fs_yahoo_state")?.value;
  if (!code || !state || state !== expected) return NextResponse.redirect(new URL("/connect?error=yahoo_state", req.url));
  try {
    const tokens = await yahooExchangeCode(code, new URL("/api/auth/yahoo/callback", req.url).toString());
    const res = NextResponse.redirect(new URL("/connect?yahoo=connected", req.url));
    // Short-lived access token only; refresh tokens belong in Supabase (encrypted) once auth lands.
    res.cookies.set("fs_yahoo_access", tokens.access_token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: Math.min(tokens.expires_in, 3600) });
    res.cookies.delete("fs_yahoo_state");
    return res;
  } catch {
    return NextResponse.redirect(new URL("/connect?error=yahoo_exchange", req.url));
  }
}
