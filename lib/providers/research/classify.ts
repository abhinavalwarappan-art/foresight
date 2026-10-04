import type { ResearchEvent } from "@/lib/domain/types";

/**
 * Deterministic keyword classifier: turns untrusted article text into a typed event.
 * We keep only the classification + our own template summary, never the text itself.
 * Low confidence by design; an LLM extractor can replace this behind the same shape.
 */
const RULES: { type: ResearchEvent["eventType"]; dir: ResearchEvent["direction"]; re: RegExp; summary: string }[] = [
  { type: "injury_update", dir: "decrease", re: /\b(ruled out|will not play|won't play|placed on (injured reserve|ir))\b/i, summary: "Reported as ruled out / placed on IR." },
  { type: "minutes_restriction", dir: "decrease", re: /\b(minutes (restriction|limit)|limited minutes|pitch count)\b/i, summary: "Reported workload or minutes limit." },
  { type: "practice_report", dir: "neutral", re: /\b(limited participant|did not practice|full participant|dnp)\b/i, summary: "Practice participation reported." },
  { type: "lineup_change", dir: "increase", re: /\b(will start|expected to start|starting lineup|first[- ]team)\b/i, summary: "Reported as moving into the starting lineup." },
  { type: "depth_chart_change", dir: "increase", re: /\b(depth chart|promoted|bigger role|more snaps|increased role)\b/i, summary: "Reported role or depth-chart increase." },
  { type: "suspension", dir: "decrease", re: /\bsuspend(ed|sion)\b/i, summary: "Reported suspension." },
  { type: "trade", dir: "neutral", re: /\b(traded|acquired|trade to)\b/i, summary: "Reported trade involving the player." },
  { type: "rest", dir: "decrease", re: /\b(rest(ing)?|load management|back-to-back)\b/i, summary: "Reported rest / load management." },
];

export function classifyText(text: string): { type: ResearchEvent["eventType"]; dir: ResearchEvent["direction"]; summary: string } | null {
  const sample = text.slice(0, 4000);
  for (const r of RULES) if (r.re.test(sample)) return { type: r.type, dir: r.dir, summary: r.summary };
  return null;
}
