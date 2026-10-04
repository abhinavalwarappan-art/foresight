"use client";

import { useEffect, useMemo, useState } from "react";
import type { ScenarioResult, ScenarioType } from "@/lib/analytics/scenario";
import type { PlayerSummary } from "@/lib/services/core";
import type { ApiResponse } from "@/lib/util/api";
import { cn } from "@/lib/util/cn";
import { Delta, KindTag } from "@/components/ui/badges";
import { CausalChain, Skeleton } from "@/components/ui/cards";

type Impact = ScenarioResult["impacts"][number] & { player: PlayerSummary; ownerName: string | null };
type Result = Omit<ScenarioResult, "subject" | "impacts"> & { subject: Impact; impacts: Impact[] };

export interface ScenarioPreset {
  label: string;
  type: ScenarioType;
  playerId: string;
  minutes?: number;
}

export function ScenarioEngine({ sport, players, presets }: { sport: string; players: { id: string; name: string; pos: string; team: string }[]; presets: ScenarioPreset[] }) {
  const [type, setType] = useState<ScenarioType>(presets[0]?.type ?? "out");
  const [playerId, setPlayerId] = useState(presets[0]?.playerId ?? players[0].id);
  const [minutes, setMinutes] = useState(30);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (t = type, pid = playerId, m = minutes) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/scenario", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sport, type: t, playerId: pid, minutes: t === "minutes" ? m : undefined }) });
      const j = (await r.json()) as ApiResponse<Result>;
      if (!j.success) throw new Error(j.error);
      setRes(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scenario failed.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { run(); /* initial preset */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return players.filter((p) => !s || `${p.name} ${p.team}`.toLowerCase().includes(s)).slice(0, 60);
  }, [q, players]);
  const types: [ScenarioType, string][] = sport === "nba" ? [["out", "is OUT"], ["starts", "STARTS"], ["minutes", "plays N minutes"]] : [["out", "is OUT"], ["starts", "STARTS"]];
  const max = Math.max(1, ...(res?.impacts.map((i) => Math.abs(i.delta)) ?? [1]));

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <div className="surface p-4">
          <div className="eyebrow mb-3">Build a scenario</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a player…" aria-label="Find a player" className="focus-ring mb-2 h-9 w-full rounded-lg border border-line bg-ink-900 px-3 text-sm outline-none placeholder:text-fg-dim" />
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} size={7} aria-label="Player" className="focus-ring w-full rounded-lg border border-line bg-ink-900 p-1 text-sm outline-none">
            {filtered.map((p) => <option key={p.id} value={p.id} className="rounded px-2 py-1">{p.pos} · {p.name} · {p.team}</option>)}
          </select>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {types.map(([t, l]) => <button key={t} onClick={() => setType(t)} className={cn("focus-ring rounded-md border px-2.5 py-1 text-xs", type === t ? "border-electric/50 bg-electric/15 text-fg" : "border-line text-fg-muted hover:text-fg")}>{l}</button>)}
          </div>
          {type === "minutes" && (
            <label className="mt-3 block text-xs text-fg-muted">Minutes: <span className="num text-fg">{minutes}</span>
              <input type="range" min={10} max={42} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="mt-1 w-full accent-[#4f7cff]" />
            </label>
          )}
          <button onClick={() => run()} disabled={loading} className="focus-ring mt-4 w-full rounded-lg bg-electric py-2 text-sm font-medium text-white shadow-[0_0_24px_-6px_#4f7cff] hover:bg-electric-soft disabled:opacity-50">{loading ? "Recalculating…" : "Run scenario"}</button>
        </div>
        <div className="surface p-4">
          <div className="eyebrow mb-2">Try these</div>
          <div className="flex flex-col gap-1.5">
            {presets.map((p) => (
              <button key={p.label} onClick={() => { setType(p.type); setPlayerId(p.playerId); if (p.minutes) setMinutes(p.minutes); run(p.type, p.playerId, p.minutes ?? minutes); }} className="focus-ring rounded-lg border border-line px-3 py-2 text-left text-[13px] text-fg-muted transition hover:border-line-strong hover:text-fg">{p.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-4">
        {error && <p role="alert" className="rounded-lg border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">{error}</p>}
        {loading && !res && <Skeleton className="h-[480px]" />}
        {res && (
          <>
            <div className="surface-raised grid gap-6 p-6 md:grid-cols-[1.1fr_1fr]">
              <div>
                <div className="eyebrow mb-2 flex items-center gap-2">Cause → effect <KindTag kind="projected" /></div>
                <CausalChain steps={res.chain} tone="cyan" />
              </div>
              <div className="rounded-xl border border-line bg-white/[0.02] p-4">
                <div className="eyebrow mb-1">Subject</div>
                <div className="text-lg font-medium">{res.subject.player.name}</div>
                <div className="num mt-1 text-sm text-fg-muted">{res.subject.before} → <span className="text-fg">{res.subject.after}</span> <Delta value={res.subject.delta} className="ml-1" /></div>
                {res.subject.usage.map((u) => <div key={u.label} className="num mt-1 text-xs text-fg-dim">{u.label} {u.before}{u.unit} → {u.after}{u.unit}</div>)}
              </div>
            </div>

            <div className="surface overflow-x-auto">
              <div className="flex items-center justify-between px-5 pt-4"><div className="eyebrow">Biggest fantasy beneficiaries</div><span className="text-[11px] text-fg-dim">This week · per-game projection</span></div>
              <table className="mt-2 w-full min-w-[760px] text-[13px]">
                <thead><tr className="eyebrow border-b border-line [&>th]:px-5 [&>th]:py-2 [&>th]:text-left [&>th]:font-normal"><th>Player</th><th>Usage shift</th><th>Projection</th><th className="w-40">Impact</th><th>Rank</th><th>Status</th></tr></thead>
                <tbody>
                  {res.impacts.map((i) => (
                    <tr key={i.playerId} className="border-b border-line/60 [&>td]:px-5 [&>td]:py-3">
                      <td><div className="font-medium">{i.player.name}</div><div className="font-mono text-[10.5px] text-fg-dim">{i.player.position} · {i.player.teamAbbr}</div></td>
                      <td className="num whitespace-nowrap text-xs text-fg-muted">{i.usage.slice(0, 2).map((u) => <div key={u.label}>{u.label} {u.before}{u.unit} → <span className="text-fg">{u.after}{u.unit}</span></div>)}</td>
                      <td className="num">{i.before} → <b className="text-cyan">{i.after}</b></td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-white/[0.05]"><div className={cn("h-full rounded-full", i.delta > 0 ? "bg-up" : "bg-down")} style={{ width: `${(Math.abs(i.delta) / max) * 100}%` }} /></div>
                          <Delta value={i.delta} className="w-12 text-right text-xs" />
                        </div>
                      </td>
                      <td className="num text-xs">{i.player.position}{i.rankBefore} → <span className="text-fg">{i.player.position}{i.rankAfter}</span></td>
                      <td className="text-xs">{i.isFreeAgent ? <span className={cn("font-mono font-semibold", i.waiverPriority === "HIGH" ? "text-cyan" : "text-fg-muted")}>FA · {i.waiverPriority} priority</span> : <span className="text-fg-dim">{i.ownerName}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!res.impacts.length && <p className="p-8 text-center text-sm text-fg-muted">No teammate moves meaningfully in this scenario.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
