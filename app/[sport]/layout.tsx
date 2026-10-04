import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BottomNav, SideNav, SportSwitch } from "@/components/shell/Nav";
import { Logo } from "@/components/shell/Logo";
import { Notifications } from "@/components/shell/Notifications";
import { SearchCommand } from "@/components/shell/SearchCommand";
import { leagueConnection, sportSchema } from "@/lib/services/core";
import { env } from "@/lib/config/env";
import { shellData } from "@/lib/services/views";

export default async function SportLayout({ children, params }: { children: React.ReactNode; params: Promise<{ sport: string }> }) {
  const parsed = sportSchema.safeParse((await params).sport);
  if (!parsed.success) notFound();
  const sport = parsed.data;
  if (env.DATA_MODE === "live" && !(await leagueConnection(sport))) redirect(`/connect?sport=${sport}`);
  const shell = await shellData(sport);

  return (
    <div className="min-h-dvh">
      {shell.status.usingMock && (
        <div className="border-b border-amber/15 bg-amber/[0.06] px-4 py-1.5 text-center font-mono text-[10.5px] tracking-wider text-amber/90">
          MOCK DATA · fictional players, teams and league{shell.status.fallbackReason ? ` · ${shell.status.fallbackReason}` : ""} ·{" "}
          <Link href="/connect" className="underline decoration-amber/40 underline-offset-2 hover:text-amber">connect a league</Link>
        </div>
      )}
      {!shell.status.usingMock && shell.status.fallbackReason && (
        <div className="border-b border-amber/20 bg-amber/[0.06] px-4 py-1.5 text-center font-mono text-[10.5px] tracking-wide text-amber/90">
          LIVE DATA PARTIAL · {shell.status.fallbackReason}
        </div>
      )}
      <div className="mx-auto flex max-w-[1500px]">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line px-4 py-5 lg:flex">
          <Link href="/" className="focus-ring mb-7 rounded px-2"><Logo /></Link>
          <SideNav sport={sport} />
          <div className="mt-auto rounded-xl border border-line bg-white/[0.015] p-3">
            <div className="eyebrow mb-1">League</div>
            <div className="truncate text-[13px] font-medium">{shell.leagueName}</div>
            <div className="mt-0.5 text-[11px] text-fg-dim">{shell.leagueMeta}</div>
            <Link href="/connect" className="mt-2 inline-block text-[11.5px] text-electric-soft hover:text-electric">Switch / connect →</Link>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-ink-950/75 px-4 py-3 backdrop-blur-xl sm:px-6">
            <Link href="/" className="lg:hidden"><Logo /></Link>
            <SportSwitch sport={sport} />
            <div className="hidden flex-1 md:block"><SearchCommand sport={sport} items={shell.search} /></div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-fg-muted xl:inline-flex">
                <span className="size-1.5 rounded-full bg-up animate-pulse-dot" />{shell.userTeamName}
              </span>
              <Notifications items={shell.notices} />
              <span className="grid size-9 place-items-center rounded-lg border border-line bg-gradient-to-br from-electric/30 to-violet/30 font-mono text-[11px] font-semibold" aria-label="Profile">YO</span>
            </div>
          </header>
          <main className="px-4 pb-28 pt-7 sm:px-6 lg:pb-14 lg:px-8">{children}</main>
        </div>
      </div>
      <BottomNav sport={sport} />
    </div>
  );
}
