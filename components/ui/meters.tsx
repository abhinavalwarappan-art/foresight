import { cn } from "@/lib/util/cn";

/** Segmented 0–100 meter. Color carries meaning (opportunity = electric, availability = green→red). */
export function Meter({ value, tone = "electric", segments = 20, className }: { value: number; tone?: "electric" | "cyan" | "health" | "violet"; segments?: number; className?: string }) {
  const filled = Math.round((Math.max(0, Math.min(100, value)) / 100) * segments);
  const color =
    tone === "health" ? (value >= 80 ? "bg-up" : value >= 55 ? "bg-amber" : "bg-down")
    : tone === "cyan" ? "bg-cyan" : tone === "violet" ? "bg-violet" : "bg-electric";
  return (
    <div className={cn("flex h-2 gap-[3px]", className)} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={cn("flex-1 rounded-[2px] transition-colors", i < filled ? color : "bg-white/[0.06]", i < filled && i === filled - 1 && "shadow-[0_0_10px_currentColor]")} />
      ))}
    </div>
  );
}

export function ScoreRing({ value, size = 64, label, tone = "electric" }: { value: number; size?: number; label?: string; tone?: "electric" | "cyan" | "up" | "violet" }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const stroke = { electric: "#4f7cff", cyan: "#2fd3f0", up: "#3ddc97", violet: "#9b7bff" }[tone];
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(255 255 255 / 0.07)" strokeWidth={4} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={stroke} strokeWidth={4} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} style={{ filter: `drop-shadow(0 0 6px ${stroke}88)` }} />
      </svg>
      <div className="absolute text-center">
        <div className="num text-lg font-semibold leading-none">{value}</div>
        {label && <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-widest text-fg-dim">{label}</div>}
      </div>
    </div>
  );
}

/** Floor–median–ceiling range bar on a shared scale. */
export function RangeBar({ floor, median, ceiling, max, tone = "cyan" }: { floor: number; median: number; ceiling: number; max: number; tone?: "cyan" | "electric" }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;
  const col = tone === "cyan" ? "bg-cyan" : "bg-electric";
  return (
    <div className="relative h-6">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/[0.08]" />
      <div className={cn("absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full opacity-35", col)} style={{ left: pct(floor), width: `calc(${pct(ceiling)} - ${pct(floor)})` }} />
      <div className={cn("absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-ink-850", col)} style={{ left: pct(median) }} />
      <span className="num absolute -bottom-3 -translate-x-1/2 text-[10px] text-fg-dim" style={{ left: pct(floor) }}>{floor}</span>
      <span className="num absolute -bottom-3 -translate-x-1/2 text-[10px] text-fg-dim" style={{ left: pct(ceiling) }}>{ceiling}</span>
    </div>
  );
}

export function BeforeAfterBar({ label, before, after }: { label: string; before: number; after: number }) {
  const up = after > before;
  const same = after === before;
  return (
    <div className="grid grid-cols-[64px_1fr_auto] items-center gap-3 text-xs">
      <span className="font-mono text-fg-muted">{label}</span>
      <div className="relative h-1.5 rounded-full bg-white/[0.06]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-white/20" style={{ width: `${before}%` }} />
        <div className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-700", same ? "bg-white/35" : up ? "bg-up" : "bg-down")} style={{ width: `${after}%`, opacity: 0.85 }} />
      </div>
      <span className="num w-16 text-right">
        <span className="text-fg-dim">{before}</span> <span className="text-fg-dim">→</span> <span className={same ? "text-fg-muted" : up ? "text-up" : "text-down"}>{after}</span>
      </span>
    </div>
  );
}
