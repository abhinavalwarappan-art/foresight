import type { ReactNode } from "react";
import type { Freshness } from "@/lib/admin/freshness";
import type { Trace, TraceRow } from "@/lib/analytics/trace";
import type { RawRecord } from "@/lib/providers/raw-store";
import { cn } from "@/lib/util/cn";
import { CopyButton } from "./CopyButton";

export const NA = () => <span className="rounded border border-amber/30 bg-amber/10 px-1.5 py-px font-mono text-[10px] font-semibold tracking-wider text-amber">NOT AVAILABLE</span>;

export function Section({ id, n, title, sub, children, open = true }: { id: string; n: number | string; title: string; sub?: string; children: ReactNode; open?: boolean }) {
  return (
    <details id={id} open={open} className="surface group scroll-mt-24 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-baseline gap-3 px-5 py-4">
        <span className="num w-6 text-xs text-fg-dim">{n}</span>
        <span className="font-mono text-[12px] font-semibold tracking-[0.14em] text-fg">{title.toUpperCase()}</span>
        {sub && <span className="hidden text-xs text-fg-dim md:inline">{sub}</span>}
        <span className="ml-auto font-mono text-[10px] text-fg-dim group-open:hidden">expand ▸</span>
      </summary>
      <div className="border-t border-line px-5 pb-5 pt-4">{children}</div>
    </details>
  );
}

const TONE: Record<Freshness["tone"], string> = {
  live: "text-up border-up/30 bg-up/10", fresh: "text-up/80 border-up/20", aging: "text-amber border-amber/30", stale: "text-down border-down/40 bg-down/10",
  mock: "text-amber/90 border-amber/25", computed: "text-electric-soft border-electric/25", unknown: "text-fg-dim border-line",
};
export function FreshBadge({ f }: { f: Freshness }) {
  return <span className={cn("whitespace-nowrap rounded border px-1.5 py-px font-mono text-[10px] font-semibold tracking-wider", TONE[f.tone])}>{f.label}</span>;
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-[180px_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-mono text-[11px] uppercase tracking-wider text-fg-dim">{k}</dt>
          <dd className="num break-all text-fg">{v === null || v === undefined || v === "" ? <NA /> : v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function JsonBlock({ title, value, meta, defaultOpen = false }: { title: ReactNode; value: unknown; meta?: ReactNode; defaultOpen?: boolean }) {
  const text = JSON.stringify(value, null, 2) ?? "null";
  return (
    <details open={defaultOpen} className="rounded-lg border border-line bg-ink-900/70">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-[12px]">
        <span className="font-medium text-fg">{title}</span>
        {meta}
        <span className="ml-auto font-mono text-[10px] text-fg-dim">{text.length.toLocaleString()} chars</span>
      </summary>
      <div className="relative border-t border-line">
        <div className="absolute right-2 top-2"><CopyButton text={text} /></div>
        <pre className="max-h-[420px] overflow-auto p-3 font-mono text-[11px] leading-relaxed text-fg-muted">{text}</pre>
      </div>
    </details>
  );
}

export function RawBlock({ r }: { r: RawRecord }) {
  return (
    <JsonBlock
      title={<><span className="font-mono text-electric-soft">{r.provider}</span> · {r.kind}</>}
      value={r.payload}
      meta={<>
        {r.synthetic && <span className="rounded border border-amber/30 px-1.5 font-mono text-[9.5px] text-amber">SYNTHETIC (MOCK)</span>}
        <span className="font-mono text-[10px] text-fg-dim">{r.endpoint}</span>
        <span className="font-mono text-[10px] text-fg-dim">retrieved {r.retrievedAt}</span>
        <span className="font-mono text-[10px] text-fg-dim">cache: {r.cache}</span>
      </>}
    />
  );
}

function cell(row: TraceRow) {
  if (row.value === null) return <NA />;
  return <span className="num">{typeof row.value === "number" ? row.value : row.value}{row.unit && typeof row.value === "number" ? (row.unit === "%" || row.unit === "×" ? row.unit : ` ${row.unit}`) : ""}</span>;
}
const KIND_DOT: Record<string, string> = { observed: "bg-white/70", calculated: "bg-electric", projected: "bg-cyan", market: "bg-amber" };

export function TraceTable({ trace }: { trace: Trace }) {
  return (
    <div className="rounded-xl border border-line bg-white/[0.012] p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h4 className="text-[14px] font-semibold">{trace.metric}</h4>
        <span className="num text-xl font-semibold text-cyan">{trace.result}</span>
        {trace.reconciles !== null && (
          <span className={cn("rounded border px-1.5 py-px font-mono text-[10px]", trace.reconciles ? "border-up/30 text-up" : "border-down/40 bg-down/10 text-down")}>
            {trace.reconciles ? "✓ STEPS REPRODUCE ENGINE OUTPUT" : "✗ TRACE DOES NOT RECONCILE"}
          </span>
        )}
      </div>
      {trace.inputs.length > 0 && (
        <>
          <div className="eyebrow mb-1.5">Inputs</div>
          <table className="mb-4 w-full text-[12.5px]"><tbody>
            {trace.inputs.map((r, i) => (
              <tr key={i} className="border-b border-line/50 [&>td]:py-1.5">
                <td className="w-3"><span className={cn("inline-block size-1.5 rounded-full", KIND_DOT[r.kind ?? "calculated"])} /></td>
                <td className="pr-3 text-fg-muted">{r.label}</td>
                <td className="text-right">{cell(r)}</td>
                <td className="hidden pl-3 text-[11px] text-fg-dim md:table-cell">{r.note}</td>
              </tr>
            ))}
          </tbody></table>
        </>
      )}
      <div className="eyebrow mb-1.5">Computation</div>
      <table className="w-full text-[12.5px]"><tbody>
        {trace.steps.map((r, i) => (
          <tr key={i} className="border-b border-line/50 [&>td]:py-1.5">
            <td className="w-3"><span className={cn("inline-block size-1.5 rounded-full", KIND_DOT[r.kind ?? "calculated"])} /></td>
            <td className="pr-3 text-fg-muted">{r.label}</td>
            <td className="text-right">{r.delta !== undefined && r.delta !== null ? <span className={cn("num", r.delta > 0 ? "text-up" : r.delta < 0 ? "text-down" : "text-fg-dim")}>{r.delta > 0 ? "+" : ""}{r.delta}</span> : cell(r)}</td>
            <td className="num w-20 text-right text-fg">{r.running !== undefined && r.running !== null ? r.running : ""}</td>
            <td className="hidden pl-3 text-[11px] text-fg-dim lg:table-cell">{r.note}</td>
          </tr>
        ))}
      </tbody></table>
      {trace.notes.length > 0 && <ul className="mt-3 space-y-0.5 text-[11px] text-fg-dim">{trace.notes.map((n) => <li key={n}>· {n}</li>)}</ul>}
    </div>
  );
}
