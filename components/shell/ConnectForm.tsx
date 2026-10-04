"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApiResponse } from "@/lib/util/api";
import { cn } from "@/lib/util/cn";

interface League { id: string; name: string; teams: number; season: number; scoring: string; status: string }
interface Connection { leagueId: string; userId?: string; syncedAt?: string }

export function ConnectForm({ liveMode, initialConnection }: { liveMode: boolean; initialConnection: Connection | null }) {
  const router = useRouter();
  const sport = "nfl" as const;
  const [username, setUsername] = useState("");
  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [connection, setConnection] = useState(initialConnection);

  const post = async <T,>(body: object) => {
    const r = await fetch("/api/league/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return (await r.json()) as ApiResponse<T>;
  };
  const lookup = async () => {
    setBusy(true); setMsg(null); setLeagues(null);
    const j = await post<{ userId: string; leagues: League[] }>({ action: "lookup", sport, username });
    setBusy(false);
    if (!j.success) return setMsg({ ok: false, text: j.error });
    setUserId(j.data.userId);
    setLeagues(j.data.leagues);
    if (!j.data.leagues.length) setMsg({ ok: false, text: `No ${sport.toUpperCase()} leagues found for this season.` });
  };
  const sync = async () => {
    if (!connection?.userId) return;
    setBusy(true); setMsg(null);
    const j = await post<{ syncedAt: string }>({ action: "sync", sport, leagueId: connection.leagueId, userId: connection.userId });
    setBusy(false);
    if (!j.success) return setMsg({ ok: false, text: j.error });
    setConnection({ ...connection, syncedAt: j.data.syncedAt });
    setMsg({ ok: true, text: "League synced from Sleeper." });
    router.refresh();
  };
  const connect = async (leagueId: string) => {
    setBusy(true);
    const j = await post({ action: "connect", sport, leagueId, userId });
    setBusy(false);
    if (!j.success) return setMsg({ ok: false, text: j.error });
    setConnection({ leagueId, userId, syncedAt: new Date().toISOString() });
    setMsg({ ok: true, text: liveMode ? "Connected. Loading your league…" : "Saved. Set DATA_MODE=live to use it — the app stays on mock data until then." });
    if (liveMode) router.push(`/${sport}`);
  };

  return (
    <div className="space-y-6">
      <div className="surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <div><div className="eyebrow">Connect Sleeper</div><div className="font-medium">Public read-only — no password needed</div></div>
          <span className="rounded-md border border-line px-3 py-1 font-mono text-xs text-fg">NFL</span>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); lookup(); }} className="flex gap-2">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Sleeper username" aria-label="Sleeper username" className="focus-ring h-10 flex-1 rounded-lg border border-line bg-ink-900 px-3 text-sm outline-none placeholder:text-fg-dim" />
          <button disabled={busy || username.length < 2} className="focus-ring rounded-lg bg-electric px-4 text-sm font-medium text-white disabled:opacity-40">{busy ? "…" : "Find My Leagues"}</button>
        </form>
        {leagues && leagues.length > 0 && (
          <><div className="eyebrow mt-5 mb-2">Your Sleeper leagues</div><ul className="space-y-2">
            {leagues.map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                <span>{l.name} <span className="block text-xs text-fg-dim">{l.season} · {l.teams} teams · {l.scoring === "half" ? "Half PPR" : l.scoring === "ppr" ? "PPR" : "Standard"}</span></span>
                <button onClick={() => connect(l.id)} className="rounded-md border border-electric/40 px-2.5 py-1 text-xs text-electric-soft hover:bg-electric/10">Connect</button>
              </li>
            ))}
          </ul></>
        )}
        {msg && <p role="status" className={cn("mt-3 text-sm", msg.ok ? "text-up" : "text-down")}>{msg.text}</p>}
        {connection && <div className="mt-5 flex items-center justify-between rounded-lg border border-up/25 bg-up/[0.05] px-3 py-3"><div><div className="text-sm font-medium text-up">Sleeper league connected</div><div className="text-xs text-fg-dim">League {connection.leagueId} · Last synced {connection.syncedAt ? new Date(connection.syncedAt).toLocaleString() : "not yet"}</div></div><button type="button" disabled={busy || !connection.userId} onClick={sync} className="rounded-md border border-up/30 px-3 py-1.5 text-xs text-up disabled:opacity-40">Sync league</button></div>}
      </div>
      <div className="surface flex items-center justify-between p-5">
        <div><div className="eyebrow">Yahoo Fantasy</div><div className="font-medium">OAuth 2.0</div><p className="mt-1 text-xs text-fg-muted">Requires YAHOO_CLIENT_ID / SECRET. League sync lands after verification against a live response.</p></div>
        <a href="/api/auth/yahoo/start" className="rounded-lg border border-line px-3 py-2 text-sm hover:border-line-strong">Connect Yahoo</a>
      </div>
    </div>
  );
}
