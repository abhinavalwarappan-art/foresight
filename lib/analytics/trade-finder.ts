import { type AnalyticsContext, round1 } from "./context";
import { analyzeRoster, GROUPS, groupOf, type PosGroup } from "./roster";
import { evaluateTrade, type TradeResult } from "./trade";
import { allValues } from "./value";

/**
 * Trade Finder: scans every roster for complementary surplus ↔ need pairs and
 * proposes trades that help BOTH sides. Candidates are screened with a fast
 * lineup-only evaluation, then the finalists get the full season simulation.
 */

export type TradeStyle = "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";

export interface TradeProposal {
  style: TradeStyle;
  partnerId: string;
  give: string[];
  get: string[];
  result: TradeResult;
  score: number;
  why: string[];
  whyTheyAccept: string[];
}

function needsAndSurplus(ctx: AnalyticsContext, teamId: string) {
  const r = analyzeRoster(ctx, teamId);
  const groups = GROUPS[ctx.snap.sport];
  const needs = groups.filter((g) => r.groupStrength[g] < 45).sort((a, b) => r.groupStrength[a] - r.groupStrength[b]);
  const surplus = groups.filter((g) => r.groupDepthScore[g] >= 55 || r.groupStrength[g] >= 65).sort((a, b) => r.groupDepthScore[b] - r.groupDepthScore[a]);
  return { r, needs, surplus };
}

export function findTrades(ctx: AnalyticsContext, teamId = ctx.userTeamId, opts: { focusGroup?: PosGroup; limit?: number } = {}): TradeProposal[] {
  const vals = allValues(ctx);
  const me = needsAndSurplus(ctx, teamId);
  const myNeeds = opts.focusGroup ? [opts.focusGroup] : me.needs.length ? me.needs : GROUPS[ctx.snap.sport];
  const myRoster = ctx.rosterOf(teamId);
  const v = (id: string) => vals.get(id)!;

  // Assets I can move: bench players in surplus groups, or starters in deep groups.
  const tradeable = myRoster
    .filter((id) => !myNeeds.includes(groupOf(ctx.player(id)!.position)))
    .filter((id) => v(id).value >= 25)
    .sort((a, b) => v(b).value - v(a).value)
    .slice(0, 8);

  const screened: { partnerId: string; give: string[]; get: string[]; quick: TradeResult; score: number }[] = [];
  for (const partner of ctx.snap.fantasyTeams.filter((t) => t.id !== teamId)) {
    const them = needsAndSurplus(ctx, partner.id);
    const targets = ctx.rosterOf(partner.id)
      .filter((id) => myNeeds.includes(groupOf(ctx.player(id)!.position)))
      .filter((id) => v(id).value >= 30)
      .sort((a, b) => v(b).value - v(a).value)
      .slice(0, 5);
    const helpsThem = (id: string) => them.needs.includes(groupOf(ctx.player(id)!.position));
    const offers = [...tradeable].sort((a, b) => Number(helpsThem(b)) - Number(helpsThem(a)));

    const packages: { give: string[]; get: string[] }[] = [];
    for (const get of targets) {
      for (const give of offers.slice(0, 5)) {
        const ratio = v(give).value / Math.max(1, v(get).value);
        if (ratio > 0.7 && ratio < 1.45) packages.push({ give: [give], get: [get] });
      }
      // 2-for-1 consolidation: two mid assets for one better player
      for (let i = 0; i < Math.min(5, offers.length); i++) {
        for (let j = i + 1; j < Math.min(6, offers.length); j++) {
          const pair = [offers[i], offers[j]];
          const sum = v(pair[0]).value + v(pair[1]).value;
          if (sum > v(get).value * 1.1 && sum < v(get).value * 1.8 && Math.max(v(pair[0]).value, v(pair[1]).value) < v(get).value) {
            packages.push({ give: pair, get: [get] });
          }
        }
      }
    }
    for (const pk of packages) {
      const quick = evaluateTrade(ctx, { teamA: teamId, teamB: partner.id, aGives: pk.give, bGives: pk.get }, { simulate: false });
      const mine = quick.a.benefitPct;
      const theirs = quick.b.benefitPct;
      if (mine <= 0.3) continue; // never propose trades that don't help the user
      if (theirs < -1.5) continue; // and don't propose obvious rejections
      const score = mine * 1.0 + Math.min(mine, Math.max(theirs, -1)) * 0.8 + quick.fairness * 0.04 + (theirs > 0 ? 1 : 0);
      screened.push({ partnerId: partner.id, give: pk.give, get: pk.get, quick, score: round1(score) });
    }
  }

  screened.sort((a, b) => b.score - a.score);
  const classify = (q: TradeResult): TradeStyle =>
    q.fairness >= 82 && q.b.benefitPct >= q.a.benefitPct * 0.5 ? "CONSERVATIVE"
    : q.a.benefitPct >= 4 && q.fairness < 82 ? "AGGRESSIVE" : "BALANCED";

  const picked: TradeProposal[] = [];
  const perStyle: Record<TradeStyle, number> = { CONSERVATIVE: 0, BALANCED: 0, AGGRESSIVE: 0 };
  const usedTargets = new Set<string>();
  const limit = opts.limit ?? 2;
  for (const c of screened) {
    const style = classify(c.quick);
    if (perStyle[style] >= limit || usedTargets.has(c.get.join())) continue;
    perStyle[style]++;
    usedTargets.add(c.get.join());
    const full = evaluateTrade(ctx, { teamA: teamId, teamB: c.partnerId, aGives: c.give, bGives: c.get });
    picked.push({
      style, partnerId: c.partnerId, give: c.give, get: c.get, result: full, score: c.score,
      why: [
        ...full.a.notes.slice(0, 2),
        `Weekly lineup ${full.a.weeklyDelta >= 0 ? "+" : ""}${full.a.weeklyDelta} pts (ROS avg)`,
        `Title odds ${full.a.champBefore}% → ${full.a.champAfter}% (simulated)`,
      ],
      whyTheyAccept: full.acceptance.reasons,
    });
    if (picked.length >= limit * 3) break;
  }
  const order: Record<TradeStyle, number> = { CONSERVATIVE: 0, BALANCED: 1, AGGRESSIVE: 2 };
  return picked.sort((a, b) => order[a.style] - order[b.style] || b.score - a.score);
}
