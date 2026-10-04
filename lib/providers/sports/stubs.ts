import "server-only";
import { env } from "@/lib/config/env";
import { NotConfiguredError } from "../types";
import type { SportsProvider } from "./types";

/**
 * Optional premium providers. Interfaces are wired so they can be dropped in as
 * fallbacks; implementations are intentionally NOT written until we can verify
 * the exact endpoints and fields against an account's documentation
 * (SportsDataIO: https://sportsdata.io/developers/api-documentation/nfl,
 *  Sportradar: https://developer.sportradar.com). Never guess endpoints.
 */
function stub(name: string, key: string | undefined): SportsProvider {
  const fail = async (): Promise<never> => {
    throw new NotConfiguredError(name, key ? "adapter pending verification against account docs" : "no API key");
  };
  return {
    name, isConfigured: () => false, supports: () => true,
    getTeams: fail, getPlayers: fail, getGames: fail, getPlayerGames: fail, getInjuries: fail,
  };
}

export const sportsDataIo = stub("sportsdataio", env.SPORTSDATAIO_API_KEY);
export const sportradar = stub("sportradar", env.SPORTRADAR_API_KEY);
