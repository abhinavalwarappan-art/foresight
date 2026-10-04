"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); })}
      className="rounded border border-line bg-ink-850 px-1.5 py-0.5 font-mono text-[10px] text-fg-dim hover:text-fg"
    >
      {done ? "copied" : "copy"}
    </button>
  );
}
