import { getMockWorld } from "@/lib/mock/world";
import type { FantasyProvider } from "./types";

export const mockFantasy: FantasyProvider = {
  name: "mock",
  isConfigured: () => true,
  async listLeagues(_user, sport) {
    const w = getMockWorld(sport);
    return { data: [{ id: w.league.id, name: w.league.name, sport, season: w.season, teams: w.fantasyTeams.length }], provenance: w.sources.fantasy };
  },
  async getLeague(_id, { sport }) {
    const w = getMockWorld(sport);
    return {
      data: {
        league: w.league, teams: w.fantasyTeams, rosters: w.rosters, matchups: w.matchups, transactions: w.transactions,
        players: w.players.map((p) => ({ externalId: p.id, firstName: p.firstName, lastName: p.lastName, position: p.position, teamAbbr: w.teams.find((t) => t.id === p.teamId)?.abbr ?? null })),
        hints: {},
      },
      provenance: w.sources.fantasy,
    };
  },
};
