"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

const QUERIES = [
  "Should I trade Player A for Player B?",
  "Who benefits if Player X sits tonight?",
  "Find me a trade my opponent would actually accept.",
  "Which RB is about to break out?",
  "Start the high-floor WR or the boom-or-bust one?",
];

/** Types example questions, one at a time. Static under reduced motion. */
export function QueryTicker() {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const [reduce, setReduce] = useState(false);
  useEffect(() => setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  useEffect(() => {
    if (reduce) return;
    const full = QUERIES[i];
    const id = setTimeout(() => {
      if (n < full.length) setN(n + 1);
      else { setN(0); setI((i + 1) % QUERIES.length); }
    }, n < full.length ? 34 : 2200);
    return () => clearTimeout(id);
  }, [i, n, reduce]);
  const text = reduce ? QUERIES[0] : QUERIES[i].slice(0, n);
  return (
    <div className="surface-raised mx-auto flex max-w-xl items-center gap-3 px-4 py-3 text-left">
      <Sparkles size={16} className="shrink-0 text-violet" />
      <span className="min-h-[1.4em] flex-1 text-[15px] text-fg" aria-live="polite">{text}<span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-electric animate-pulse-dot" /></span>
      <kbd className="hidden rounded-md border border-line px-2 py-0.5 font-mono text-[10px] text-fg-dim sm:block">ASK</kbd>
    </div>
  );
}
