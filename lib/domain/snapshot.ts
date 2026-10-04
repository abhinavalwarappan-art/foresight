import type {
  DepthChartEntry, FantasyLeague, FantasyMatchup, FantasyRoster, FantasyTeam, FantasyTransaction,
  Game, GameMarket, Injury, InjuryHistoryEntry, MarketProjection, Player, PlayerGame, Provenance,
  ResearchEvent, Sport, Team,
} from "./types";

/**
 * Everything the analytics layer needs for one sport + league, already normalized.
 * Built by lib/providers/registry from whichever providers are available.
 */
export interface DataSnapshot {
  sport: Sport;
  season: number;
  currentWeek: number;
  generatedAt: string;
  isMock: boolean;
  teams: Team[];
  players: Player[];
  games: Game[];
  playerGames: PlayerGame[];
  injuries: Injury[];
  injuryHistory: InjuryHistoryEntry[];
  depthCharts: DepthChartEntry[];
  markets: GameMarket[];
  props: MarketProjection[];
  /** Market/consensus positional rank (e.g. ADP/ECR). playerId → overall rank. */
  consensusRank: Record<string, number>;
  league: FantasyLeague;
  fantasyTeams: FantasyTeam[];
  rosters: FantasyRoster[];
  matchups: FantasyMatchup[];
  transactions: FantasyTransaction[];
  research: ResearchEvent[];
  sources: Record<"sports" | "fantasy" | "odds" | "research", Provenance>;
}
