import { ScenarioEngine, type ScenarioPreset } from "@/components/scenario/ScenarioEngine";
import { PageHeader } from "@/components/ui/cards";
import { playerName } from "@/lib/analytics/context";
import { allValues } from "@/lib/analytics/value";
import type { Sport } from "@/lib/domain/types";
import { ctxFor } from "@/lib/services/views";

export const metadata = { title: "Scenario Engine" };

export default async function Scenarios({ params }: { params: Promise<{ sport: Sport }> }) {
  const { sport } = await params;
  const { ctx } = await ctxFor(sport);
  const vals = allValues(ctx);
  const ranked = ctx.snap.players.filter((p) => vals.get(p.id)!.rosPoints > 0).sort((a, b) => vals.get(b.id)!.value - vals.get(a.id)!.value);
  const players = ranked.map((p) => ({ id: p.id, name: playerName(p), pos: p.position, team: ctx.team(p.teamId)?.abbr ?? "" }));
  const presets: ScenarioPreset[] = [];
  const healthyTop = (pos: string[]) => ranked.find((p) => pos.includes(p.position) && p.status === "healthy" && p.depthOrder === 1);
  if (sport === "nfl") {
    const rb = healthyTop(["RB"]); const wr = healthyTop(["WR"]); const qb = healthyTop(["QB"]);
    const backup = ranked.find((p) => p.position === "RB" && p.depthOrder === 2 && p.teamId === rb?.teamId);
    if (rb) presets.push({ label: `What if ${playerName(rb)} (RB, ${ctx.team(rb.teamId)?.abbr}) misses Week ${ctx.snap.currentWeek}?`, type: "out", playerId: rb.id });
    if (wr) presets.push({ label: `What if ${playerName(wr)} is ruled out?`, type: "out", playerId: wr.id });
    if (qb) presets.push({ label: `What if ${playerName(qb)} sits and the backup QB starts?`, type: "out", playerId: qb.id });
    if (backup) presets.push({ label: `What if ${playerName(backup)} takes over as the starter?`, type: "starts", playerId: backup.id });
  } else {
    const pg = healthyTop(["PG"]); const c = healthyTop(["C"]);
    const sixth = ranked.find((p) => p.depthOrder === 2 && vals.get(p.id)!.opp.trend.includes("Rising"));
    if (pg) presets.push({ label: `Star PG ${playerName(pg)} OUT tonight`, type: "out", playerId: pg.id });
    if (c) presets.push({ label: `What if ${playerName(c)} rests?`, type: "out", playerId: c.id });
    if (sixth) presets.push({ label: `What if ${playerName(sixth)} gets 32 minutes?`, type: "minutes", playerId: sixth.id, minutes: 32 });
    if (sixth) presets.push({ label: `What if ${playerName(sixth)} moves into the starting lineup?`, type: "starts", playerId: sixth.id });
  }
  return (
    <>
      <PageHeader eyebrow="Scenario Engine" title="What happens if…?"
        sub={sport === "nfl" ? "Remove or promote any player. Targets, carries and red-zone work are redistributed by role and depth chart; every affected projection is recalculated." : "Remove a player, promote a bench piece, or set minutes. Minutes and usage flow to teammates by position group; projections and ranks update."} />
      <ScenarioEngine sport={sport} players={players} presets={presets} />
    </>
  );
}
