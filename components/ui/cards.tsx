import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/util/cn";
import { KindTag, type DataKind } from "./badges";

export function Card({ children, className, raised }: { children: ReactNode; className?: string; raised?: boolean }) {
  return <section className={cn(raised ? "surface-raised" : "surface", "relative", className)}>{children}</section>;
}

export function CardHeader({ eyebrow, title, kind, action, className }: { eyebrow?: string; title?: ReactNode; kind?: DataKind; action?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex items-start justify-between gap-3 px-5 pt-4", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1 flex items-center gap-2">{eyebrow}{kind && <KindTag kind={kind} />}</div>}
        {title && <h3 className="text-[15px] font-medium tracking-tight text-fg">{title}</h3>}
      </div>
      {action}
    </header>
  );
}

export function MetricCard({ label, value, sub, kind, accent, className }: { label: string; value: ReactNode; sub?: ReactNode; kind?: DataKind; accent?: "electric" | "cyan" | "violet" | "up" | "down"; className?: string }) {
  const ac = accent ? { electric: "text-electric-soft glow-electric", cyan: "text-cyan glow-cyan", violet: "text-violet", up: "text-up", down: "text-down" }[accent] : "text-fg";
  return (
    <div className={cn("surface px-4 py-3.5", className)}>
      <div className="eyebrow flex items-center justify-between gap-2">{label}{kind && <KindTag kind={kind} />}</div>
      <div className={cn("num mt-2 text-[28px] font-semibold leading-none", ac)}>{value}</div>
      {sub && <div className="mt-1.5 text-xs text-fg-muted">{sub}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, sub, right }: { eyebrow: string; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
      <div>
        <div className="eyebrow mb-2 text-electric-soft">{eyebrow}</div>
        <h1 className="text-[clamp(1.9rem,1.2rem+2.2vw,2.9rem)] font-semibold leading-[1.02] tracking-[-0.035em]">{title}</h1>
        {sub && <p className="mt-2 max-w-2xl text-sm text-fg-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** Cause → effect chain. The product's core explanatory device. */
export function CausalChain({ steps, className, tone = "electric" }: { steps: string[]; className?: string; tone?: "electric" | "violet" | "cyan" }) {
  const dot = { electric: "bg-electric", violet: "bg-violet", cyan: "bg-cyan" }[tone];
  return (
    <ol className={cn("relative space-y-0", className)}>
      {steps.map((s, i) => (
        <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
          {i < steps.length - 1 && <span className="absolute left-[5px] top-4 h-[calc(100%-8px)] w-px bg-gradient-to-b from-white/20 to-white/5" />}
          <span className={cn("relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-ink-850", i === steps.length - 1 ? dot : "bg-white/25")} />
          <span className={cn("text-[13px] leading-snug", i === steps.length - 1 ? "font-medium text-fg" : "text-fg-muted")}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="surface flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-full border border-line bg-white/[0.02]">
        <span className="size-2 rounded-full bg-electric animate-pulse-dot" />
      </div>
      <h3 className="text-base font-medium">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-fg-muted">{body}</p>
      {action && <Link href={action.href} className="focus-ring mt-5 rounded-lg bg-electric px-3.5 py-2 text-sm font-medium text-white hover:bg-electric-soft">{action.label}</Link>}
    </div>
  );
}

export function InsightCard({ title, body, href, tone = "violet", kind = "ai" }: { title: string; body: ReactNode; href?: string; tone?: "violet" | "cyan" | "electric" | "amber"; kind?: DataKind }) {
  const bar = { violet: "from-violet", cyan: "from-cyan", electric: "from-electric", amber: "from-amber" }[tone];
  const inner = (
    <div className="surface group relative overflow-hidden p-4 transition-colors hover:border-line-strong">
      <span className={cn("absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b to-transparent", bar)} />
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h4 className="text-[13.5px] font-medium">{title}</h4>
        <KindTag kind={kind} />
      </div>
      <div className="text-[13px] leading-relaxed text-fg-muted">{body}</div>
    </div>
  );
  return href ? <Link href={href} className="focus-ring block rounded-[14px]">{inner}</Link> : inner;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}
