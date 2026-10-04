"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { cn } from "@/lib/util/cn";

interface Opt { id: string; label: string; teamId?: string; teamIds?: string[] }

/** All inspector selection state lives in the URL, so any view is linkable. */
export function Selectors({ teams, players, games, providers, hasLeague }: { teams: Opt[]; players: Opt[]; games: Opt[]; providers: string[]; hasLeague: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const sport = sp.get("sport") ?? "nfl";
  const team = sp.get("team") ?? "";
  const [q, setQ] = useState("");
  const set = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k));
    router.replace(`${path}?${n}`, { scroll: false });
  };
  const playerOpts = useMemo(() => players.filter((p) => (!team || p.teamId === team) && (!q || p.label.toLowerCase().includes(q.toLowerCase()))).slice(0, 400), [players, team, q]);
  const gameOpts = useMemo(() => games.filter((g) => !team || g.teamIds?.includes(team)), [games, team]);
  const sel = "focus-ring h-9 w-full rounded-lg border border-line bg-ink-900 px-2.5 text-[13px] outline-none";
  const label = "mb-1 block font-mono text-[10px] uppercase tracking-wider text-fg-dim";

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[auto_1fr_1fr_1.4fr_1.2fr_auto]">
      <div>
        <span className={label}>Sport</span>
        <div className="inline-flex rounded-lg border border-line p-0.5">
          {["nfl", "nba"].map((s) => <button key={s} onClick={() => router.replace(`${path}?sport=${s}`)} className={cn("rounded-md px-3 py-1.5 font-mono text-xs", sport === s ? "bg-white/10 text-fg" : "text-fg-dim")}>{s.toUpperCase()}</button>)}
        </div>
      </div>
      <label><span className={label}>Provider filter</span>
        <select className={sel} value={sp.get("provider") ?? ""} onChange={(e) => set({ provider: e.target.value || null })}>
          <option value="">All providers</option>
          {providers.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label><span className={label}>Team</span>
        <select className={sel} value={team} onChange={(e) => set({ team: e.target.value || null, game: null })}>
          <option value="">All teams</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      <div>
        <span className={label}>Player ({playerOpts.length})</span>
        <div className="flex gap-1.5">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter…" aria-label="Filter players" className={cn(sel, "w-24 shrink-0")} />
          <select className={sel} value={sp.get("player") ?? ""} onChange={(e) => set({ player: e.target.value || null })}>
            <option value="">— select —</option>
            {playerOpts.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>
      <label><span className={label}>Game</span>
        <select className={sel} value={sp.get("game") ?? ""} onChange={(e) => set({ game: e.target.value || null })}>
          <option value="">— none —</option>
          {gameOpts.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      </label>
      <div>
        <span className={label}>League</span>
        <button disabled={!hasLeague} onClick={() => set({ league: sp.get("league") ? null : "1" })} className={cn("h-9 rounded-lg border px-3 text-[13px]", sp.get("league") ? "border-electric/50 bg-electric/15 text-fg" : "border-line text-fg-muted", !hasLeague && "opacity-40")}>
          {sp.get("league") ? "Hide league" : "Inspect league"}
        </button>
      </div>
    </div>
  );
}
