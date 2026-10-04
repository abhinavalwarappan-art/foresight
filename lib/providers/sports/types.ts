import type { Game, Injury, Player, PlayerGame, Sport, Team } from "@/lib/domain/types";
import type { Sourced } from "../types";

/** Normalized sports-data contract. Adapters map provider payloads INTO these types. */
export interface SportsProvider {
  readonly name: string;
  isConfigured(): boolean;
  supports(sport: Sport): boolean;
  getTeams(sport: Sport): Promise<Sourced<Team[]>>;
  getPlayers(sport: Sport): Promise<Sourced<Player[]>>;
  /** Fast provider-backed search when loading the entire player catalog is unnecessary. */
  searchPlayers?(sport: Sport, query: string): Promise<Sourced<Player[]>>;
  getPlayersByIds?(sport: Sport, ids: string[]): Promise<Sourced<Player[]>>;
  getGames(sport: Sport, season: number): Promise<Sourced<Game[]>>;
  /** Box-score lines for completed games. */
  getPlayerGames(sport: Sport, season: number, gameIds: string[]): Promise<Sourced<PlayerGame[]>>;
  getInjuries(sport: Sport): Promise<Sourced<Injury[]>>;
}
