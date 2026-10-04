import { getMockWorld } from "@/lib/mock/world";
import type { ResearchProvider } from "./types";

export const mockResearch: ResearchProvider = {
  name: "mock-research",
  isConfigured: () => true,
  async research(player) {
    const w = getMockWorld(player.sport);
    return { data: w.research.filter((r) => r.playerId === player.id), provenance: w.sources.research };
  },
};
