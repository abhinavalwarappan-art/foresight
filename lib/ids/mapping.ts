import type { Player } from "@/lib/domain/types";

/**
 * Cross-provider player identity. Providers never share IDs, so we match on a
 * normalized (name, position, team) key, falling back to (name, position) when a
 * player changed teams. Ambiguous fallbacks are rejected rather than guessed.
 */
export interface ExternalPlayerRef {
  externalId: string;
  firstName: string;
  lastName: string;
  position: string | null;
  teamAbbr: string | null;
}

const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b/g;
const TEAM_ALIASES: Record<string, string> = { WSH: "WAS", JAC: "JAX", LA: "LAR", GSW: "GS", NOP: "NO", NYK: "NY", SAS: "SA", PHX: "PHO" };

export function normalizeName(first: string, last: string): string {
  return `${first} ${last}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.'’-]/g, "").replace(SUFFIX, "").replace(/\s+/g, " ").trim();
}
export const normalizeTeam = (abbr: string | null) => (abbr ? TEAM_ALIASES[abbr.toUpperCase()] ?? abbr.toUpperCase() : "");
const normPos = (p: string | null) => (p === "DEF" ? "DST" : p ?? "");

export interface MatchResult {
  map: Map<string, string>; // externalId → internal player id
  unmatched: ExternalPlayerRef[];
  ambiguous: ExternalPlayerRef[];
}

export function matchPlayers(external: ExternalPlayerRef[], internal: Player[], teamAbbrOf: (teamId: string) => string): MatchResult {
  const strict = new Map<string, string[]>();
  const loose = new Map<string, string[]>();
  for (const p of internal) {
    const name = normalizeName(p.firstName, p.lastName);
    const s = `${name}|${p.position}|${normalizeTeam(teamAbbrOf(p.teamId))}`;
    const l = `${name}|${p.position}`;
    strict.set(s, [...(strict.get(s) ?? []), p.id]);
    loose.set(l, [...(loose.get(l) ?? []), p.id]);
  }
  const map = new Map<string, string>();
  const unmatched: ExternalPlayerRef[] = [];
  const ambiguous: ExternalPlayerRef[] = [];
  for (const e of external) {
    const name = normalizeName(e.firstName, e.lastName);
    const s = strict.get(`${name}|${normPos(e.position)}|${normalizeTeam(e.teamAbbr)}`);
    if (s?.length === 1) { map.set(e.externalId, s[0]); continue; }
    const l = loose.get(`${name}|${normPos(e.position)}`);
    if (l?.length === 1) map.set(e.externalId, l[0]);
    else if (l && l.length > 1) ambiguous.push(e);
    else unmatched.push(e);
  }
  return { map, unmatched, ambiguous };
}
