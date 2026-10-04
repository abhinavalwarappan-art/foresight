import { ArrowRight } from "lucide-react";
import { PlayerLine } from "@/components/player/identity";
import { Delta, KindTag, TrendBadge } from "@/components/ui/badges";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/cards";
import type { Sport } from "@/lib/domain/types";
import { waiversData } from "@/lib/services/views";
import { cn } from "@/lib/util/cn";

export const metadata = { title: "Waivers" };

export default async function Waivers({ params }: { params: Promise<{ sport: Sport }> }) {
  const { sport } = await params;
  const d = await waiversData(sport);
  return (
    <>
      <PageHeader eyebrow="Waiver engine" title="Best waivers for you"
        sub={<>Ranked by fit to <em>your</em> roster — lineup impact, positional need, rising opportunity and teammate injuries — with the drop that costs you least. <KindTag kind="calculated" /></>} />
      {!d.recs.length && <EmptyState title="No useful free agents" body="Nobody on waivers improves your optimal lineup right now. Check back after injury reports update." />}
      <div className="grid gap-4 lg:grid-cols-2">
        {d.recs.map((r, i) => (
          <Card key={r.playerId} raised={i === 0} className="p-5">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1"><PlayerLine p={r.player} sport={sport} /></div>
              <div className="text-right">
                <div className={cn("num text-3xl font-semibold", r.priority === "HIGH" ? "text-cyan glow-cyan" : "text-fg")}>{r.rosterFit}</div>
                <div className="eyebrow">roster fit</div>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5">
              {r.reasons.map((x) => <li key={x} className="flex gap-2 text-[13px] text-fg-muted"><span className="mt-2 size-1 shrink-0 rounded-full bg-cyan" />{x}</li>)}
            </ul>
            <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-line bg-white/[0.015] p-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="eyebrow">Drop</span>
                <span className="font-medium">{r.dropPlayer?.name ?? "—"}</span>
                <span className="text-fg-dim">{r.dropPlayer ? `${r.dropPlayer.position} · value ${r.dropPlayer.value}` : ""}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="num text-fg-dim">{r.weeklyBefore}</span><ArrowRight size={12} className="text-fg-dim" /><span className="num">{r.weeklyAfter}</span>
                <Delta value={r.weeklyAfter - r.weeklyBefore} />
                <span className="text-fg-dim">pts/wk</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3 text-[11px] text-fg-dim">
              <TrendBadge trend={r.player.opp.trend} pct={r.player.opp.trendPct} />
              <span>Priority <b className={r.priority === "HIGH" ? "text-cyan" : "text-fg-muted"}>{r.priority}</b></span>
              <span>This week <Delta value={r.thisWeekDelta} /></span>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-8">
        <CardHeader eyebrow="Generic ranking" title="Top available by rest-of-season points" kind="projected" />
        <div className="grid gap-x-8 px-5 pb-4 pt-2 md:grid-cols-2 xl:grid-cols-3">
          {d.generic.map((p) => <PlayerLine key={p.id} p={p} sport={sport} compact right={<span className="num text-xs text-fg-muted">{p.rosPoints} ROS</span>} />)}
        </div>
      </Card>
    </>
  );
}
