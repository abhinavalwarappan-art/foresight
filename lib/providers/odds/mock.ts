import { getMockWorld } from "@/lib/mock/world";
import type { OddsProvider } from "./types";

export const mockOdds: OddsProvider = {
  name: "mock-odds",
  isConfigured: () => true,
  async getGameMarkets(sport) {
    const w = getMockWorld(sport);
    return { data: w.markets, provenance: w.sources.odds };
  },
};
