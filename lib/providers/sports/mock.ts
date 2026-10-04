import type { Sport } from "@/lib/domain/types";
import { getMockWorld } from "@/lib/mock/world";
import type { SportsProvider } from "./types";

export const mockSports: SportsProvider = {
  name: "mock",
  isConfigured: () => true,
  supports: () => true,
  getTeams: async (s: Sport) => wrap(s, (w) => w.teams),
  getPlayers: async (s) => wrap(s, (w) => w.players),
  getGames: async (s) => wrap(s, (w) => w.games),
  getPlayerGames: async (s, _season, ids) => wrap(s, (w) => w.playerGames.filter((g) => !ids.length || ids.includes(g.gameId))),
  getInjuries: async (s) => wrap(s, (w) => w.injuries),
};

function wrap<T>(sport: Sport, f: (w: ReturnType<typeof getMockWorld>) => T) {
  const w = getMockWorld(sport);
  return { data: f(w), provenance: w.sources.sports };
}
