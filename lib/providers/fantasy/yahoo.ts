import "server-only";
import { env } from "@/lib/config/env";
import { NotConfiguredError } from "../types";
import type { FantasyProvider } from "./types";

/**
 * Yahoo Fantasy (OAuth 2.0 authorization-code flow).
 * Docs: https://developer.yahoo.com/oauth2/guide/ and https://developer.yahoo.com/fantasysports/guide/
 *   authorize: https://api.login.yahoo.com/oauth2/request_auth
 *   token:     https://api.login.yahoo.com/oauth2/get_token
 *   data:      https://fantasysports.yahooapis.com/fantasy/v2/...
 * Credentials come only from env. Tokens are exchanged server-side and stored in an
 * httpOnly cookie (move to Supabase `provider_tokens` when auth is wired).
 * League/roster normalization is intentionally pending until verified against a
 * real league response — getLeague throws a clear NotConfigured error until then.
 */
const AUTH_URL = "https://api.login.yahoo.com/oauth2/request_auth";
const TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token";

export const yahooConfigured = () => Boolean(env.YAHOO_CLIENT_ID && env.YAHOO_CLIENT_SECRET);

export function yahooAuthUrl(redirectUri: string, state: string): string {
  if (!env.YAHOO_CLIENT_ID) throw new NotConfiguredError("yahoo", "YAHOO_CLIENT_ID");
  const q = new URLSearchParams({ client_id: env.YAHOO_CLIENT_ID, redirect_uri: redirectUri, response_type: "code", state, language: "en-us" });
  return `${AUTH_URL}?${q}`;
}

export interface YahooTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export async function yahooExchangeCode(code: string, redirectUri: string): Promise<YahooTokens> {
  if (!yahooConfigured()) throw new NotConfiguredError("yahoo", "client id/secret");
  const basic = Buffer.from(`${env.YAHOO_CLIENT_ID}:${env.YAHOO_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`[yahoo] token exchange failed: HTTP ${res.status}`);
  return (await res.json()) as YahooTokens;
}

export const yahoo: FantasyProvider = {
  name: "yahoo",
  isConfigured: yahooConfigured,
  async listLeagues() {
    throw new NotConfiguredError("yahoo", "league listing pending verification against a live Yahoo response");
  },
  async getLeague() {
    throw new NotConfiguredError("yahoo", "league normalization pending verification against a live Yahoo response");
  },
};
