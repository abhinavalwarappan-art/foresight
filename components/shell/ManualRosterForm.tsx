"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApiResponse } from "@/lib/util/api";

interface SearchPlayer { id: string; name: string; position: string; teamId: string }

export function ManualRosterForm({ initialSport = "nfl" }: { initialSport?: "nfl" | "nba" }) {
  const router = useRouter();
  const [sport, setSport] = useState<"nfl" | "nba">(initialSport);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPlayer[]>([]);
  const [selected, setSelected] = useState<SearchPlayer[]>([]);
  const [scoring, setScoring] = useState(initialSport === "nfl" ? "ppr" : "nba_points");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setBusy(true); setError(null);
    const r = await fetch(`/api/manual?sport=${sport}&q=${encodeURIComponent(query)}`);
    const j = await r.json() as ApiResponse<SearchPlayer[]>;
    setBusy(false);
    if (!j.success) return setError(j.error);
    setResults(j.data.filter((p) => !selected.some((s) => s.id === p.id)));
  };
  const save = async () => {
    setBusy(true); setError(null);
    const r = await fetch("/api/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sport, playerIds: selected.map((p) => p.id), scoring }) });
    const j = await r.json() as ApiResponse<{ connected: boolean }>;
    setBusy(false);
    if (!j.success) return setError(j.error);
    router.push(`/${sport}/roster`);
  };
  const changeSport = (next: "nfl" | "nba") => { setSport(next); setSelected([]); setResults([]); setScoring(next === "nfl" ? "ppr" : "nba_points"); };

  return <div className="surface p-5">
    <div className="mb-4 flex items-center justify-between"><div><div className="eyebrow">Select my players</div><div className="font-medium">Temporary manual analysis roster</div></div><div className="flex rounded-lg border border-line p-0.5">{(["nfl", "nba"] as const).map((s) => <button type="button" key={s} onClick={() => changeSport(s)} className={`rounded-md px-3 py-1 font-mono text-xs ${sport === s ? "bg-white/10 text-fg" : "text-fg-dim"}`}>{s.toUpperCase()}</button>)}</div></div>
    <form onSubmit={(e) => { e.preventDefault(); void search(); }} className="flex gap-2"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search real players by name" className="focus-ring h-10 flex-1 rounded-lg border border-line bg-ink-900 px-3 text-sm outline-none"/><button disabled={busy || query.trim().length < 2} className="rounded-lg border border-electric/40 px-4 text-sm text-electric-soft disabled:opacity-40">Search</button></form>
    {results.length > 0 && <ul className="mt-3 max-h-48 space-y-1 overflow-auto">{results.map((p) => <li key={p.id} className="flex items-center justify-between rounded border border-line px-3 py-2 text-sm"><span>{p.name} <span className="text-xs text-fg-dim">{p.position}</span></span><button type="button" onClick={() => { setSelected([...selected, p]); setResults(results.filter((x) => x.id !== p.id)); }} className="text-xs text-electric-soft">Add</button></li>)}</ul>}
    {selected.length > 0 && <><div className="eyebrow mb-2 mt-4">Selected ({selected.length})</div><div className="flex flex-wrap gap-2">{selected.map((p) => <button type="button" key={p.id} onClick={() => setSelected(selected.filter((x) => x.id !== p.id))} className="rounded border border-line px-2 py-1 text-xs">{p.name} ×</button>)}</div><div className="mt-4 flex items-center gap-3"><select value={scoring} onChange={(e) => setScoring(e.target.value)} className="rounded-lg border border-line bg-ink-900 px-3 py-2 text-sm">{sport === "nfl" ? <><option value="standard">Standard</option><option value="half">Half PPR</option><option value="ppr">PPR</option></> : <option value="nba_points">NBA points</option>}</select><button type="button" disabled={busy} onClick={save} className="rounded-lg bg-electric px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Analyze my team</button></div></>}
    {error && <p className="mt-3 text-sm text-down">{error}</p>}
  </div>;
}
