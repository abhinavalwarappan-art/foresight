import type { Provenance } from "@/lib/domain/types";

/** Fixed clock so mock output is byte-for-byte reproducible. */
export const MOCK_NOW = "2026-10-04T15:00:00.000Z";

export const mockProv = (overrides: Partial<Provenance> = {}): Provenance => ({
  source: "mock",
  sourceTimestamp: MOCK_NOW,
  retrievedAt: MOCK_NOW,
  confidence: null,
  isProjection: false,
  kind: "observed",
  cache: "mock",
  ...overrides,
});

/** Circle-method round robin: returns pairings for `rounds` rounds of n teams. */
export function roundRobin(n: number, rounds: number): [number, number][][] {
  const idx = Array.from({ length: n }, (_, i) => i);
  const out: [number, number][][] = [];
  for (let r = 0; r < rounds; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = idx[i];
      const b = idx[n - 1 - i];
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    out.push(pairs);
    // rotate all but first
    idx.splice(1, 0, idx.pop()!);
  }
  return out;
}
