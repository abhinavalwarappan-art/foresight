import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductionChart, UsageChart } from "@/components/charts/PlayerCharts";
import { PlayerAvatar, TeamBadge } from "@/components/player/identity";
import { Delta, KindTag, SignalTag, StatusPill, StockBadge, TrendBadge } from "@/components/ui/badges";
import { Card, CardHeader, EmptyState } from "@/components/ui/cards";
import { Meter, RangeBar, ScoreRing } from "@/components/ui/meters";
import type { NbaUsage, NflUsage, Sport } from "@/lib/domain/types";
import { playerDetail } from "@/lib/services/views";
import { cn } from "@/lib/util/cn";

const TABS = ["overview", "game-log", "advanced", "fantasy", "injuries", "news"] as const;

export default async function PlayerPage({ params, searchParams }: { params: Promise<{ sport: Sport; id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { sport, id } = await params;
  const tab = (TABS as readonly string[]).includes((await searchParams).tab ?? "") ? (await searchParams).tab! : "overview";
  const d = await playerDetail(sport, id);
  if (!d) notFound();
  const p = d.summary;
  const v = d.value;
  const a = d.availability;
  const series = v.opp.history;
  const nfl = sport === "nfl";
  const primaryLabel = nfl ? (p.position === "RB" ? "Carries" : p.position === "QB" ? "Pass attempts" : "Targets") : "Minutes";
  const secondaryLabel = nfl ? "Snap %" : "Usage %";
  const maxScale = Math.max(p.proj.ceiling * 1.15, 10);

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────── */}
      <section className="surface-raised relative overflow-hidden p-6 sm:p-8 animate-fade-up">
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full blur-3xl" style={{ background: `${p.teamColor}22` }} />
        <div className="relative flex flex-wrap items-start gap-6">
          <PlayerAvatar first={p.firstName} last={p.lastName} color={p.teamColor} size={84} />
          <div className="min-w-0 flex-1">
            <div className="eyebrow mb-2 flex flex-wrap items-center gap-2"><span className="text-fg-muted">{p.position}</span><TeamBadge abbr={p.teamAbbr} color={p.teamColor} /><span>{d.teamName}</span></div>
            <h1 className="text-[clamp(2rem,1.2rem+2.6vw,3.4rem)] font-semibold leading-none tracking-[-0.04em]">{p.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusPill status={p.status} long />
              <span className="text-sm text-fg-muted">{p.owner ? (p.ownerIsUser ? "On your team" : `Rostered by ${p.owner}`) : <span className="text-cyan">Free agent</span>}</span>
              {p.tags.map((t) => <SignalTag key={t} tag={t} />)}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="eyebrow mb-1 flex items-center justify-end gap-2">Fantasy value <KindTag kind="calculated" /></div>
              <div className="flex items-baseline justify-end gap-2"><span className="num text-6xl font-semibold glow-electric">{p.value}</span><Delta value={p.valueTrend} decimals={0} className="text-lg" /></div>
              <div className="mt-2 flex justify-end"><StockBadge label={p.label} size="lg" /></div>
            </div>
          </div>
        </div>
        <div className="relative mt-6 grid gap-3 border-t border-line pt-5 text-sm sm:grid-cols-4">
          <div><div className="eyebrow mb-1 flex items-center gap-2">Market rank <KindTag kind="market" /></div><span className="num text-xl">{p.position}{p.marketPosRank}</span></div>
          <div><div className="eyebrow mb-1">Model rank</div><span className="num text-xl">{p.position}{p.modelPosRank}</span></div>
          <div><div className="eyebrow mb-1">Difference</div><Delta value={p.rankDelta} decimals={0} className="text-xl" /></div>
          <div><div className="eyebrow mb-1">ROS points</div><span className="num text-xl">{p.rosPoints}</span></div>
        </div>
      </section>

      <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Player sections">
        {TABS.map((t) => (
          <Link key={t} href={`?tab=${t}`} scroll={false} className={cn("focus-ring -mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] capitalize transition-colors", tab === t ? "border-electric text-fg" : "border-transparent text-fg-dim hover:text-fg-muted")}>{t.replace("-", " ")}</Link>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader eyebrow={`Week ${v.week.projection.week} projection`} kind="projected" title={nfl ? "Fantasy points" : `Per game${p.proj.gamesInWeek > 1 ? ` · ${p.proj.gamesInWeek} games this week` : ""}`} />
              <div className="px-5 pb-6 pt-3">
                <div className="flex items-baseline gap-3">
                  <span className="num text-5xl font-semibold text-cyan glow-cyan">{p.proj.median}</span>
                  <span className="text-xs text-fg-muted">median{p.proj.gamesInWeek > 1 && <> · <span className="num">{p.proj.weekly}</span> weekly</>}</span>
                </div>
                <div className="mt-6"><RangeBar floor={p.proj.floor} median={p.proj.median} ceiling={p.proj.ceiling} max={maxScale} /></div>
                <div className="mt-7 grid grid-cols-3 gap-2 text-xs">
                  <div><div className="eyebrow">Floor</div><span className="num text-base">{p.proj.floor}</span></div>
                  <div><div className="eyebrow">Ceiling</div><span className="num text-base">{p.proj.ceiling}</span></div>
                  <div><div className="eyebrow">Confidence</div><span className="num text-base">{Math.round(p.proj.confidence * 100)}%</span></div>
                </div>
                <p className="mt-4 text-[11px] leading-relaxed text-fg-dim">Model {v.week.projection.modelVersion}. Expected opportunity {v.week.xfp} pts × efficiency {v.week.efficiency} × game environment {v.week.envFactor} × matchup {v.week.matchupFactor}{v.week.backupQbPenalty ? " × backup-QB haircut" : ""}. Floor/ceiling ≈ 20th/80th percentile.</p>
              </div>
            </Card>

            <Card>
              <CardHeader eyebrow="Opportunity" kind="calculated" title="Role & usage" />
              <div className="px-5 pb-5 pt-3">
                <div className="flex items-center gap-4">
                  <ScoreRing value={p.opp.score} size={72} label="opp" />
                  <div>
                    <TrendBadge trend={p.opp.trend} pct={p.opp.trendPct} />
                    <div className="mt-1 text-xs text-fg-muted">Production score <span className="num text-fg">{p.opp.production}</span> · gap <Delta value={p.breakout.gap} decimals={0} /></div>
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                  {v.opp.signals.map((s) => (
                    <div key={s.label} className="flex justify-between gap-2 border-b border-line/60 pb-1.5"><dt className="text-fg-muted">{s.label}</dt><dd className="num text-fg">{s.value}</dd></div>
                  ))}
                </dl>
                {v.week.usage?.kind === "nfl" && <p className="mt-3 text-[11px] text-fg-dim">Projected: {v.week.usage.targets.toFixed(1)} targets · {v.week.usage.carries.toFixed(1)} carries · {Math.round(v.week.usage.snapPct * 100)}% snaps</p>}
                {v.week.usage?.kind === "nba" && <p className="mt-3 text-[11px] text-fg-dim">Projected: {v.week.usage.minutes.toFixed(1)} min{v.week.usage.started ? " · starting" : ""} · usage boost ×{v.week.usage.usageBoost.toFixed(2)}</p>}
              </div>
            </Card>

            <Card>
              <CardHeader eyebrow="Availability" kind="calculated" title="Participation risk" />
              <div className="px-5 pb-5 pt-3">
                <div className="flex items-baseline justify-between">
                  <span className="num text-4xl font-semibold">{a.score}<span className="text-lg text-fg-dim">/100</span></span>
                  <span className="text-right text-xs"><span className="block text-fg">{a.expectedToPlay}</span><span className="text-fg-dim">Workload uncertainty: {a.workloadUncertainty}</span></span>
                </div>
                <Meter value={a.score} tone="health" className="mt-4" />
                <ul className="mt-4 space-y-2">
                  {a.factors.map((f) => (
                    <li key={f.label} className="text-xs">
                      <div className="flex justify-between gap-2"><span className="text-fg">{f.label}</span>{f.impact !== 0 && <Delta value={f.impact} decimals={0} />}</div>
                      <div className="text-fg-dim">{f.detail}</div>
                    </li>
                  ))}
                  {!a.factors.length && <li className="text-xs text-fg-muted">No risk factors — full participant, no recent absences.</li>}
                </ul>
                <p className="mt-4 text-[10.5px] text-fg-dim">Estimates the chance of playing, not medical outcomes.</p>
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-violet to-transparent" />
            <CardHeader eyebrow="What's changing?" kind="ai" title="Why the numbers moved" />
            <ul className="space-y-2.5 px-5 pb-5 pt-3">
              {d.changing.map((c, i) => <li key={i} className="flex gap-3 text-[13.5px] leading-relaxed text-fg-muted"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-violet" />{c}</li>)}
            </ul>
            <p className="px-5 pb-4 text-[11px] text-fg-dim">Built only from the structured engines above — no free-text claims.</p>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader eyebrow="Production vs opportunity" title="Fantasy points against expected points" action={<span className="flex gap-1.5"><KindTag kind="observed" /><KindTag kind="calculated" /></span>} />
              <div className="px-3 pb-4 pt-3"><ProductionChart data={series} /></div>
            </Card>
            <Card>
              <CardHeader eyebrow="Usage & playing time" kind="observed" title={`${primaryLabel} and ${secondaryLabel.toLowerCase()}`} />
              <div className="px-3 pb-4 pt-3"><UsageChart data={series} primaryLabel={primaryLabel} secondaryLabel={secondaryLabel} /></div>
            </Card>
          </div>
        </>
      )}

      {tab === "game-log" && <GameLog logs={d.logs} nfl={nfl} />}

      {tab === "advanced" && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-5">
            <div className="eyebrow mb-3 flex items-center gap-2">Sustainability <KindTag kind="calculated" /></div>
            <div className="flex items-baseline gap-3"><span className="num text-4xl font-semibold">{v.sustainability.score}</span><span className="text-sm text-fg-muted">{v.sustainability.label}</span></div>
            <p className="mt-3 text-sm text-fg-muted">Actual points ÷ expected-from-usage = <span className="num text-fg">{v.sustainability.ratio}</span> (shrunk toward 1.0 for small samples).{v.sustainability.tdShare !== null && <> Touchdown share of points: <span className="num text-fg">{Math.round(v.sustainability.tdShare * 100)}%</span>.</>}</p>
          </Card>
          <Card className="p-5">
            <div className="eyebrow mb-3 flex items-center gap-2">Breakout engine <KindTag kind="calculated" /></div>
            <div className="flex items-baseline gap-3"><span className="num text-4xl font-semibold text-cyan">{v.breakout.score}</span><span className="text-sm text-fg-muted">{v.breakout.flagged ? "Flagged — opportunity leads production" : "No breakout signal"}</span></div>
            <p className="mt-3 text-sm text-fg-muted">Opportunity {v.opp.score} − production {v.opp.productionScore} = gap <span className="num text-fg">{v.breakout.gap}</span>. Forward role change vs recent usage: <span className="num text-fg">{v.forwardRoleChange}%</span>.</p>
          </Card>
          <Card className="p-5 md:col-span-2">
            <div className="eyebrow mb-3">Projection inputs</div>
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              {[["Expected opp. pts", v.week.xfp], ["Efficiency ×", v.week.efficiency], ["Game environment ×", v.week.envFactor], ["Matchup ×", v.week.matchupFactor]].map(([l, val]) => (
                <div key={l as string}><div className="eyebrow mb-1">{l}</div><span className="num text-2xl">{val}</span></div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "fantasy" && (
        <Card className="p-5">
          <div className="eyebrow mb-4">Fantasy points by game · {d.scoringFormat.replace("_", " ").toUpperCase()}</div>
          <ProductionChart data={series} />
        </Card>
      )}

      {tab === "injuries" && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-5">
            <div className="eyebrow mb-3 flex items-center gap-2">Current report <KindTag kind="observed" /></div>
            {d.injury ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2"><StatusPill status={d.injury.designation} long /> <span className="text-fg-muted">{d.injury.bodyPart}</span></div>
                {d.injury.practice.length > 0 && <div className="text-fg-muted">Practice: <span className="num text-fg">{d.injury.practice.join(" · ")}</span></div>}
                {d.injury.minutesRestriction && <div className="text-fg-muted">Minutes limit: <span className="num text-fg">~{d.injury.minutesRestriction}</span></div>}
                <p className="text-fg-muted">{d.injury.note}</p>
              </div>
            ) : <p className="text-sm text-fg-muted">Not on the injury report.</p>}
          </Card>
          <Card className="p-5">
            <div className="eyebrow mb-3 flex items-center gap-2">History <KindTag kind="observed" /></div>
            {d.history.length ? (
              <ul className="space-y-2 text-sm">{d.history.map((h, i) => <li key={i} className="flex justify-between"><span>{h.bodyPart} · {h.season}</span><span className="num text-fg-muted">{h.gamesMissed} games missed</span></li>)}</ul>
            ) : <p className="text-sm text-fg-muted">No significant absences in prior seasons.</p>}
          </Card>
        </div>
      )}

      {tab === "news" && (
        d.research.length ? (
          <div className="space-y-3">
            {d.research.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10.5px] uppercase tracking-wider text-fg-dim">{r.eventType.replace(/_/g, " ")}</span>
                  <span className={cn("font-mono text-[10.5px]", r.direction === "increase" ? "text-up" : r.direction === "decrease" ? "text-down" : "text-fg-dim")}>{r.direction}</span>
                  <span className="num text-[10.5px] text-fg-dim">confidence {Math.round(r.confidence * 100)}%</span>
                  <span className="ml-auto text-[11px] text-fg-dim">{new Date(r.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                </div>
                <p className="text-sm">{r.summary}</p>
                <div className="mt-2 text-[11px] text-fg-dim">Source: {r.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-line-strong underline-offset-2 hover:text-fg-muted">{s.publisher}</a>)}{d.isMock && " (fictional mock source)"}</div>
              </Card>
            ))}
          </div>
        ) : <EmptyState title="No recent research events" body="When a research provider is connected (EXA_API_KEY), injury, practice and role news is converted into structured events here — with sources." />
      )}
    </div>
  );
}

function GameLog({ logs, nfl }: { logs: { label: string; played: boolean; fp: number; opp: string; stats: Record<string, number>; usage: NflUsage | NbaUsage }[]; nfl: boolean }) {
  const cols = nfl
    ? [["Snap%", (l: (typeof logs)[number]) => ("snapPct" in l.usage ? Math.round(l.usage.snapPct * 100) : 0)], ["Tgt", (l: (typeof logs)[number]) => l.stats.targets ?? 0], ["Rec", (l: (typeof logs)[number]) => l.stats.rec ?? 0], ["RecYd", (l: (typeof logs)[number]) => l.stats.rec_yds ?? 0], ["Car", (l: (typeof logs)[number]) => l.stats.rush_att ?? 0], ["RuYd", (l: (typeof logs)[number]) => l.stats.rush_yds ?? 0], ["PaYd", (l: (typeof logs)[number]) => l.stats.pass_yds ?? 0], ["TD", (l: (typeof logs)[number]) => (l.stats.rec_td ?? 0) + (l.stats.rush_td ?? 0) + (l.stats.pass_td ?? 0)]] as const
    : [["Min", (l: (typeof logs)[number]) => l.stats.min ?? 0], ["Pts", (l: (typeof logs)[number]) => l.stats.pts ?? 0], ["Reb", (l: (typeof logs)[number]) => l.stats.reb ?? 0], ["Ast", (l: (typeof logs)[number]) => l.stats.ast ?? 0], ["Stl", (l: (typeof logs)[number]) => l.stats.stl ?? 0], ["Blk", (l: (typeof logs)[number]) => l.stats.blk ?? 0], ["3PM", (l: (typeof logs)[number]) => l.stats.fg3m ?? 0], ["TO", (l: (typeof logs)[number]) => l.stats.tov ?? 0]] as const;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead><tr className="eyebrow border-b border-line [&>th]:px-4 [&>th]:py-3 [&>th]:text-right [&>th]:font-normal"><th className="!text-left">Game</th><th className="!text-left">Opp</th>{cols.map(([l]) => <th key={l}>{l}</th>)}<th className="text-projected">FPts</th></tr></thead>
        <tbody>
          {[...logs].reverse().map((l, i) => (
            <tr key={i} className="border-b border-line/60 [&>td]:px-4 [&>td]:py-2.5 [&>td]:text-right">
              <td className="!text-left font-mono text-xs text-fg-muted">{l.label}</td>
              <td className="!text-left font-mono text-xs">{l.opp}</td>
              {l.played ? cols.map(([k, f]) => <td key={k} className="num">{Math.round(f(l) * 10) / 10}</td>) : <td colSpan={cols.length} className="!text-center text-xs text-fg-dim">Did not play</td>}
              <td className="num font-semibold">{l.played ? l.fp : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
