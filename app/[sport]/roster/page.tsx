import Link from "next/link";
import { PlayerLine } from "@/components/player/identity";
import { KindTag, Severity } from "@/components/ui/badges";
import { Card, CardHeader, MetricCard, PageHeader } from "@/components/ui/cards";
import { Meter } from "@/components/ui/meters";
import type { Sport } from "@/lib/domain/types";
import { rosterData } from "@/lib/services/views";

export const metadata = { title: "Roster" };

export default async function Roster({ params }: { params: Promise<{ sport: Sport }> }) {
  const { sport } = await params;
  const d = await rosterData(sport);
  const s = d.analysis.scores;
  const scoreCards: [string, number, string][] = [
    ["Overall", s.overall, "Blended team grade"], ["Starting lineup", s.lineup, "ROS points / week"], ["Depth", s.depth, "Best bench per group"],
    ["Upside", s.upside, "Ceiling over median"], ["Floor", s.floor, "Floor ÷ median"], ["Availability", s.availability, "Starters' play probability"], ["ROS", s.ros, "Total rest-of-season value"],
  ];
  return (
    <>
      <PageHeader eyebrow="Roster intelligence" title={d.teamName}
        sub={<>Every grade is relative to your league (50 = league average). Lineup strength uses rest-of-season points per week, so one bad matchup doesn&apos;t distort it. <KindTag kind="calculated" /></>} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {scoreCards.map(([l, v, sub], i) => <MetricCard key={l} label={l} value={v} sub={sub} accent={i === 0 ? "electric" : undefined} />)}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader eyebrow={`Optimal lineup · ${d.analysis.weeklyThisWeek} projected this week`} kind="projected" title="Starters" />
          <div className="divide-y divide-line/70 px-5 pb-3 pt-2">
            {d.starters.map((st, i) => (
              <div key={i} className="grid grid-cols-[52px_1fr] items-center gap-2 py-1.5">
                <span className="font-mono text-[11px] text-fg-dim">{st.slot}</span>
                {st.player ? <PlayerLine p={st.player} sport={sport} right={<span className="num text-sm text-cyan">{st.value.toFixed(1)}</span>} /> : <span className="py-2 text-sm text-down">Empty — no eligible player</span>}
              </div>
            ))}
          </div>
          <div className="border-t border-line px-5 py-3">
            <div className="eyebrow mb-2">Bench</div>
            {d.bench.map((b) => <PlayerLine key={b.id} p={b} sport={sport} compact right={<span className="num text-xs text-fg-muted">{b.proj.weekly}</span>} />)}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader eyebrow="Weakness detection" title="What your team needs" kind="calculated" />
            <ul className="divide-y divide-line px-5 pb-2 pt-1">
              {d.analysis.weaknesses.map((w) => (
                <li key={w.slot} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="w-20 font-medium">{w.slot}</span>
                  <Severity level={w.severity} />
                  <span className="flex-1 text-xs text-fg-muted">{w.note}</span>
                  {(w.severity === "CRITICAL" || w.severity === "MODERATE") && (
                    <span className="flex gap-1.5">
                      <Link href={`/${sport}/trade?tab=finder&group=${w.group}`} className="rounded-md border border-line px-2 py-1 text-[11px] hover:border-electric/40 hover:text-electric-soft">Find trade</Link>
                      <Link href={`/${sport}/waivers`} className="rounded-md border border-line px-2 py-1 text-[11px] hover:border-cyan/40 hover:text-cyan">Find waiver</Link>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader eyebrow="Positional strength" title="Starters vs depth" kind="calculated" />
            <div className="space-y-4 px-5 pb-5 pt-3">
              {Object.keys(d.analysis.groupStrength).map((g) => (
                <div key={g} className="grid grid-cols-[36px_1fr] items-center gap-3">
                  <span className="font-mono text-xs text-fg-muted">{g}</span>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2"><Meter value={d.analysis.groupStrength[g]} className="flex-1" /><span className="num w-14 text-right text-xs">{d.analysis.groupStrength[g]} <span className="text-fg-dim">str</span></span></div>
                    <div className="flex items-center gap-2"><Meter value={d.analysis.groupDepthScore[g]} tone="violet" className="flex-1" /><span className="num w-14 text-right text-xs">{d.analysis.groupDepthScore[g]} <span className="text-fg-dim">dep</span></span></div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
