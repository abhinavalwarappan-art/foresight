"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApiResponse } from "@/lib/util/api";
import { cn } from "@/lib/util/cn";

interface League { id: string; name: string; teams: number; season: number }

export function ConnectForm({ liveMode }: { liveMode: boolean }) {
  const router = useRouter();
  const [sport, setSport] = useState<"nfl" | "nba">("nfl");
  const [username, setUsername] = useState("");
  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
  const connect = async (leagueId: string) => {
    setBusy(true);
    const j = await post({ action: "connect", sport, leagueId, userId });
    setBusy(false);
    if (!j.success) return setMsg({ ok: false, text: j.error });
    setMsg({ ok: true, text: liveMode ? "Connected. Loading your league…" : "Saved. Set DATA_MODE=live to use it — the app stays on mock data until then." });
    if (liveMode) router.push(`/${sport}`);
  };

  return (
    <div className="space-y-6">
      <div className="surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <div><div className="eyebrow">Sleeper</div><div className="font-medium">Public read-only — no password needed</div></div>
          <div className="inline-flex rounded-lg border border-line p-0.5">
            {(["nfl", "nba"] as const).map((s) => <button key={s} onClick={() => { setSport(s); setLeagues(null); }} className={cn("rounded-md px-3 py-1 font-mono text-xs", sport === s ? "bg-white/10 text-fg" : "text-fg-dim")}>{s.toUpperCase()}</button>)}
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); lookup(); }} className="flex gap-2">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Sleeper username" aria-label="Sleeper username" className="focus-ring h-10 flex-1 rounded-lg border border-line bg-ink-900 px-3 text-sm outline-none placeholder:text-fg-dim" />
          <button disabled={busy || username.length < 2} className="focus-ring rounded-lg bg-electric px-4 text-sm font-medium text-white disabled:opacity-40">{busy ? "…" : "Find leagues"}</button>
        </form>
        {leagues && leagues.length > 0 && (
          <ul className="mt-4 space-y-2">
            {leagues.map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                <span>{l.name} <span className="text-xs text-fg-dim">· {l.teams} teams · {l.season}</span></span>
                <button onClick={() => connect(l.id)} className="rounded-md border border-electric/40 px-2.5 py-1 text-xs text-electric-soft hover:bg-electric/10">Connect</button>
              </li>
            ))}
          </ul>
        )}
        {msg && <p role="status" className={cn("mt-3 text-sm", msg.ok ? "text-up" : "text-down")}>{msg.text}</p>}
      </div>
      <div className="surface flex items-center justify-between p-5">
        <div><div className="eyebrow">Yahoo Fantasy</div><div className="font-medium">OAuth 2.0</div><p className="mt-1 text-xs text-fg-muted">Requires YAHOO_CLIENT_ID / SECRET. League sync lands after verification against a live response.</p></div>
        <a href="/api/auth/yahoo/start" className="rounded-lg border border-line px-3 py-2 text-sm hover:border-line-strong">Connect Yahoo</a>
      </div>
    </div>
  );
}
