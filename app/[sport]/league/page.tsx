import { KindTag } from "@/components/ui/badges";
import { Card, CardHeader, PageHeader } from "@/components/ui/cards";
import type { Sport } from "@/lib/domain/types";
import { leagueData } from "@/lib/services/views";
import { cn } from "@/lib/util/cn";

export const metadata = { title: "League" };

function Bar({ v, tone }: { v: number; tone: string }) {
  return <div className="h-1 w-16 rounded-full bg-white/[0.06]"><div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.min(100, v)}%` }} /></div>;
}

export default async function League({ params }: { params: Promise<{ sport: Sport }> }) {
  const { sport } = await params;
  const d = await leagueData(sport);
  return (
    <>
      <PageHeader eyebrow={`League intelligence · Week ${d.week} of ${d.totalWeeks}`} title="Power rankings"
        sub={<>Power blends lineup strength, rest-of-season value and simulated playoff odds. Probabilities come from 2,000 Monte Carlo season simulations <KindTag kind="calculated" /> — estimates, not certainties.</>} />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-[13px]">
          <thead>
            <tr className="eyebrow border-b border-line [&>th]:px-4 [&>th]:py-3 [&>th]:text-left [&>th]:font-normal">
              <th>#</th><th>Team</th><th>Power</th><th>Record</th><th>Expected (all-play)</th><th>ROS pts/wk</th><th>Depth</th><th>Upside</th><th>Risk</th><th>Playoffs</th><th>Title</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.teamId} className={cn("border-b border-line/60 [&>td]:px-4 [&>td]:py-3", r.isUser && "bg-electric/[0.05]")}>
                <td className="num text-fg-dim">{r.rank}</td>
                <td><div className="font-medium">{r.name} {r.isUser && <span className="ml-1 rounded bg-electric/15 px-1.5 py-px font-mono text-[9.5px] text-electric-soft">YOU</span>}</div><div className="text-[11px] text-fg-dim">{r.manager}</div></td>
                <td><span className="num text-lg font-semibold">{r.power}</span></td>
                <td className="num">{r.record}</td>
                <td className="num text-fg-muted">{r.expectedRecord}</td>
                <td className="num">{r.rosStrength}</td>
                <td><div className="flex items-center gap-2"><Bar v={r.depth} tone="bg-violet" /><span className="num text-xs">{r.depth}</span></div></td>
                <td><div className="flex items-center gap-2"><Bar v={r.upside} tone="bg-cyan" /><span className="num text-xs">{r.upside}</span></div></td>
                <td><div className="flex items-center gap-2"><Bar v={r.risk * 3} tone="bg-down" /><span className="num text-xs">{r.risk}</span></div></td>
                <td className="num font-medium text-electric-soft">{r.playoffProb}%</td>
                <td className="num">{r.champProb}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="mt-6">
        <CardHeader eyebrow="Standings" kind="observed" title="Actual records" />
        <ol className="grid gap-x-8 px-5 pb-4 pt-2 md:grid-cols-2">
          {d.standings.map((t, i) => (
            <li key={t.id} className={cn("flex items-center gap-3 border-b border-line/60 py-2 text-[13px]", i === d.playoffTeams - 1 && "border-b-electric/40")}>
              <span className="num w-5 text-fg-dim">{i + 1}</span><span className="flex-1">{t.name}</span>
              <span className="num">{t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ""}</span><span className="num w-20 text-right text-fg-muted">{t.pointsFor} PF</span>
            </li>
          ))}
        </ol>
        <p className="px-5 pb-4 text-[11px] text-fg-dim">Top {d.playoffTeams} make the playoffs (line).</p>
      </Card>
    </>
  );
}
