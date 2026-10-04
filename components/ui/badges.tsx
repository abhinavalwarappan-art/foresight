import type { ReactNode } from "react";
import { cn } from "@/lib/util/cn";

export type DataKind = "observed" | "projected" | "market" | "ai" | "calculated";

const KIND: Record<DataKind, { label: string; cls: string }> = {
  observed: { label: "Observed", cls: "text-observed/80 border-white/10 bg-white/[0.03]" },
  calculated: { label: "Calculated", cls: "text-electric-soft border-electric/25 bg-electric/[0.06]" },
  projected: { label: "Projected", cls: "text-projected border-cyan/25 bg-cyan/[0.06]" },
  market: { label: "Market", cls: "text-market border-amber/25 bg-amber/[0.06]" },
  ai: { label: "AI interpretation", cls: "text-ai border-violet/25 bg-violet/[0.07]" },
};

/** Provenance tag. Every important number on screen says what kind of truth it is. */
export function KindTag({ kind, className, title }: { kind: DataKind; className?: string; title?: string }) {
  const k = KIND[kind];
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.12em]", k.cls, className)}>
      <span className="size-1 rounded-full bg-current" />
      {k.label}
    </span>
  );
}

const LABEL_CLS: Record<string, string> = {
  "STRONG BUY": "bg-up/15 text-up border-up/30",
  BUY: "bg-up/[0.08] text-up/90 border-up/20",
  HOLD: "bg-white/[0.04] text-fg-muted border-white/10",
  SELL: "bg-down/[0.08] text-down/90 border-down/20",
  "STRONG SELL": "bg-down/15 text-down border-down/30",
};

export function StockBadge({ label, size = "sm" }: { label: string; size?: "sm" | "lg" }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border font-mono font-semibold tracking-wider", LABEL_CLS[label] ?? LABEL_CLS.HOLD, size === "lg" ? "px-2.5 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]")}>
      {label}
    </span>
  );
}

const TAG_CLS: Record<string, string> = {
  "BREAKOUT WATCH": "text-cyan border-cyan/25",
  "REGRESSION WATCH": "text-amber border-amber/25",
  "INJURY OPPORTUNITY": "text-violet border-violet/30",
  "ROLE EXPANSION": "text-up border-up/25",
  "ROLE DECLINE": "text-down border-down/25",
};
export function SignalTag({ tag }: { tag: string }) {
  return <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[9.5px] tracking-wider", TAG_CLS[tag] ?? "text-fg-muted border-line")}>{tag}</span>;
}

const TREND: Record<string, { arrow: string; cls: string }> = {
  "Strongly Rising": { arrow: "⇈", cls: "text-up" },
  Rising: { arrow: "↑", cls: "text-up/85" },
  Stable: { arrow: "→", cls: "text-fg-muted" },
  Falling: { arrow: "↓", cls: "text-down/85" },
  "Strongly Falling": { arrow: "⇊", cls: "text-down" },
};
export function TrendBadge({ trend, pct }: { trend: string; pct?: number }) {
  const t = TREND[trend] ?? TREND.Stable;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", t.cls)}>
      <span aria-hidden>{t.arrow}</span>
      {trend}
      {pct !== undefined && <span className="num text-[11px] opacity-70">{pct > 0 ? "+" : ""}{pct}%</span>}
    </span>
  );
}

export function Delta({ value, suffix = "", decimals = 1, invert = false, className }: { value: number; suffix?: string; decimals?: number; invert?: boolean; className?: string }) {
  const good = invert ? value < 0 : value > 0;
  const zero = Math.abs(value) < 10 ** -decimals / 2;
  return (
    <span className={cn("num", zero ? "text-fg-dim" : good ? "text-up" : "text-down", className)}>
      {zero ? "±0" : `${value > 0 ? "+" : ""}${value.toFixed(decimals)}`}{suffix}
    </span>
  );
}

const STATUS: Record<string, string> = {
  healthy: "", probable: "text-up border-up/25", questionable: "text-amber border-amber/30", "day-to-day": "text-amber border-amber/30",
  doubtful: "text-down border-down/30", out: "text-down border-down/40 bg-down/10", ir: "text-down border-down/40 bg-down/10",
};
const STATUS_SHORT: Record<string, string> = { probable: "P", questionable: "Q", "day-to-day": "DTD", doubtful: "D", out: "OUT", ir: "IR" };
export function StatusPill({ status, long = false }: { status: string; long?: boolean }) {
  if (status === "healthy") return null;
  return <span className={cn("rounded border px-1 py-px font-mono text-[9.5px] font-semibold tracking-wider", STATUS[status])}>{long ? status.toUpperCase() : STATUS_SHORT[status]}</span>;
}

export function Severity({ level }: { level: string }) {
  const cls = level === "CRITICAL" ? "text-down bg-down/10 border-down/30" : level === "MODERATE" ? "text-amber bg-amber/10 border-amber/30" : level === "STRONG" ? "text-up bg-up/10 border-up/25" : "text-fg-muted border-line";
  return <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider", cls)}>{level}</span>;
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border border-line bg-white/[0.02] px-2 py-0.5 text-[11px] text-fg-muted", className)}>{children}</span>;
}
