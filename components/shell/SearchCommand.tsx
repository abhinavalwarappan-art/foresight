"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/util/cn";

export interface SearchItem {
  id: string;
  name: string;
  pos: string;
  team: string;
  owner: string | null;
}

/** ⌘K player search. Index is passed from the server; filtering is local and instant. */
export function SearchCommand({ sport, items }: { sport: string; items: SearchItem[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 10);
    else setQ("");
  }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items.slice(0, 8);
    return items.filter((i) => `${i.name} ${i.team} ${i.pos}`.toLowerCase().includes(s)).slice(0, 10);
  }, [q, items]);

  const go = (id: string) => {
    setOpen(false);
    router.push(`/${sport}/players/${id}`);
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="focus-ring flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-line bg-ink-900 px-3 text-left text-[13px] text-fg-dim transition-colors hover:border-line-strong" aria-label="Search players">
        <Search size={14} />
        <span className="flex-1 truncate">Search players…</span>
        <kbd className="hidden rounded border border-line px-1.5 font-mono text-[10px] sm:inline">⌘K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/70 px-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="Player search" className="surface-raised w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search size={15} className="text-fg-dim" />
              <input
                ref={input}
                value={q}
                onChange={(e) => { setQ(e.target.value); setIdx(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
                  if (e.key === "Enter" && results[idx]) go(results[idx].id);
                }}
                placeholder="Player, team or position"
                className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-dim"
              />
            </div>
            <ul className="max-h-80 overflow-y-auto p-1.5">
              {results.map((r, i) => (
                <li key={r.id}>
                  <button onMouseEnter={() => setIdx(i)} onClick={() => go(r.id)} className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm", i === idx ? "bg-white/[0.06]" : "")}>
                    <span className="w-8 font-mono text-[11px] text-fg-dim">{r.pos}</span>
                    <span className="flex-1">{r.name}</span>
                    <span className="font-mono text-[11px] text-fg-dim">{r.team}</span>
                    <span className="w-28 truncate text-right text-[11px] text-fg-dim">{r.owner ?? "Free agent"}</span>
                  </button>
                </li>
              ))}
              {!results.length && <li className="px-3 py-6 text-center text-sm text-fg-dim">No players match “{q}”.</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
