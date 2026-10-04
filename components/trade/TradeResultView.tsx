import type { TradeResult, TradeSideResult } from "@/lib/analytics/trade";
import type { PlayerSummary } from "@/lib/services/core";
import { cn } from "@/lib/util/cn";
import { Delta, KindTag } from "@/components/ui/badges";
import { CausalChain } from "@/components/ui/cards";
import { BeforeAfterBar } from "@/components/ui/meters";

function TradeSide({ title, side, players, accent }: { title: string; side: TradeSideResult; players: Record<string, PlayerSummary>; accent: "electric" | "violet" }) {
  return (
    <div className="surface relative overflow-hidden p-5">
      <span className={cn("absolute inset-x-0 top-0 h-px", accent === "electric" ? "bg-gradient-to-r from-electric to-transparent" : "bg-gradient-to-r from-violet to-transparent")} />
      <div className="eyebrow mb-3">{title} receives</div>
      <div className="mb-4 space-y-1">
        {side.receives.map((id) => <div key={id} className="flex items-baseline justify-between gap-2"><span className="text-lg font-medium tracking-tight">{players[id]?.name}</span><span className="font-mono text-[11px] text-fg-dim">{players[id]?.position} · {players[id]?.teamAbbr} · val {players[id]?.value}</span></div>)}
      </div>
      <div className="grid grid-cols-2 gap-4 border-y border-line py-4">
        <div>
          <div className="eyebrow mb-1 flex items-center gap-1.5">Weekly lineup <KindTag kind="projected" /></div>
          <Delta value={side.weeklyDelta} className="text-3xl font-semibold" />
          <div className="num mt-1 text-[11px] text-fg-dim">{side.weeklyBefore} → {side.weeklyAfter} ROS/wk</div>
        </div>
        <div>
          <div className="eyebrow mb-1 flex items-center gap-1.5">Title odds <KindTag kind="calculated" /></div>
          <div className="num text-3xl font-semibold"><span className="text-fg-dim">{side.champBefore}</span><span className="mx-1 text-base text-fg-dim">→</span><span className={side.champAfter >= side.champBefore ? "text-up" : "text-down"}>{side.champAfter}%</span></div>
          <div className="num mt-1 text-[11px] text-fg-dim">Playoffs {side.playoffBefore}% → {side.playoffAfter}%</div>
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        <div className="eyebrow">Positional strength</div>
        {side.groupStrength.map((g) => <BeforeAfterBar key={g.group} label={g.group} before={g.before} after={g.after} />)}
        <div className="eyebrow pt-2">Depth</div>
        {side.groupDepth.map((g) => <BeforeAfterBar key={g.group} label={g.group} before={g.before} after={g.after} />)}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
        <div><div className="eyebrow">This week</div><Delta value={side.thisWeekDelta} /></div>
        <div><div className="eyebrow">Floor</div><Delta value={side.floorDelta} /></div>
        <div><div className="eyebrow">Ceiling</div><Delta value={side.ceilingDelta} /></div>
      </div>
      {side.notes.length > 0 && <ul className="mt-4 space-y-1 text-xs text-fg-muted">{side.notes.map((n) => <li key={n}>· {n}</li>)}</ul>}
    </div>
  );
}

const VERDICT_CLS: Record<string, string> = {
  "WIN-WIN": "text-up glow-cyan", "FAVORS A": "text-electric-soft", "FAVORS B": "text-violet", NEUTRAL: "text-fg-muted", "LOSE-LOSE": "text-down",
};

export function TradeResultView({ result, players, aName, bName }: { result: TradeResult; players: Record<string, PlayerSummary>; aName: string; bName: string }) {
  return (
    <div className="space-y-4 animate-fade-up">
      <div className="surface-raised grid gap-6 p-6 md:grid-cols-[1fr_1fr_1fr_1.3fr]">
        <div>
          <div className="eyebrow mb-1">Verdict</div>
          <div className={cn("num text-3xl font-semibold tracking-tight", VERDICT_CLS[result.verdict])}>{result.verdict}</div>
        </div>
        <div>
          <div className="eyebrow mb-1">Value fairness</div>
          <div className="num text-3xl font-semibold">{result.fairness}<span className="text-base text-fg-dim">/100</span></div>
        </div>
        <div>
          <div className="eyebrow mb-1">Benefit</div>
          <div className="num text-sm">You <Delta value={result.a.benefitPct} suffix="%" className="text-xl font-semibold" /></div>
          <div className="num text-sm">Them <Delta value={result.b.benefitPct} suffix="%" className="text-xl font-semibold" /></div>
        </div>
        <div className="rounded-xl border border-line bg-white/[0.02] p-3">
          <div className="eyebrow mb-1 flex items-center gap-2">Trade acceptance estimate <KindTag kind="calculated" /></div>
          <div className={cn("num text-xl font-semibold", result.acceptance.level === "HIGH" ? "text-up" : result.acceptance.level === "MEDIUM" ? "text-amber" : "text-down")}>{result.acceptance.level} <span className="text-xs text-fg-dim">({result.acceptance.score})</span></div>
          <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-fg-muted">{result.acceptance.reasons.slice(0, 3).map((r) => <li key={r}>· {r}</li>)}</ul>
          <p className="mt-2 text-[10.5px] text-fg-dim">{result.acceptance.disclaimer}</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TradeSide title={aName} side={result.a} players={players} accent="electric" />
        <TradeSide title={bName} side={result.b} players={players} accent="violet" />
      </div>
      <div className="surface p-5">
        <div className="eyebrow mb-3">How this was calculated</div>
        <CausalChain steps={result.chain} />
        <p className="mt-3 text-[11px] text-fg-dim">Benefit = change in each team&apos;s optimal ROS lineup strength. Both teams can win when roster construction is complementary.</p>
      </div>
    </div>
  );
}
