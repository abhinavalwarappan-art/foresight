"use client";

import { useEffect, useState } from "react";
import type { ApiResponse } from "@/lib/util/api";
import { cn } from "@/lib/util/cn";
import { CopyButton } from "./CopyButton";

interface Spec { name: string; description: string; parameters: Record<string, unknown> }
interface RunResult { tool: string; ok: boolean; durationMs: number; bytes: number; llmMessage: string; result: unknown }

const FEATURED = ["getPlayerProfile", "getPlayerStats", "getPlayerAdvancedStats", "getPlayerProjection", "getPlayerOpportunity", "getPlayerAvailability", "comparePlayers", "analyzeRoster", "simulateTrade", "findTrades", "getWaivers", "findBreakouts", "simulateScenario"];

/** Execute registered AI tools by hand and see the literal payload the LLM receives. */
export function ToolInspector({ sport, specs, templates }: { sport: string; specs: Spec[]; templates: Record<string, unknown> }) {
  const ordered = [...specs].sort((a, b) => (FEATURED.indexOf(a.name) + 1 || 99) - (FEATURED.indexOf(b.name) + 1 || 99));
  const [tool, setTool] = useState(ordered[0]?.name ?? "");
  const [args, setArgs] = useState(() => JSON.stringify(templates[ordered[0]?.name] ?? {}, null, 2));
  const [res, setRes] = useState<RunResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const spec = specs.find((s) => s.name === tool);

  useEffect(() => { setArgs(JSON.stringify(templates[tool] ?? {}, null, 2)); setRes(null); setErr(null); }, [tool, templates]);

  const run = async () => {
    let parsed: unknown;
    try { parsed = JSON.parse(args || "{}"); } catch { setErr("Arguments are not valid JSON."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/admin/tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sport, tool, args: parsed }) });
      const j = (await r.json()) as ApiResponse<RunResult>;
      if (!j.success) setErr(j.error); else setRes(j.data);
    } catch { setErr("Request failed."); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
      <ul className="max-h-[560px] space-y-0.5 overflow-y-auto rounded-lg border border-line p-1.5">
        {ordered.map((s) => (
          <li key={s.name}>
            <button onClick={() => setTool(s.name)} className={cn("w-full rounded-md px-2.5 py-1.5 text-left font-mono text-[12px]", tool === s.name ? "bg-electric/15 text-fg" : "text-fg-muted hover:bg-white/[0.03]")}>
              {s.name}{FEATURED.includes(s.name) && <span className="ml-1 text-[9px] text-electric-soft">●</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="min-w-0 space-y-3">
        <p className="text-[13px] text-fg-muted">{spec?.description}</p>
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-fg-dim">Arguments (validated by the tool&apos;s Zod schema)</div>
            <textarea value={args} onChange={(e) => setArgs(e.target.value)} spellCheck={false} rows={10} aria-label="Tool arguments" className="focus-ring w-full rounded-lg border border-line bg-ink-900 p-3 font-mono text-[12px] text-fg outline-none" />
            <button onClick={run} disabled={busy} className="focus-ring mt-2 rounded-lg bg-electric px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Running…" : `Run ${tool}`}</button>
          </div>
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-fg-dim">JSON Schema sent to the LLM</div>
            <pre className="max-h-[260px] overflow-auto rounded-lg border border-line bg-ink-900/70 p-3 font-mono text-[11px] text-fg-muted">{JSON.stringify(spec?.parameters, null, 2)}</pre>
          </div>
        </div>
        {err && <p role="alert" className="rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-sm text-down">{err}</p>}
        {res && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
              <span className={res.ok ? "text-up" : "text-down"}>{res.ok ? "● OK" : "● TOOL RETURNED ERROR"}</span>
              <span className="text-fg-dim">{res.durationMs} ms</span>
              <span className="text-fg-dim">{res.bytes.toLocaleString()} bytes to LLM</span>
            </div>
            <div className="relative rounded-lg border border-violet/30 bg-violet/[0.04]">
              <div className="flex items-center justify-between border-b border-violet/20 px-3 py-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-violet">Exact tool message content the LLM receives</span>
                <CopyButton text={res.llmMessage} />
              </div>
              <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-[11px] text-fg-muted">{res.llmMessage}</pre>
            </div>
            <details className="rounded-lg border border-line">
              <summary className="cursor-pointer px-3 py-2 font-mono text-[11px] text-fg-dim">Pretty-printed result</summary>
              <pre className="max-h-[480px] overflow-auto p-3 font-mono text-[11px] text-fg-muted">{JSON.stringify(res.result, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
