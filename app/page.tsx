import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DataOrb } from "@/components/landing/DataOrb";
import { QueryTicker } from "@/components/landing/QueryTicker";
import { Logo } from "@/components/shell/Logo";
import { KindTag } from "@/components/ui/badges";
import { CausalChain } from "@/components/ui/cards";

export const metadata = { title: "Foresight — Know what happens next" };

const FEATURES = [
  {
    eyebrow: "Trade Lab", title: "Both sides of every trade.",
    body: "Rosters swap, optimal lineups re-solve, the season re-simulates. You see what each team gains — and why roster construction lets both win.",
    preview: (
      <div className="grid grid-cols-2 gap-3 text-xs">
        {[["You receive", "+5.3", "WR 74 → 89", "14.2% → 18.7%"], ["They receive", "+2.1", "RB 62 → 79", "9.8% → 11.6%"]].map(([t, d, s, c], i) => (
          <div key={t} className="rounded-xl border border-line bg-ink-900 p-3">
            <div className="eyebrow mb-2">{t}</div>
            <div className="num text-2xl font-semibold text-up">{d}</div>
            <div className="num mt-1 text-fg-muted">{s}</div>
            <div className="num text-fg-dim">Title {c}</div>
            {i === 0 && <div className="mt-2 font-mono text-[10px] text-up">VERDICT · WIN-WIN</div>}
          </div>
        ))}
      </div>
    ),
  },
  {
    eyebrow: "Player intelligence", title: "Production is the past. Opportunity is the future.",
    body: "Snap share, targets, carries, minutes and usage are scored separately from points — so you see breakouts before the box score does.",
    preview: (
      <div className="rounded-xl border border-line bg-ink-900 p-4 text-xs">
        <div className="flex items-end justify-between"><div><div className="eyebrow">Opportunity</div><div className="num text-3xl font-semibold text-electric-soft">91</div></div><div className="text-right"><div className="eyebrow">Production</div><div className="num text-3xl font-semibold text-fg-muted">64</div></div></div>
        <div className="mt-3 flex h-2 gap-[3px]">{Array.from({ length: 20 }, (_, i) => <span key={i} className={`flex-1 rounded-sm ${i < 18 ? "bg-electric" : "bg-white/10"}`} />)}</div>
        <div className="mt-3 font-mono text-[10.5px] text-cyan">GAP +27 · BREAKOUT WATCH</div>
      </div>
    ),
  },
  {
    eyebrow: "Scenario engine", title: "What happens if…?",
    body: "Rule a player out, promote a backup or set minutes. Work redistributes by role and depth chart; every affected projection updates.",
    preview: <div className="rounded-xl border border-line bg-ink-900 p-4"><CausalChain tone="cyan" steps={["Starting RB OUT", "Backup snaps 41% → 73%", "Carries 6.2 → 16.1", "Projection 7.4 → 15.2", "Waiver priority HIGH"]} /></div>,
  },
  {
    eyebrow: "AI analyst", title: "Answers with receipts.",
    body: "The model never invents a stat. It calls the engine's tools, reasons over structured results, and shows you every call it made.",
    preview: (
      <div className="space-y-2 text-xs">
        <div className="ml-auto w-fit rounded-xl rounded-br-sm bg-electric/15 px-3 py-2 ring-1 ring-electric/25">Who benefits if the star PG sits?</div>
        <div className="rounded-xl border border-line bg-ink-900 p-3 text-fg-muted"><span className="text-fg">Backup PG</span>: +9 projected minutes, PG14 → PG3. <span className="text-fg">SG</span>: +4.2% usage.<div className="mt-2 font-mono text-[10px] text-fg-dim">▸ 2 TOOL CALLS · searchPlayers · simulateScenario</div></div>
      </div>
    ),
  },
];

