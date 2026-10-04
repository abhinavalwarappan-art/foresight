"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import type { PlayerSummary } from "@/lib/services/core";
import { cn } from "@/lib/util/cn";
import { Delta, SignalTag, StatusPill, StockBadge, TrendBadge } from "@/components/ui/badges";
import { Meter } from "@/components/ui/meters";
import { PlayerAvatar, TeamBadge } from "./identity";

const SORTS = {
  value: { label: "Value", get: (p: PlayerSummary) => p.value },
  proj: { label: "Projection", get: (p: PlayerSummary) => p.proj.weekly },
  opp: { label: "Opportunity", get: (p: PlayerSummary) => p.opp.score },
  breakout: { label: "Breakout", get: (p: PlayerSummary) => p.breakout.score },
  delta: { label: "Model vs market", get: (p: PlayerSummary) => p.rankDelta },
} as const;
type SortKey = keyof typeof SORTS;

/** Filters live in the URL so views are shareable. */
export function PlayerTable({ players, sport, positions }: { players: PlayerSummary[]; sport: string; positions: string[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const pos = sp.get("pos") ?? "ALL";
  const own = sp.get("own") ?? "all";
  const sort = (sp.get("sort") as SortKey) in SORTS ? (sp.get("sort") as SortKey) : "value";
  const q = sp.get("q") ?? "";
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp.toString());
    if (!v || v === "ALL" || v === "all") n.delete(k);
    else n.set(k, v);
    router.replace(`${path}?${n}`, { scroll: false });
  };

  const rows = useMemo(() => {
    const s = q.toLowerCase();
    return players
      .filter((p) => pos === "ALL" || p.position === pos)
      .filter((p) => own === "all" || (own === "fa" ? !p.owner : own === "mine" ? p.ownerIsUser : Boolean(p.owner)))
      .filter((p) => !s || `${p.name} ${p.teamAbbr}`.toLowerCase().includes(s))
      .sort((a, b) => SORTS[sort].get(b) - SORTS[sort].get(a))
      .slice(0, 120);
  }, [players, pos, own, sort, q]);

  const chip = (active: boolean) => cn("focus-ring rounded-md px-2.5 py-1 text-xs transition-colors", active ? "bg-white/[0.08] text-fg" : "text-fg-dim hover:text-fg-muted");

  return (
    <div className="surface overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
        <div className="flex rounded-lg border border-line p-0.5">
          {["ALL", ...positions].map((p) => <button key={p} className={chip(pos === p)} onClick={() => set("pos", p)}>{p}</button>)}
        </div>
        <div className="flex rounded-lg border border-line p-0.5">
          {[["all", "All"], ["fa", "Free agents"], ["mine", "My team"], ["owned", "Rostered"]].map(([k, l]) => <button key={k} className={chip(own === k)} onClick={() => set("own", k)}>{l}</button>)}
        </div>
        <input defaultValue={q} onChange={(e) => set("q", e.target.value)} placeholder="Filter by name or team" aria-label="Filter players" className="focus-ring h-8 w-48 rounded-lg border border-line bg-ink-900 px-3 text-xs outline-none placeholder:text-fg-dim" />
        <label className="ml-auto flex items-center gap-2 text-xs text-fg-dim">
          Sort
          <select value={sort} onChange={(e) => set("sort", e.target.value)} className="focus-ring h-8 rounded-lg border border-line bg-ink-900 px-2 text-xs text-fg outline-none">
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-[13px]">
          <thead>
            <tr className="eyebrow border-b border-line [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-normal">
              <th className="w-[26%]">Player</th>
              <th>Value</th>
              <th><span className="text-projected">Proj</span> <span className="normal-case tracking-normal">flr–med–ceil</span></th>
              <th>Opportunity</th>
              <th>Trend</th>
              <th>Market → Model</th>
              <th>Signal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="group border-b border-line/60 transition-colors hover:bg-white/[0.02] [&>td]:px-3 [&>td]:py-2.5">
                <td>
                  <Link href={`/${sport}/players/${p.id}`} className="focus-ring flex items-center gap-3 rounded">
                    <PlayerAvatar first={p.firstName} last={p.lastName} color={p.teamColor} size={30} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-medium group-hover:text-white">{p.name} <StatusPill status={p.status} /></span>
                      <span className="flex items-center gap-2 text-[11px] text-fg-dim"><span className="font-mono text-fg-muted">{p.position}</span><TeamBadge abbr={p.teamAbbr} color={p.teamColor} /><span className="truncate">{p.owner ? (p.ownerIsUser ? "Your team" : p.owner) : <span className="text-cyan/80">FA</span>}</span></span>
                    </span>
                  </Link>
                </td>
                <td><span className="num text-base font-semibold">{p.value}</span> <Delta value={p.valueTrend} decimals={0} className="text-[11px]" /></td>
                <td className="num"><span className="text-fg-dim">{p.proj.floor}</span>–<span className="font-semibold text-cyan">{p.proj.median}</span>–<span className="text-fg-dim">{p.proj.ceiling}</span>{p.proj.gamesInWeek > 1 && <span className="ml-1 text-[10px] text-fg-dim">×{p.proj.gamesInWeek}</span>}</td>
                <td><div className="flex items-center gap-2"><Meter value={p.opp.score} segments={10} className="w-20" /><span className="num text-xs text-fg-muted">{p.opp.score}</span></div></td>
                <td><TrendBadge trend={p.opp.trend} /></td>
                <td className="num text-xs"><span className="text-fg-dim">{p.position}{p.marketPosRank}</span> → <span className="text-fg">{p.position}{p.modelPosRank}</span> <Delta value={p.rankDelta} decimals={0} className="ml-1" /></td>
                <td><div className="flex flex-wrap items-center gap-1"><StockBadge label={p.label} />{p.tags.slice(0, 1).map((t) => <SignalTag key={t} tag={t} />)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-10 text-center text-sm text-fg-muted">No players match these filters. Try clearing the position or ownership filter.</p>}
      </div>
    </div>
  );
}
