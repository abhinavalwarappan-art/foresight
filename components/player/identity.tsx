import Link from "next/link";
import type { PlayerSummary } from "@/lib/services/core";
import { cn } from "@/lib/util/cn";
import { StatusPill } from "@/components/ui/badges";

/** Monogram avatar — no headshots in mock mode; team color as a quiet ring. */
export function PlayerAvatar({ first, last, color, size = 36 }: { first: string; last: string; color: string; size?: number }) {
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center rounded-full bg-ink-750 font-mono font-semibold text-fg"
      style={{ width: size, height: size, fontSize: size * 0.34, boxShadow: `inset 0 0 0 1.5px ${color}66, 0 0 18px -6px ${color}` }}
      aria-hidden
    >
      {first[0]}{last[0]}
    </span>
  );
}

export function TeamBadge({ abbr, color }: { abbr: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10.5px] tracking-wider text-fg-muted">
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {abbr}
    </span>
  );
}

export function PlayerLine({ p, sport, className, right, compact }: { p: PlayerSummary; sport: string; className?: string; right?: React.ReactNode; compact?: boolean }) {
  return (
    <Link href={`/${sport}/players/${p.id}`} className={cn("focus-ring group flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-white/[0.03]", className)}>
      <PlayerAvatar first={p.firstName} last={p.lastName} color={p.teamColor} size={compact ? 28 : 34} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-medium group-hover:text-white">{p.name}</span>
          <StatusPill status={p.status} />
        </span>
        <span className="flex items-center gap-2 text-[11px] text-fg-dim">
          <span className="font-mono text-fg-muted">{p.position}</span>
          <TeamBadge abbr={p.teamAbbr} color={p.teamColor} />
          {!compact && p.owner && <span className="truncate">{p.ownerIsUser ? "Your team" : p.owner}</span>}
          {!compact && !p.owner && <span className="text-cyan/80">Free agent</span>}
        </span>
      </span>
      {right}
    </Link>
  );
}
