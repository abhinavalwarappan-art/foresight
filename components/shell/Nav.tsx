"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowLeftRight, Database, Home, MessageSquareText, Shuffle, Trophy, Users, UserSearch, Waves } from "lucide-react";
import { cn } from "@/lib/util/cn";

const ITEMS = [
  { href: "", label: "Home", icon: Home },
  { href: "/players", label: "Players", icon: UserSearch },
  { href: "/roster", label: "Roster", icon: Users },
  { href: "/trade", label: "Trade Lab", icon: ArrowLeftRight },
  { href: "/scenarios", label: "Scenarios", icon: Shuffle },
  { href: "/waivers", label: "Waivers", icon: Waves },
  { href: "/league", label: "League", icon: Trophy },
  { href: "/ask", label: "Ask", icon: MessageSquareText },
];

function useActive(sport: string) {
  const path = usePathname();
  return (href: string) => (href === "" ? path === `/${sport}` : path.startsWith(`/${sport}${href}`));
}

export function SideNav({ sport }: { sport: string }) {
  const isActive = useActive(sport);
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link key={label} href={`/${sport}${href}`} aria-current={active ? "page" : undefined}
            className={cn("focus-ring group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors",
              active ? "bg-white/[0.05] text-fg" : "text-fg-muted hover:bg-white/[0.03] hover:text-fg")}>
            {active && <span className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-electric shadow-[0_0_12px_#4f7cff]" />}
            <Icon size={16} strokeWidth={1.75} className={active ? "text-electric-soft" : "text-fg-dim group-hover:text-fg-muted"} />
            {label}
            {label === "Ask" && <span className="ml-auto rounded bg-violet/15 px-1.5 py-px font-mono text-[9px] tracking-wider text-violet">AI</span>}
          </Link>
        );
      })}
      <Link href="/admin/model-performance" className="focus-ring mt-4 flex items-center gap-3 rounded-lg px-3 py-2 text-[12.5px] text-fg-dim hover:text-fg-muted">
        <Activity size={15} strokeWidth={1.75} /> Model performance
      </Link>
      <Link href={`/admin/data?sport=${sport}`} className="focus-ring flex items-center gap-3 rounded-lg px-3 py-2 text-[12.5px] text-fg-dim hover:text-fg-muted">
        <Database size={15} strokeWidth={1.75} /> Data inspector <span className="ml-auto rounded bg-down/15 px-1 font-mono text-[9px] text-down">DEV</span>
      </Link>
    </nav>
  );
}

export function BottomNav({ sport }: { sport: string }) {
  const isActive = useActive(sport);
  const items = ITEMS.filter((i) => ["Home", "Players", "Trade Lab", "Waivers", "Ask"].includes(i.label));
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-ink-900/90 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      {items.map(({ href, label, icon: Icon }) => (
        <Link key={label} href={`/${sport}${href}`} className={cn("flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px]", isActive(href) ? "text-electric-soft" : "text-fg-dim")}>
          <Icon size={18} strokeWidth={1.75} />
          {label.replace(" Lab", "")}
        </Link>
      ))}
    </nav>
  );
}

export function SportSwitch({ sport }: { sport: string }) {
  const path = usePathname();
  const rest = path.replace(/^\/(nfl|nba)/, "").replace(/\/players\/[^/]+$/, "/players");
  return (
    <div role="tablist" aria-label="Sport" className="relative inline-flex rounded-lg border border-line bg-ink-900 p-0.5">
      {(["nfl", "nba"] as const).map((s) => (
        <Link key={s} role="tab" aria-selected={s === sport} href={`/${s}${rest}`}
          className={cn("focus-ring relative z-10 rounded-md px-3 py-1 font-mono text-[11.5px] font-semibold tracking-wider transition-colors",
            s === sport ? "bg-white/[0.08] text-fg shadow-[0_0_0_1px_rgb(255_255_255/0.06)]" : "text-fg-dim hover:text-fg-muted")}>
          {s.toUpperCase()}
        </Link>
      ))}
    </div>
  );
}
