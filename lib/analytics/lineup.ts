import type { Position, RosterSlot } from "@/lib/domain/types";

export const SLOT_ELIGIBILITY: Record<RosterSlot, Position[]> = {
  QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DST: ["DST"],
  FLEX: ["RB", "WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  PG: ["PG"], SG: ["SG"], SF: ["SF"], PF: ["PF"], C: ["C"],
  G: ["PG", "SG"], F: ["SF", "PF"], UTIL: ["PG", "SG", "SF", "PF", "C"],
  BN: [], IR: [],
};

export interface LineupCandidate {
  playerId: string;
  position: Position;
  value: number; // whatever we optimize: projected points, actual points…
}

export interface LineupResult {
  starters: { slot: RosterSlot; playerId: string | null; value: number }[];
  bench: string[];
  total: number;
}

/**
 * Fill the most restrictive slots first, each with the best eligible remaining player.
 * Exact for standard NFL/NBA slot structures (single-position → combo → flex).
 */
export function optimalLineup(candidates: LineupCandidate[], slots: RosterSlot[]): LineupResult {
  const starterSlots = slots.filter((s) => s !== "BN" && s !== "IR");
  const ordered = starterSlots
    .map((slot, i) => ({ slot, i }))
    .sort((a, b) => SLOT_ELIGIBILITY[a.slot].length - SLOT_ELIGIBILITY[b.slot].length);
  const pool = [...candidates].sort((a, b) => b.value - a.value);
  const used = new Set<string>();
  const filled: { slot: RosterSlot; playerId: string | null; value: number; i: number }[] = [];
  for (const { slot, i } of ordered) {
    const pick = pool.find((c) => !used.has(c.playerId) && SLOT_ELIGIBILITY[slot].includes(c.position));
    if (pick) used.add(pick.playerId);
    filled.push({ slot, i, playerId: pick?.playerId ?? null, value: pick?.value ?? 0 });
  }
  filled.sort((a, b) => a.i - b.i);
  const total = Math.round(filled.reduce((s, f) => s + f.value, 0) * 10) / 10;
  return {
    starters: filled.map(({ slot, playerId, value }) => ({ slot, playerId, value })),
    bench: pool.filter((c) => !used.has(c.playerId)).map((c) => c.playerId),
    total,
  };
}
