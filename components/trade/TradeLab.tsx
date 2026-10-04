"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Sparkles, X } from "lucide-react";
import type { TradeResult } from "@/lib/analytics/trade";
import type { TradeProposal } from "@/lib/analytics/trade-finder";
import type { PlayerSummary } from "@/lib/services/core";
import type { ApiResponse } from "@/lib/util/api";
import { cn } from "@/lib/util/cn";
import { Delta, StatusPill } from "@/components/ui/badges";
import { Skeleton } from "@/components/ui/cards";
import { TradeResultView } from "./TradeResultView";

interface TeamLite {
  id: string;
  name: string;
  manager: string;
  isUser: boolean;
  players: PlayerSummary[];
}
type Proposal = TradeProposal & { partnerName: string; giveP: PlayerSummary[]; getP: PlayerSummary[] };

function RosterPicker({ team, selected, toggle, label }: { team: TeamLite; selected: string[]; toggle: (id: string) => void; label: string }) {
  return (
    <div className="surface flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div><div className="eyebrow">{label}</div><div className="text-sm font-medium">{team.name}</div></div>
        <span className="font-mono text-[11px] text-fg-dim">{selected.length} selected</span>
      </div>
      <ul className="max-h-[420px] overflow-y-auto p-2">
        {team.players.map((p) => {
          const on = selected.includes(p.id);
          return (
            <li key={p.id}>
              <button onClick={() => toggle(p.id)} aria-pressed={on} className={cn("focus-ring flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors", on ? "bg-electric/[0.12] ring-1 ring-electric/40" : "hover:bg-white/[0.03]")}>
                <span className={cn("grid size-4 place-items-center rounded border text-[10px]", on ? "border-electric bg-electric text-white" : "border-line-strong")}>{on ? "✓" : ""}</span>
                <span className="w-7 font-mono text-[11px] text-fg-dim">{p.position}</span>
                <span className="flex-1 truncate">{p.name} <StatusPill status={p.status} /></span>
                <span className="num text-xs text-fg-muted">{p.value}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TradeLab({ sport, teams, userTeamId }: { sport: string; teams: TeamLite[]; userTeamId: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab = sp.get("tab") === "finder" ? "finder" : "builder";
  const me = teams.find((t) => t.id === userTeamId)!;
  const others = teams.filter((t) => t.id !== userTeamId);

  const initial = useMemo(() => {
    const give = (sp.get("give") ?? "").split(",").filter(Boolean);
    const get = (sp.get("get") ?? "").split(",").filter(Boolean);
    const partner = others.find((t) => t.players.some((p) => get.includes(p.id)))?.id ?? others[0].id;
    return { give, get, partner };
  }, [sp, others]);

  const [partnerId, setPartnerId] = useState(initial.partner);
  const [give, setGive] = useState<string[]>(initial.give);
  const [get, setGet] = useState<string[]>(initial.get);
  const [result, setResult] = useState<{ result: TradeResult; players: Record<string, PlayerSummary> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const partner = teams.find((t) => t.id === partnerId)!;

  const analyze = useCallback(async (g = give, r = get, pid = partnerId) => {
    if (!g.length || !r.length) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sport, teamA: userTeamId, teamB: pid, aGives: g, bGives: r }) });
      const json = (await res.json()) as ApiResponse<{ result: TradeResult; players: Record<string, PlayerSummary> }>;
      if (!json.success) throw new Error(json.error);
      setResult(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trade analysis failed.");
    } finally {
      setLoading(false);
    }
  }, [give, get, partnerId, sport, userTeamId]);

  useEffect(() => {
    if (initial.give.length && initial.get.length) analyze(initial.give, initial.get, initial.partner);
    // run once for deep links
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTab = (t: string) => {
    const n = new URLSearchParams(sp.toString());
    n.set("tab", t);
    router.replace(`${path}?${n}`, { scroll: false });
  };
  const toggle = (list: string[], set: (v: string[]) => void) => (id: string) => {
    setResult(null);
    set(list.includes(id) ? list.filter((x) => x !== id) : list.length >= 5 ? list : [...list, id]);
  };
  const lookup = (id: string) => teams.flatMap((t) => t.players).find((p) => p.id === id);

  const openProposal = (p: Proposal) => {
    setPartnerId(p.partnerId);
    setGive(p.give);
    setGet(p.get);
    setTab("builder");
    analyze(p.give, p.get, p.partnerId);
  };

  return (
    <div>
      <div role="tablist" className="mb-6 inline-flex rounded-lg border border-line bg-ink-900 p-0.5">
        {[["builder", "Trade builder"], ["finder", "Find me a trade"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("focus-ring rounded-md px-3.5 py-1.5 text-[13px] transition-colors", tab === k ? "bg-white/[0.08] text-fg" : "text-fg-dim hover:text-fg-muted")}>{l}</button>
        ))}
      </div>

      {tab === "builder" ? (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
            <RosterPicker team={me} selected={give} toggle={toggle(give, setGive)} label="You send" />
            <div className="flex flex-col items-center justify-center gap-3 py-2">
              <span className="grid size-11 place-items-center rounded-full border border-line bg-ink-850 text-electric-soft"><ArrowLeftRight size={18} /></span>
            </div>
            <div className="space-y-2">
              <select value={partnerId} onChange={(e) => { setPartnerId(e.target.value); setGet([]); setResult(null); }} aria-label="Trade partner" className="focus-ring h-10 w-full rounded-lg border border-line bg-ink-900 px-3 text-sm outline-none">
                {others.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.manager}</option>)}
              </select>
              <RosterPicker team={partner} selected={get} toggle={toggle(get, setGet)} label="You receive" />
            </div>
          </div>

          <div className="surface flex flex-wrap items-center gap-3 p-4">
            <div className="flex flex-1 flex-wrap items-center gap-2 text-sm">
              {give.map((id) => <Chip key={id} name={lookup(id)?.name ?? id} onRemove={() => toggle(give, setGive)(id)} />)}
              {!give.length && <span className="text-fg-dim">Pick players to send</span>}
              <ArrowLeftRight size={14} className="mx-1 text-fg-dim" />
              {get.map((id) => <Chip key={id} name={lookup(id)?.name ?? id} onRemove={() => toggle(get, setGet)(id)} accent />)}
              {!get.length && <span className="text-fg-dim">Pick players to receive</span>}
            </div>
            <button disabled={!give.length || !get.length || loading} onClick={() => analyze()} className="focus-ring rounded-lg bg-electric px-4 py-2 text-sm font-medium text-white shadow-[0_0_24px_-6px_#4f7cff] transition hover:bg-electric-soft disabled:cursor-not-allowed disabled:opacity-40">
              {loading ? "Analyzing…" : "Analyze both sides"}
            </button>
          </div>

          {error && <p className="rounded-lg border border-down/30 bg-down/10 px-4 py-3 text-sm text-down" role="alert">{error}</p>}
          {loading && !result && <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-[460px]" /><Skeleton className="h-[460px]" /></div>}
          {result && <TradeResultView result={result.result} players={result.players} aName="You" bName={partner.name} />}
          {!result && !loading && !error && (
            <p className="text-center text-sm text-fg-dim">Any shape works — 1-for-1, 2-for-1, 3-for-2. Each side is evaluated on its own lineup, depth and title odds.</p>
          )}
        </div>
      ) : (
        <Finder sport={sport} group={sp.get("group")} onOpen={openProposal} />
      )}
    </div>
  );
}

function Chip({ name, onRemove, accent }: { name: string; onRemove: () => void; accent?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-1.5 text-xs", accent ? "border-violet/30 bg-violet/10" : "border-electric/30 bg-electric/10")}>
      {name}
      <button onClick={onRemove} aria-label={`Remove ${name}`} className="grid size-4 place-items-center rounded-full hover:bg-white/10"><X size={10} /></button>
    </span>
  );
}

function Finder({ sport, group, onOpen }: { sport: string; group: string | null; onOpen: (p: Proposal) => void }) {
  const [data, setData] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    setData(null);
    fetch(`/api/trade/find?sport=${sport}${group ? `&group=${group}` : ""}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<ApiResponse<Proposal[]>>)
      .then((j) => (j.success ? setData(j.data) : setError(j.error)))
      .catch((e) => { if (e.name !== "AbortError") setError("Couldn't scan the league."); });
    return () => ctrl.abort();
  }, [sport, group]);

  if (error) return <p className="text-sm text-down">{error}</p>;
  if (!data) return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm text-fg-muted"><Sparkles size={14} className="text-violet" /> Scanning every roster for complementary surplus ↔ need…</p>
      <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-64" />)}</div>
    </div>
  );
  if (!data.length) return <p className="text-sm text-fg-muted">No trade improves your team without clearly hurting the other side. That&apos;s a sign your roster is efficiently built.</p>;

  return (
    <div className="space-y-8">
      {group && <p className="text-sm text-fg-muted">Focused on upgrading <b className="text-fg">{group}</b>.</p>}
      {(["CONSERVATIVE", "BALANCED", "AGGRESSIVE"] as const).map((style) => {
        const list = data.filter((p) => p.style === style);
        if (!list.length) return null;
        return (
          <section key={style}>
            <div className="mb-3 flex items-baseline gap-3">
              <h2 className="font-mono text-xs font-semibold tracking-[0.16em] text-fg">{style}</h2>
              <span className="text-xs text-fg-dim">{style === "CONSERVATIVE" ? "High fairness, easy yes" : style === "BALANCED" ? "Meaningful upgrade, fair price" : "Biggest upgrade, harder sell"}</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {list.map((p, i) => (
                <article key={i} className="surface p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="eyebrow">with {p.partnerName}</span>
                    <span className={cn("font-mono text-[11px] font-semibold", p.result.verdict === "WIN-WIN" ? "text-up" : "text-fg-muted")}>{p.result.verdict}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <div>{p.giveP.map((x) => <div key={x.id} className="text-sm text-fg-muted">{x.name} <span className="font-mono text-[10px] text-fg-dim">{x.position}</span></div>)}</div>
                    <ArrowLeftRight size={14} className="text-fg-dim" />
                    <div>{p.getP.map((x) => <div key={x.id} className="text-base font-medium">{x.name} <span className="font-mono text-[10px] text-fg-dim">{x.position}</span></div>)}</div>
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-3 text-xs">
                    <div><div className="eyebrow">You</div><Delta value={p.result.a.benefitPct} suffix="%" /></div>
                    <div><div className="eyebrow">Them</div><Delta value={p.result.b.benefitPct} suffix="%" /></div>
                    <div><div className="eyebrow">Fair</div><span className="num">{p.result.fairness}</span></div>
                    <div><div className="eyebrow">Accept est.</div><span className="num">{p.result.acceptance.level}</span></div>
                  </div>
                  <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
                    <div><div className="eyebrow mb-1">Why it helps you</div><ul className="space-y-0.5 text-fg-muted">{p.why.slice(0, 3).map((w) => <li key={w}>· {w}</li>)}</ul></div>
                    <div><div className="eyebrow mb-1">Why they might accept</div><ul className="space-y-0.5 text-fg-muted">{p.whyTheyAccept.slice(0, 3).map((w) => <li key={w}>· {w}</li>)}</ul></div>
                  </div>
                  <button onClick={() => onOpen(p)} className="focus-ring mt-4 w-full rounded-lg border border-line py-2 text-xs text-fg-muted transition hover:border-electric/40 hover:text-fg">Open full analysis →</button>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
