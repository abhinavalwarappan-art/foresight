import Link from "next/link";
import { Suspense } from "react";
import { FreshBadge, JsonBlock, KV, NA, RawBlock, Section, TraceTable } from "@/components/admin/primitives";
import { Selectors } from "@/components/admin/Selectors";
import { ToolInspector } from "@/components/admin/ToolInspector";
import { Logo } from "@/components/shell/Logo";
import { freshness } from "@/lib/admin/freshness";
import { requireAdmin } from "@/lib/admin/guard";
import { inspectGame, inspectLeague, inspectPlayer, inspectTeam, PROVIDERS, toolArgTemplates, type InspectorProvider } from "@/lib/admin/inspector";
import { normalizationChecks } from "@/lib/admin/mock-provider-data";
import { providerHealthRows } from "@/lib/admin/provider-health";
import { toolSpecs } from "@/lib/ai/tools";
import { playerName } from "@/lib/analytics/context";
import { allValues } from "@/lib/analytics/value";
import { env } from "@/lib/config/env";
import { loadContext, sportSchema } from "@/lib/services/core";
import { cn } from "@/lib/util/cn";

export const metadata = { title: "Data Inspector (DEV)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type SP = { sport?: string; player?: string; team?: string; game?: string; provider?: string; league?: string };

const STATUS_CLS: Record<string, string> = {
  "NOT CONFIGURED": "text-fg-dim border-line", CONFIGURED: "text-electric-soft border-electric/30", CONNECTED: "text-up border-up/30 bg-up/10",
  ERROR: "text-down border-down/40 bg-down/10", "RATE LIMITED": "text-amber border-amber/40 bg-amber/10", STALE: "text-amber border-amber/30",
};
const ID_CLS: Record<string, string> = { LINKED: "text-up", SYNTHETIC: "text-amber", "NOT LINKED": "text-down", "NOT CONFIGURED": "text-fg-dim" };

export default async function DataInspector({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const sport = sportSchema.catch("nfl").parse(sp.sport);
  const provider = (PROVIDERS as readonly string[]).includes(sp.provider ?? "") ? (sp.provider as InspectorProvider) : undefined;
  const { ctx, status } = await loadContext(sport);
  const snap = ctx.snap;
  const vals = allValues(ctx);
  const defaultPlayer = [...vals.values()].filter((v) => v.tags.includes("INJURY OPPORTUNITY")).sort((a, b) => b.value - a.value)[0]?.playerId ?? snap.players[0].id;
  const playerId = sp.player && ctx.player(sp.player) ? sp.player : defaultPlayer;
  const insp = inspectPlayer(ctx, status, playerId, provider)!;
  const team = sp.team ? inspectTeam(ctx, sp.team) : null;
  const game = sp.game ? inspectGame(ctx, sp.game) : null;
  const league = sp.league ? inspectLeague(ctx) : null;
  const health = providerHealthRows();
  const roundTrip = snap.isMock ? normalizationChecks(snap, ctx.player(playerId)!) : null;
  const liveGaps = roundTrip?.statsViaAdapter?.usage && "unavailable" in roundTrip.statsViaAdapter.usage ? roundTrip.statsViaAdapter.usage.unavailable ?? [] : [];
  const traces = Object.fromEntries(insp.traces.map((t) => [t.metric, t]));

  const teams = snap.teams.map((t) => ({ id: t.id, label: `${t.abbr} · ${t.city} ${t.name}` }));
  const players = [...snap.players].sort((a, b) => (vals.get(b.id)!.value - vals.get(a.id)!.value)).map((p) => ({ id: p.id, label: `${playerName(p)} · ${p.position} · ${ctx.team(p.teamId)?.abbr}`, teamId: p.teamId }));
  const games = snap.games.filter((g) => g.week <= snap.currentWeek).slice(-120).reverse().map((g) => ({ id: g.id, label: `W${g.week} · ${ctx.team(g.awayTeamId)?.abbr} @ ${ctx.team(g.homeTeamId)?.abbr} · ${g.status}`, teamIds: [g.homeTeamId, g.awayTeamId] }));
  const domains = (["sports", "fantasy", "odds", "research"] as const).map((d) => ({ d, prov: snap.sources[d], f: freshness(snap.sources[d]) }));

  const nav = [["identity", "Identity"], ["provider-ids", "Provider IDs"], ["raw", "Raw data"], ["normalized", "Normalized"], ["analytics", "Derived analytics"], ["projection", "Projection trace"], ["provenance", "Provenance"], ["health", "Provider health"], ["freshness", "Freshness"], ["tools", "Tool inspector"], ["modes", "Mock / live"]];

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-5 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-down/30 bg-down/[0.07] px-4 py-2.5">
        <span className="rounded bg-down px-2 py-0.5 font-mono text-[11px] font-bold tracking-widest text-white">DEV / ADMIN</span>
        <span className="text-[13px] text-fg-muted">Internal data inspector. Secrets, keys and auth headers are never rendered. Gate with <code className="font-mono text-xs">lib/admin/guard.ts</code> before exposing.</span>
        <Link href={`/${sport}`} className="ml-auto"><Logo /></Link>
      </div>

      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-1 text-electric-soft">Validation · pipeline inspector</div>
          <h1 className="text-[clamp(1.7rem,1.2rem+1.6vw,2.4rem)] font-semibold tracking-[-0.035em]">Data Inspector</h1>
          <p className="mt-1 text-sm text-fg-muted">Raw provider response → normalized object → engine inputs → derived outputs → AI tool payload.</p>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[11px]">
          <span className="rounded border border-line px-2 py-1">DATA_MODE=<b className={env.DATA_MODE === "live" ? "text-up" : "text-amber"}>{env.DATA_MODE}</b></span>
          <span className="rounded border border-line px-2 py-1">snapshot: {snap.isMock ? "MOCK (fictional)" : "LIVE"}</span>
          <span className="rounded border border-line px-2 py-1">generated {snap.generatedAt}</span>
          {status.fallbackReason && <span className="rounded border border-amber/40 px-2 py-1 text-amber">fallback: {status.fallbackReason}</span>}
        </div>
      </header>

      <div className="surface mb-5 p-4">
        <Suspense><Selectors teams={teams} players={players} games={games} providers={[...PROVIDERS]} hasLeague /></Suspense>
      </div>

      <nav className="sticky top-0 z-20 -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line bg-ink-950/85 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        {nav.map(([id, l]) => <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-md px-2.5 py-1 text-[12px] text-fg-muted hover:bg-white/[0.04] hover:text-fg">{l}</a>)}
      </nav>

      <div className="space-y-4">
        {team && (
          <Section id="team" n="T" title={`Team · ${team.team.abbr}`} sub="normalized team, roster, depth chart">
            <div className="grid gap-4 lg:grid-cols-2">
              <JsonBlock title="Normalized Team" value={team.team} defaultOpen />
              <div>
                <div className="eyebrow mb-2">Roster ({team.roster.length})</div>
                <ul className="grid max-h-80 gap-1 overflow-auto text-[12.5px] sm:grid-cols-2">
                  {team.roster.map((r) => <li key={r.id}><Link className="hover:text-electric-soft" href={`?sport=${sport}&team=${team.team.id}&player=${r.id}`}><span className="font-mono text-fg-dim">{r.position}{r.depth}</span> {r.name} {r.status !== "healthy" && <span className="text-down">({r.status})</span>}</Link></li>)}
                </ul>
              </div>
            </div>
            <div className="mt-3 space-y-2">{team.raw.length ? team.raw.map((r, i) => <RawBlock key={i} r={r} />) : <p className="text-xs text-fg-dim">Raw team payload: <NA /> {snap.isMock ? "(mock generator emits normalized teams directly)" : "(not captured this process)"}</p>}</div>
          </Section>
        )}

        {game && (
          <Section id="game" n="G" title={`Game · ${game.away} @ ${game.home}`} sub="normalized game, market, box-score lines">
            <div className="grid gap-4 lg:grid-cols-2">
              <JsonBlock title="Normalized Game" value={game.game} defaultOpen />
              <div className="space-y-2">
                <div className="flex items-center gap-2"><span className="eyebrow">Market</span><FreshBadge f={game.marketFreshness} /></div>
                {game.market ? <JsonBlock title="Normalized GameMarket" value={game.market} defaultOpen /> : <p className="text-sm"><NA /> <span className="text-fg-dim">no line for this game (markets exist only for upcoming weeks)</span></p>}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {game.raw.map((r, i) => <RawBlock key={i} r={r} />)}
              <JsonBlock title={`Player lines (${game.lines.length})`} value={game.lines} />
            </div>
          </Section>
        )}

        {league && (
          <Section id="league" n="L" title={`League · ${league.league.name}`} sub="settings, teams, identity-mapping report">
            <div className="mb-3 flex items-center gap-2"><span className="eyebrow">Freshness</span><FreshBadge f={league.freshness} /></div>
            <div className="grid gap-4 lg:grid-cols-2">
              <JsonBlock title="Normalized FantasyLeague" value={league.league} defaultOpen />
              <JsonBlock title={`Fantasy teams (${league.teams.length})`} value={league.teams} />
            </div>
            <div className="mt-4 rounded-lg border border-line p-3 text-sm">
              <div className="eyebrow mb-2">Identity mapping · {league.mapping.provider} · {league.mapping.source}</div>
              <p className="text-fg-muted">Matched <b className="text-fg">{league.mapping.matched}</b> · ambiguous <b className="text-amber">{league.mapping.issues.filter((i) => i.kind === "AMBIGUOUS").length}</b> · unmatched <b className="text-down">{league.mapping.issues.filter((i) => i.kind === "UNMATCHED").length}</b></p>
              <ul className="mt-2 space-y-1 text-[12.5px]">
                {league.mapping.issues.slice(0, 40).map((i, k) => (
                  <li key={k}><span className={i.kind === "AMBIGUOUS" ? "font-mono text-amber" : "font-mono text-down"}>{i.kind}</span> {i.provider}:{i.ref.externalId} — {i.ref.firstName} {i.ref.lastName} ({i.ref.position ?? "?"}, {i.ref.teamAbbr ?? "no team"}){i.candidates.length > 0 && <span className="text-fg-dim"> · candidates: {i.candidates.map((c) => `${c.name} (${c.team})`).join(", ")} — NOT LINKED</span>}</li>
                ))}
              </ul>
            </div>
            <div className="mt-3 space-y-2">{league.raw.map((r, i) => <RawBlock key={i} r={r} />)}</div>
          </Section>
        )}

        <Section id="identity" n={1} title="Internal identity" sub={insp.identity.name}>
          <KV rows={[["Internal ID", <code key="i">{insp.identity.id}</code>], ["Name", insp.identity.name], ["Team", insp.identity.team], ["Position", insp.identity.position], ["Status", insp.identity.status], ["Depth order", insp.identity.depthOrder]]} />
          <p className="mt-3 text-xs"><Link className="text-electric-soft hover:text-electric" href={`/${sport}/players/${insp.identity.id}`}>Open public player page →</Link></p>
        </Section>

        <Section id="provider-ids" n={2} title="Provider identities" sub="never guessed — ambiguous refs stay unlinked">
          <table className="w-full text-[13px]">
            <thead><tr className="eyebrow border-b border-line [&>th]:py-2 [&>th]:text-left [&>th]:font-normal"><th>Provider</th><th>External ID</th><th>State</th><th>Note</th></tr></thead>
            <tbody>{insp.identities.map((r) => (
              <tr key={r.provider} className="border-b border-line/50 [&>td]:py-2">
                <td className="font-mono">{r.provider}</td>
                <td className="num">{r.externalId ?? <NA />}</td>
                <td className={cn("font-mono text-[11px] font-semibold", ID_CLS[r.state])}>{r.state}</td>
                <td className="text-xs text-fg-dim">{r.note}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="mt-4">
            <div className="eyebrow mb-2">Mapping issues involving this name</div>
            {insp.issues.length ? (
              <ul className="space-y-2">
                {insp.issues.map((i, k) => (
                  <li key={k} className={cn("rounded-lg border p-3 text-[13px]", i.kind === "AMBIGUOUS" ? "border-amber/40 bg-amber/[0.06]" : "border-down/40 bg-down/[0.06]")}>
                    <b className={i.kind === "AMBIGUOUS" ? "text-amber" : "text-down"}>{i.kind}</b> · {i.provider} ref <code>{i.ref.externalId}</code> “{i.ref.firstName} {i.ref.lastName}” ({i.ref.position ?? "?"}, team {i.ref.teamAbbr ?? "none"})
                    <div className="mt-1 text-xs text-fg-muted">Candidates: {i.candidates.map((c) => <Link key={c.id} href={`?sport=${sport}&player=${c.id}`} className="mr-2 underline decoration-line-strong">{c.name} ({c.team})</Link>)} → left unlinked for manual resolution.</div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-fg-dim">None. Try the deliberate mock collision: two NFL WRs share a name — open the league panel to see it.</p>}
          </div>
        </Section>

        <Section id="raw" n={3} title="Raw provider data" sub={snap.isMock ? "synthetic payloads in real provider shapes" : "captured response bodies"}>
          {snap.isMock && <p className="mb-3 rounded-lg border border-amber/30 bg-amber/[0.06] px-3 py-2 text-xs text-amber">Mock mode: these payloads are SYNTHETIC — generated from the fictional world in the documented BALLDONTLIE / Sleeper response shapes, then pushed through the real adapters (see section 4). No network calls were made.</p>}
          <div className="space-y-2">{insp.raw.length ? insp.raw.map((r, i) => <RawBlock key={i} r={r} />) : <p className="text-sm"><NA /> <span className="text-fg-dim">no raw records captured for this player{provider ? ` from ${provider}` : ""} in this server process.</span></p>}</div>
        </Section>

        <Section id="normalized" n={4} title="Normalized data" sub="exact objects the engines consume">
          <div className="grid gap-3 lg:grid-cols-2">
            <JsonBlock title="Player" value={insp.normalized.player} defaultOpen />
            <JsonBlock title="Projection" value={insp.normalized.projection} defaultOpen />
            <JsonBlock title={`PlayerGame × ${insp.normalized.recentGames.length} (stats + usage)`} value={insp.normalized.recentGames} />
            <JsonBlock title="Injury" value={insp.normalized.injury ?? "NOT AVAILABLE — not on the injury report"} />
            <JsonBlock title="Projected usage (usage model output)" value={insp.normalized.usageProjection} />
          </div>
          <div className="mt-4">
            <div className="eyebrow mb-2">Raw → normalized check · {insp.checkSource === "synthetic-roundtrip" ? "synthetic raw re-normalized through the real BALLDONTLIE adapter" : insp.checkSource === "live-remap" ? "captured raw re-mapped and diffed" : "no raw record to check"}</div>
            {insp.checks ? (
              <table className="w-full text-[12.5px]">
                <thead><tr className="eyebrow border-b border-line [&>th]:py-1.5 [&>th]:text-left [&>th]:font-normal"><th>Field</th><th>Adapter output</th><th>Internal object</th><th /></tr></thead>
                <tbody>{insp.checks.map((c) => (
                  <tr key={c.field} className="border-b border-line/50 [&>td]:py-1.5">
                    <td className="font-mono text-fg-muted">{c.field}</td><td className="num">{JSON.stringify(c.normalized) ?? "undefined"}</td><td className="num">{JSON.stringify(c.internal)}</td>
                    <td className={c.match ? "text-up" : "text-down"}>{c.match ? "✓" : "✗ MISMATCH"}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <NA />}
          </div>
        </Section>

        <Section id="analytics" n={5} title="Derived analytics" sub="inputs and every intermediate step">
          <div className="grid gap-4 xl:grid-cols-2">
            {["Opportunity Score", "Availability Score", "Fantasy Value", "Breakout Score", "Regression / Sustainability"].map((m) => traces[m] && <TraceTable key={m} trace={traces[m]} />)}
          </div>
        </Section>

        <Section id="projection" n={6} title="Projection trace" sub="baseline → adjustments → median, floor, ceiling">
          {traces.Projection && <TraceTable trace={traces.Projection} />}
        </Section>

        <Section id="provenance" n={7} title="Data provenance">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[12.5px]">
              <thead><tr className="eyebrow border-b border-line [&>th]:py-2 [&>th]:pr-3 [&>th]:text-left [&>th]:font-normal"><th>Metric</th><th>Source</th><th>Source timestamp</th><th>Retrieved</th><th>Kind</th><th>Cache</th><th>Freshness</th></tr></thead>
              <tbody>{insp.provenance.map((r) => (
                <tr key={r.metric} className="border-b border-line/50 [&>td]:py-2 [&>td]:pr-3">
                  <td className="text-fg">{r.metric}</td>
                  <td className="font-mono">{r.source === "NOT AVAILABLE" ? <NA /> : r.source}</td>
                  <td className="num text-fg-dim">{r.sourceTimestamp ?? "—"}</td>
                  <td className="num text-fg-dim">{r.retrievedAt ?? "—"}</td>
                  <td className="font-mono text-[11px]">{r.kind}</td>
                  <td className="font-mono text-[11px]">{r.cache}</td>
                  <td><FreshBadge f={r.freshness} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Section>

        <Section id="health" n={8} title="Provider health" sub="telemetry for this server process — no key material">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[12.5px]">
              <thead><tr className="eyebrow border-b border-line [&>th]:py-2 [&>th]:pr-3 [&>th]:text-left [&>th]:font-normal"><th>Provider</th><th>Domain</th><th>Status</th><th>Last success</th><th>Last failure</th><th>Latency (last / avg)</th><th>Requests</th><th>Cache hit / miss / stale</th><th>Note</th></tr></thead>
              <tbody>{health.map((h) => (
                <tr key={h.id} className="border-b border-line/50 [&>td]:py-2 [&>td]:pr-3">
                  <td className="font-medium">{h.name}</td>
                  <td className="font-mono text-[11px] text-fg-dim">{h.domain}</td>
                  <td><span className={cn("rounded border px-1.5 py-px font-mono text-[10px] font-semibold", STATUS_CLS[h.status])}>{h.status}</span></td>
                  <td className="num text-fg-dim">{h.lastSuccess ?? "—"}</td>
                  <td className="num text-fg-dim" title={h.lastError ?? undefined}>{h.lastFailure ?? "—"}{h.lastError && <div className="max-w-[220px] truncate text-[10.5px] text-down">{h.lastError}</div>}</td>
                  <td className="num">{h.latencyMs ?? "—"} / {h.avgLatencyMs ?? "—"} ms</td>
                  <td className="num">{h.requests}</td>
                  <td className="num">{h.cacheHits} / {h.cacheMisses} / {h.staleServes}</td>
                  <td className="text-[11px] text-fg-dim">{h.note}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Section>

        <Section id="freshness" n={9} title="Data freshness" sub="judged against each data class's cache TTL">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {domains.map(({ d, prov, f }) => (
              <div key={d} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between"><span className="eyebrow">{d}</span><FreshBadge f={f} /></div>
                <div className="mt-1 font-mono text-[12px]">{prov.source}</div>
                <div className="num text-[11px] text-fg-dim">retrieved {prov.retrievedAt}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-fg-dim">Labels: LIVE (&lt;1 min) · N MIN AGO · N HOURS OLD · STALE (past TTL or served from stale cache). Mock data uses a fixed clock and is labeled as such rather than given a fake age.</p>
        </Section>

        <Section id="tools" n={10} title="AI tool inspector" sub="run any registered tool; see the literal payload the LLM receives">
          <ToolInspector sport={sport} specs={toolSpecs()} templates={toolArgTemplates(ctx, playerId)} />
          <div className="mt-4 rounded-lg border border-line p-3 text-[12.5px] text-fg-muted">
            <b className="text-fg">Debugging a bad AI answer:</b> A) source data → sections 3 & 7 · B) normalization → section 4 checks · C) analytics → sections 5–6 traces (✓ reconcile badges) · D) tool output → run the tool here · E) if the tool payload is correct, the LLM's reasoning is at fault.
          </div>
        </Section>

        <Section id="modes" n={11} title="Mock / live comparison">
          <KV rows={[
            ["DATA_MODE", env.DATA_MODE],
            ["Snapshot", snap.isMock ? "mock world (fictional, deterministic)" : "live providers"],
            ["Fallback reason", status.fallbackReason],
            ["Identity mapping", snap.isMock ? "real matcher over synthetic Sleeper refs" : "real matcher over Sleeper refs"],
            ["Raw payloads", snap.isMock ? "synthetic, provider-shaped" : "captured response bodies (process memory)"],
          ]} />
          {snap.isMock && (
            <div className="mt-4 rounded-lg border border-amber/30 bg-amber/[0.05] p-3 text-[13px]">
              <div className="eyebrow mb-1 text-amber">Will be NOT AVAILABLE from the BALLDONTLIE base stats endpoint in live mode</div>
              <p className="text-fg-muted">{liveGaps.length ? liveGaps.join(", ") : "—"}. The mock world has these fields; the real adapter flags them as unavailable, and opportunity signals / traces will show NOT AVAILABLE instead of zeros.</p>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