export default function Landing() {
  return (
    <div className="relative overflow-x-clip">
      <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/connect?sport=nba" className="hidden rounded-lg px-3 py-2 text-fg-muted hover:text-fg sm:block">NBA</Link>
          <Link href="/connect?sport=nfl" className="hidden rounded-lg px-3 py-2 text-fg-muted hover:text-fg sm:block">NFL</Link>
          <Link href="/connect?sport=nfl" className="focus-ring rounded-lg bg-white px-3.5 py-2 font-medium text-ink-950 transition hover:bg-white/90">Open the app</Link>
        </nav>
      </header>

      <section className="relative isolate mx-auto max-w-7xl px-5 pb-24 pt-10 text-center sm:px-8">
        <div className="hairline-grid pointer-events-none absolute inset-0 -z-10 opacity-50 [mask-image:radial-gradient(60%_55%_at_50%_45%,black,transparent)]" />
        <div className="pointer-events-none absolute left-1/2 top-24 -z-10 aspect-square w-[min(820px,110vw)] -translate-x-1/2">
          <DataOrb className="size-full" />
        </div>
        <div className="eyebrow mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-ink-900/70 px-3 py-1.5 backdrop-blur animate-fade-up"><span className="size-1.5 rounded-full bg-cyan animate-pulse-dot" />AI fantasy intelligence · NFL + NBA</div>
        <h1 className="mx-auto max-w-5xl text-[length:var(--text-hero)] font-semibold leading-[0.92] tracking-[-0.055em] animate-fade-up [animation-delay:80ms]">
          Know what<br /><span className="bg-gradient-to-r from-electric-soft via-cyan to-violet bg-clip-text text-transparent">happens next.</span>
        </h1>
        <p className="mx-auto mt-7 max-w-xl text-lg text-fg-muted animate-fade-up [animation-delay:160ms]">Live data. Deeper context. Smarter fantasy decisions. Fantasy points tell you what happened — we help you understand what comes next.</p>
        <div className="mt-9 flex flex-wrap justify-center gap-3 animate-fade-up [animation-delay:240ms]">
          <Link href="/connect?sport=nfl" className="focus-ring group inline-flex items-center gap-2 rounded-xl bg-electric px-5 py-3 font-medium text-white shadow-[0_0_40px_-8px_#4f7cff] transition hover:bg-electric-soft">Analyze an NFL roster <ArrowRight size={16} className="transition group-hover:translate-x-0.5" /></Link>
          <Link href="/connect?sport=nba" className="focus-ring rounded-xl border border-line-strong bg-ink-900/60 px-5 py-3 font-medium backdrop-blur transition hover:border-white/25">Analyze an NBA roster</Link>
        </div>
        <div className="mt-16 animate-fade-up [animation-delay:320ms]"><QueryTicker /></div>
        <div className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-2 animate-fade-up [animation-delay:400ms]">
          <KindTag kind="observed" /><KindTag kind="calculated" /><KindTag kind="projected" /><KindTag kind="market" /><KindTag kind="ai" />
        </div>
        <p className="mt-3 text-xs text-fg-dim">Every number tells you what kind of truth it is.</p>
      </section>

      <section className="mx-auto max-w-7xl space-y-24 px-5 pb-28 sm:px-8">
        {FEATURES.map((f, i) => (
          <div key={f.eyebrow} className={`grid items-center gap-10 md:grid-cols-2 ${i % 2 ? "md:[&>*:first-child]:order-2" : ""}`}>
            <div>
              <div className="eyebrow mb-3 text-electric-soft">{f.eyebrow}</div>
              <h2 className="text-[length:var(--text-display)] font-semibold leading-[1] tracking-[-0.045em]">{f.title}</h2>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-fg-muted">{f.body}</p>
            </div>
            <div className="surface-raised relative isolate p-5">
              <div className="pointer-events-none absolute -inset-px -z-10 rounded-[15px] bg-gradient-to-br from-electric/25 via-transparent to-violet/20 blur-xl" />
              {f.preview}
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-28 text-center sm:px-8">
        <h2 className="text-[length:var(--text-display)] font-semibold leading-[1] tracking-[-0.045em]">Cause → effect. Everywhere.</h2>
        <p className="mx-auto mt-4 max-w-lg text-fg-muted">Not a calculator. Not a stats dump. An analyst that shows its work.</p>
        <Link href="/connect?sport=nfl" className="focus-ring mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-medium text-ink-950 hover:bg-white/90">Open the command center <ArrowRight size={16} /></Link>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-xs text-fg-dim sm:px-8">
          <Logo />
          <p className="max-w-xl">Fantasy sports analytics. Projections and probabilities are estimates, never guarantees. Market data is analytical context, not betting advice. Demo data is fictional.</p>
        </div>
      </footer>
    </div>
  );
}
