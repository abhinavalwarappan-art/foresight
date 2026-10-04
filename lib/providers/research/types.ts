import type { Player, ResearchEvent, Team } from "@/lib/domain/types";
import type { Sourced } from "../types";

/**
 * Research is UNTRUSTED input. Providers return structured events with our own
 * neutral summary + source links. Raw page text is never forwarded to the LLM as
 * instructions, and never rendered as HTML.
 */
export interface ResearchProvider {
  readonly name: string;
  isConfigured(): boolean;
  research(player: Player, team: Team | undefined): Promise<Sourced<ResearchEvent[]>>;
}
