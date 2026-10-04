import Link from "next/link";
import { ConnectForm } from "@/components/shell/ConnectForm";
import { ManualRosterForm } from "@/components/shell/ManualRosterForm";
import { Logo } from "@/components/shell/Logo";
import { PageHeader } from "@/components/ui/cards";
import { env } from "@/lib/config/env";
import { providerStatus } from "@/lib/providers/registry";
import { leagueConnection } from "@/lib/services/core";

export const metadata = { title: "Connect a league" };

export default async function Connect({ searchParams }: { searchParams: Promise<{ error?: string; yahoo?: string; sport?: string }> }) {
  const sp = await searchParams;
  const selectedSport = sp.sport === "nba" ? "nba" : "nfl";
  const providers = providerStatus();
  const connection = await leagueConnection("nfl");
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <Link href="/" className="mb-10 inline-block"><Logo /></Link>
      <PageHeader eyebrow={`Data mode: ${env.DATA_MODE.toUpperCase()}`} title="Connect Sleeper" sub="Enter your Sleeper username to find your NFL leagues. Sleeper is public and read-only: no API key, password, or OAuth token is needed." />
      {sp.error && <p className="mb-4 rounded-lg border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">Connection error: {sp.error.replace(/_/g, " ")}</p>}
      {sp.yahoo && <p className="mb-4 rounded-lg border border-up/30 bg-up/10 px-4 py-3 text-sm text-up">Yahoo authorized.</p>}
      <ConnectForm liveMode={env.DATA_MODE === "live"} initialConnection={connection?.provider === "sleeper" ? connection : null} />
      <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-line"/><span className="font-mono text-[10px] tracking-widest text-fg-dim">OR</span><span className="h-px flex-1 bg-line"/></div>
      <ManualRosterForm initialSport={selectedSport} />
      <div className="surface mt-6 p-5">
        <div className="eyebrow mb-3">Provider status</div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {providers.map((p) => (
            <li key={p.name} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
              <span><span className="mr-2 font-mono text-[10px] uppercase text-fg-dim">{p.domain}</span>{p.name}</span>
              <span className={p.configured ? "font-mono text-[11px] text-up" : "font-mono text-[11px] text-fg-dim"}>{p.configured ? "READY" : "NEEDS KEY"}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
