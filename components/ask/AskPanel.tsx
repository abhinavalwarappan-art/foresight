"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Send, Sparkles } from "lucide-react";
import type { AskResult } from "@/lib/ai/agent";
import type { ApiResponse } from "@/lib/util/api";
import { cn } from "@/lib/util/cn";
import { KindTag } from "@/components/ui/badges";

interface Msg {
  role: "user" | "assistant";
  content: string;
  tools?: AskResult["tools"];
  provider?: string;
}

/** Renders **bold**, `- ` bullets and _italics_ safely as React nodes (no HTML injection). */
function RichText({ text }: { text: string }) {
  const inline = (s: string, k: number) =>
    s.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, i) =>
      part.startsWith("**") ? <b key={`${k}-${i}`} className="font-semibold text-fg">{part.slice(2, -2)}</b>
      : part.startsWith("_") && part.endsWith("_") && part.length > 2 ? <em key={`${k}-${i}`} className="text-fg-dim">{part.slice(1, -1)}</em>
      : part);
  return (
    <div className="space-y-2 text-[14px] leading-relaxed text-fg-muted">
      {text.split("\n\n").map((block, i) =>
        block.split("\n").every((l) => l.startsWith("- ")) ? (
          <ul key={i} className="space-y-1.5">{block.split("\n").map((l, j) => <li key={j} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-violet" /><span>{inline(l.slice(2), j)}</span></li>)}</ul>
        ) : <p key={i}>{block.split("\n").map((l, j) => <span key={j}>{inline(l, j)}{j < block.split("\n").length - 1 && <br />}</span>)}</p>,
      )}
    </div>
  );
}

function ToolResults({ tools }: { tools: AskResult["tools"] }) {
  const [open, setOpen] = useState(false);
  if (!tools.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-line bg-ink-900/60">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[10.5px] tracking-wider text-fg-dim hover:text-fg-muted" aria-expanded={open}>
        <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
        {tools.length} TOOL CALL{tools.length > 1 ? "S" : ""} · {[...new Set(tools.map((t) => t.name))].join(" · ")}
      </button>
      {open && (
        <div className="space-y-2 border-t border-line p-3">
          {tools.map((t, i) => (
            <details key={i} className="rounded-md bg-white/[0.02] px-2.5 py-1.5">
              <summary className="cursor-pointer font-mono text-[11px] text-fg-muted"><span className={t.ok ? "text-up" : "text-down"}>●</span> {t.name}({JSON.stringify(t.args).slice(0, 80)})</summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all font-mono text-[10.5px] text-fg-dim">{JSON.stringify(t.result, null, 2).slice(0, 3000)}</pre>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

export function AskPanel({ sport, suggestions, providerName }: { sport: string; suggestions: string[]; providerName: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const history = msgs.map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sport, question, history }) });
      const j = (await r.json()) as ApiResponse<AskResult>;
      setMsgs((m) => [...m, j.success ? { role: "assistant", content: j.data.answer, tools: j.data.tools, provider: j.data.provider } : { role: "assistant", content: `⚠ ${j.error}` }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "⚠ Network error — try again." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      {!msgs.length && (
        <div className="mb-8 text-center animate-fade-up">
          <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-violet/30 bg-violet/10 shadow-[0_0_40px_-10px_#9b7bff]"><Sparkles className="text-violet" size={22} /></div>
          <h1 className="text-[clamp(1.8rem,1.2rem+2vw,2.6rem)] font-semibold tracking-[-0.035em]">Ask your analyst</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-fg-muted">Every number comes from a tool call into the analytics engine — never from the model&apos;s memory. Expand any answer to see the evidence.</p>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {suggestions.map((s) => <button key={s} onClick={() => send(s)} className="focus-ring rounded-xl border border-line bg-white/[0.015] px-4 py-3 text-left text-[13px] text-fg-muted transition hover:border-violet/35 hover:text-fg">{s}</button>)}
          </div>
        </div>
      )}
      <div className="space-y-5">
        {msgs.map((m, i) => m.role === "user" ? (
          <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-md bg-electric/15 px-4 py-2.5 text-[14px] ring-1 ring-electric/25">{m.content}</div></div>
        ) : (
          <div key={i} className="surface p-5">
            <div className="mb-2 flex items-center gap-2"><Sparkles size={13} className="text-violet" /><span className="eyebrow">Foresight</span><KindTag kind="ai" />{m.provider && <span className="ml-auto font-mono text-[10px] text-fg-dim">{m.provider === "mock" ? "built-in analyst" : m.provider}</span>}</div>
            <RichText text={m.content} />
            {m.tools && <ToolResults tools={m.tools} />}
          </div>
        ))}
        {busy && <div className="surface flex items-center gap-3 p-5 text-sm text-fg-muted"><span className="size-2 rounded-full bg-violet animate-pulse-dot" /> Calling tools and reasoning over results…</div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="sticky bottom-20 mt-6 lg:bottom-6">
        <div className="surface-raised flex items-center gap-2 p-2 pl-4 focus-within:ring-1 focus-within:ring-violet/40">
          <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={800} placeholder="Should I trade…? Who benefits if…? Who should I start…?" aria-label="Ask a question" className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-dim" />
          <button disabled={busy || !input.trim()} className="focus-ring grid size-10 place-items-center rounded-lg bg-violet text-white transition hover:bg-violet/85 disabled:opacity-40" aria-label="Send"><Send size={15} /></button>
        </div>
        <p className="mt-2 text-center text-[10.5px] text-fg-dim">Analyst: {providerName}. Estimates, not guarantees. Market data is context, not betting advice.</p>
      </form>
    </div>
  );
}
