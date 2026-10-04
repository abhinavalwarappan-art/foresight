import type { Game, GameMarket, Sport, Team } from "@/lib/domain/types";
import type { Sourced } from "../types";

/** Market data is analytical context (implied team totals), never betting advice. */
export interface OddsProvider {
  readonly name: string;
  isConfigured(): boolean;
  getGameMarkets(sport: Sport, games: Game[], teams: Team[]): Promise<Sourced<GameMarket[]>>;
}
