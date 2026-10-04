import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PlayerLine } from "@/components/player/identity";
import { Delta, KindTag, Severity, SignalTag, StockBadge } from "@/components/ui/badges";
import { Card, CardHeader, CausalChain, InsightCard, MetricCard } from "@/components/ui/cards";
import type { Sport } from "@/lib/domain/types";
import { homeData } from "@/lib/services/views";

export const metadata = { title: "Command Center" };

export default async function Home({ params }: { params: Promise<{ sport: Sport }> }) {
  const { sport } = await params;
  const d = await homeData(sport);
  const wp = d.matchup ? Math.round(d.matchup.winProbability * 100) : null;
  const unit = sport === "nfl" ? "this week" : "across this week's games";

  return (
    <div className="space-y-6">
      {/* ── Hero: this week ───────────────────────── */}
      <section className="surface-raised relative overflow-hidden p-6 sm:p-8 animate-fade-up">
        <div className="hairline-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(70%_80%_at_80%_20%,black,transparent)]" />
        <div className="relative grid gap-8 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <div className="eyebrow mb-3 text-electric-soft">Welcome back · Week {d.week} · {d.teamName} ({d.record})</div>
            {d.matchup ? (
              <>
                <h1 className="text-[clamp(1.8rem,1rem+2.6vw,3rem)] font-semibold leading-[1.05] tracking-[-0.035em]">
                  You vs <span className="text-fg-muted">{d.matchup.opponentName}</span>
                </h1>
                <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-4">
                  <div>
                    <div className="eyebrow mb-1 flex items-center gap-2">Your projection <KindTag kind="projected" /></div>
                    <div className="num text-5xl font-semibold text-cyan glow-cyan">{d.matchup.projected}</div>
                  </div>
                  <div>
                    <div className="eyebrow mb-1">Opponent</div>
                    <div className="num text-5xl font-semibold text-fg-muted">{d.matchup.opponentProjected}</div>
                  </div>
                  <div>
                    <div className="eyebrow mb-1 flex items-center gap-2">Win probability <KindTag kind="calculated" title="Normal approximation over player projection variance" /></div>
                    <div className={`num text-5xl font-semibold ${wp! >= 50 ? "text-up" : "text-down"}`}>{wp}%</div>
                  </div>
                </div>
                <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-gradient-to-r from-electric to-cyan" style={{ width: `${wp}%` }} />
                </div>
                <p className="mt-2 text-xs text-fg-dim">Projected {unit}. ±{d.matchup.sd} pts one-sigma uncertainty. Model estimate, not a guarantee.</p>
              </>
            ) : <h1 className="text-3xl font-semibold">No matchup this week</h1>}
          </div>
          <div className="grid grid-cols-2 gap-3 self-start">
            <MetricCard label="Playoff odds" value={`${d.odds.playoffProb}%`} kind="calculated" accent="electric" sub="2,000 season simulations" />
            <MetricCard label="Title odds" value={`${d.odds.champProb}%`} kind="calculated" sub={`${d.odds.expectedWins} expected wins`} />
            <MetricCard label="Team score" value={d.scores.overall} sub="vs league · 50 = avg" />
            <MetricCard label="Lineup" value={d.scores.lineup} sub={`Depth ${d.scores.depth} · Upside ${d.scores.upside}`} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* ── Alerts & lineup ───────────────────────── */}
        <Card className="xl:col-span-2">
          <CardHeader eyebrow="Needs attention" title="Lineup & injury alerts" />
          <div className="grid gap-6 p-5 md:grid-cols-2">
            <div className="space-y-3">
              {d.lineupChanges.map((c) => (
                <div key={c.out.id} className="rounded-xl border border-down/20 bg-down/[0.04] p-3">
                  <div className="eyebrow mb-2 text-down/80">Recommended lineup change</div>
                  <PlayerLine p={c.out} sport={sport} right={<span className="font-mono text-[11px] text-down">BENCH</span>} />
                  {c.in && <PlayerLine p={c.in} sport={sport} right={<span className="font-mono text-[11px] text-up">START · {c.in.proj.weekly}</span>} />}
                </div>
              ))}
              {d.injuries.filter((p) => !d.lineupChanges.some((c) => c.out.id === p.id)).map((p) => (
                <PlayerLine key={p.id} p={p} sport={sport} right={<span className="text-right text-[11px] text-fg-muted">{p.avail.label}<br /><span className="num text-fg-dim">avail {p.avail.score}</span></span>} />
              ))}
              {!d.lineupChanges.length && !d.injuries.length && <p className="text-sm text-fg-muted">No injury issues on your roster. Optimal lineup is set.</p>}
            </div>
            {d.closeCall && (
              <div className="rounded-xl border border-line bg-white/[0.015] p-4">
                <div className="eyebrow mb-2 flex items-center gap-2">Closest start/sit call <KindTag kind="projected" /></div>
                <div className="space-y-1">
                  <PlayerLine p={d.closeCall.aP} sport={sport} compact right={<span className="num text-xs">{d.closeCall.aP.proj.floor}–<b className="text-fg">{d.closeCall.aP.proj.median}</b>–{d.closeCall.aP.proj.ceiling}</span>} />
                  <PlayerLine p={d.closeCall.bP} sport={sport} compact right={<span className="num text-xs">{d.closeCall.bP.proj.floor}–<b className="text-fg">{d.closeCall.bP.proj.median}</b>–{d.closeCall.bP.proj.ceiling}</span>} />
                </div>
                <p className="mt-3 text-[13px]">
                  Start <b className="text-cyan">{d.closeCall.pick === d.closeCall.a ? d.closeCall.aP.name : d.closeCall.bP.name}</b> —{" "}
                  <span className="text-fg-muted">{d.closeCall.explanation[1]}</span>
                </p>
              </div>
            )}
          </div>
        </Card>

        <InsightCard title={d.insight.title} body={<><p>{d.insight.body}</p><p className="mt-2 text-[11px] text-fg-dim">Generated only from the structured analysis on this page.</p></>} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {/* ── Weaknesses ───────────────────────── */}
        <Card>
          <CardHeader eyebrow="Roster intelligence" title="Biggest weaknesses" kind="calculated" action={<Link href={`/${sport}/roster`} className="text-xs text-electric-soft hover:text-electric">Full analysis →</Link>} />
          <ul className="divide-y divide-line px-5 pb-3 pt-2">
            {d.weaknesses.map((w, i) => (
              <li key={w.slot} className="py-3">
                <div className="flex items-center gap-3">
                  <span className="num w-4 text-xs text-fg-dim">{i + 1}</span>
                  <span className="font-medium">{w.slot}</span>
                  <Severity level={w.severity} />
                </div>
                <p className="ml-7 mt-1 text-xs text-fg-muted">{w.note}</p>
                {(w.severity === "CRITICAL" || w.severity === "MODERATE") && (
                  <div className="ml-7 mt-2 flex gap-2">
                    <Link href={`/${sport}/trade?tab=finder&group=${w.group}`} className="rounded-md border border-line px-2 py-1 text-[11px] hover:border-electric/40 hover:text-electric-soft">Find trade</Link>
                    <Link href={`/${sport}/waivers`} className="rounded-md border border-line px-2 py-1 text-[11px] hover:border-cyan/40 hover:text-cyan">Find waiver</Link>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {/* ── Waivers ───────────────────────── */}
        <Card>
          <CardHeader eyebrow="Best waivers for you" title="Pickups that fit your roster" action={<Link href={`/${sport}/waivers`} className="text-xs text-electric-soft hover:text-electric">All →</Link>} />
          <div className="space-y-3 p-5 pt-3">
            {d.waivers.map((w) => (
              <div key={w.playerId}>
                <PlayerLine p={w.player} sport={sport} right={<span className="text-right"><span className="num block text-lg font-semibold text-cyan">{w.rosterFit}</span><span className="eyebrow">fit</span></span>} />
                <p className="ml-11 text-xs text-fg-muted">{w.reasons[0]}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* ── Trades ───────────────────────── */}
        <Card>
          <CardHeader eyebrow="Trade finder" title="Trades that help both sides" action={<Link href={`/${sport}/trade?tab=finder`} className="text-xs text-electric-soft hover:text-electric">More →</Link>} />
          <div className="space-y-3 p-5 pt-3">
            {d.trades.map((t, i) => (
              <Link key={i} href={`/${sport}/trade?give=${t.give.map((p) => p.id).join(",")}&get=${t.get.map((p) => p.id).join(",")}`} className="focus-ring block rounded-xl border border-line p-3 transition-colors hover:border-line-strong">
                <div className="mb-2 flex items-center justify-between">
                  <span className="eyebrow">{t.style} · with {t.partner}</span>
                  <span className={`font-mono text-[10px] font-semibold ${t.verdict === "WIN-WIN" ? "text-up" : "text-fg-muted"}`}>{t.verdict}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[13px]">
                  <div>{t.give.map((p) => <div key={p.id} className="truncate text-fg-muted">{p.name}</div>)}</div>
                  <ArrowRight size={14} className="text-fg-dim" />
                  <div>{t.get.map((p) => <div key={p.id} className="truncate font-medium">{p.name}</div>)}</div>
                </div>
                <div className="mt-2 flex gap-4 text-[11px] text-fg-dim">
                  <span>You <Delta value={t.mine} suffix="%" /></span>
                  <span>Them <Delta value={t.theirs} suffix="%" /></span>
                  <span>Acceptance est. <b className="text-fg-muted">{t.acceptance}</b></span>
                </div>
              </Link>
            ))}
            {!d.trades.length && <p className="text-sm text-fg-muted">No mutually beneficial trades found right now.</p>}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader eyebrow="Value trending up" title="Rising" kind="calculated" />
          <div className="p-5 pt-2">
            {d.risers.map((p) => <PlayerLine key={p.id} p={p} sport={sport} right={<span className="flex flex-col items-end gap-1"><Delta value={p.valueTrend} decimals={0} /><span className="flex gap-1">{p.tags.slice(0, 1).map((t) => <SignalTag key={t} tag={t} />)}</span></span>} />)}
          </div>
        </Card>
        <Card>
          <CardHeader eyebrow="Value trending down" title="Falling" kind="calculated" />
          <div className="p-5 pt-2">
            {d.fallers.map((p) => <PlayerLine key={p.id} p={p} sport={sport} right={<span className="flex flex-col items-end gap-1"><Delta value={p.valueTrend} decimals={0} /><StockBadge label={p.label} /></span>} />)}
            {!d.fallers.length && <p className="text-sm text-fg-muted">No meaningful value declines this week.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader eyebrow="League activity" title="Recent transactions" kind="observed" />
          <ul className="space-y-3 p-5 pt-3 text-[13px]">
            {d.activity.map((a) => (
              <li key={a.id} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-white/25" />
                <span>
                  <b className="font-medium">{a.team}</b> <span className="text-fg-muted">added</span> {a.adds.join(", ")}
                  {a.drops.length > 0 && <> <span className="text-fg-muted">· dropped</span> {a.drops.join(", ")}</>}
                  <span className="block font-mono text-[10.5px] text-fg-dim">{a.type.replace("_", " ")} · {new Date(a.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="p-5">
        <div className="eyebrow mb-3">How this page is built</div>
        <CausalChain steps={["Observed box scores & usage", "Opportunity, availability & efficiency engines", "Projections (median · floor · ceiling)", "Optimal lineups for every team", "Matchup odds + 2,000-run season simulation", "Recommendations you can act on"]} />
      </Card>
    </div>
  );
}
