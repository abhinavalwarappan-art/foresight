import { AskPanel } from "@/components/ask/AskPanel";
import { playerName } from "@/lib/analytics/context";
import { allValues } from "@/lib/analytics/value";
import { resolvedAiProvider } from "@/lib/config/env";
import type { Sport } from "@/lib/domain/types";
import { ctxFor } from "@/lib/services/views";

export const metadata = { title: "Ask" };

export default async function Ask({ params }: { params: Promise<{ sport: Sport }> }) {
  const { sport } = await params;
  const { ctx } = await ctxFor(sport);
  const vals = allValues(ctx);
  const mine = ctx.rosterOf(ctx.userTeamId).map((id) => vals.get(id)!).sort((a, b) => b.value - a.value);
  const injured = ctx.snap.players.filter((p) => p.status === "out" && vals.get(p.id)!.rosPoints > 50)[0];
  const theirTop = ctx.rosterOf(ctx.snap.fantasyTeams[1].id).map((id) => vals.get(id)!).sort((a, b) => b.value - a.value)[0];
  const pos = sport === "nfl" ? "RB" : "guard";
  const suggestions = [
    `Should I trade ${playerName(ctx.player(mine[1].playerId))} for ${playerName(ctx.player(theirTop.playerId))}?`,
    injured ? `Who benefits if ${playerName(injured)} sits?` : "Who benefits from the latest injury?",
    "Find me a trade my opponent would actually accept.",
    `Which ${pos} is about to break out?`,
    `Start ${playerName(ctx.player(mine[mine.length - 3].playerId))} or ${playerName(ctx.player(mine[mine.length - 2].playerId))}?`,
    "What's my team's biggest weakness?",
  ];
  const provider = resolvedAiProvider();
  return <AskPanel sport={sport} suggestions={suggestions} providerName={provider === "mock" ? "built-in deterministic analyst (set AI_PROVIDER + key for OpenAI/Gemini)" : provider} />;
}
