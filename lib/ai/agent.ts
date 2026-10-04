import "server-only";
import type { AnalyticsContext } from "@/lib/analytics/context";
import { playerName } from "@/lib/analytics/context";
import { normalizeName } from "@/lib/ids/mapping";
import { getLlm, type LlmMessage } from "./provider";
import { systemPrompt } from "./system-prompt";
import { runTool, toolResultMessage, toolSpecs } from "./tools";

export interface ToolTrace {
  name: string;
  args: unknown;
  ok: boolean;
  result: unknown;
}

export interface AskResult {
  answer: string;
  provider: "openai" | "gemini" | "mock";
  tools: ToolTrace[];
}

const MAX_STEPS = 6;

/**
 * Tool-calling loop. The model plans → we execute registered tools → the model
 * reasons over the structured results. Without an API key, a deterministic
 * analyst plans the same tool calls and writes a templated answer.
 */
export async function ask(ctx: AnalyticsContext, question: string, history: { role: "user" | "assistant"; content: string }[] = []): Promise<AskResult> {
  const llm = getLlm();
  if (!llm) return mockAnalyst(ctx, question);

  const messages: LlmMessage[] = [
    { role: "system", content: systemPrompt(ctx.snap.sport, ctx.snap.league.name, ctx.snap.league.scoring.format, ctx.snap.isMock) },
    ...history.slice(-6),
    { role: "user", content: question },
  ];
  const traces: ToolTrace[] = [];
  const specs = toolSpecs();
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const turn = await llm.chat(messages, specs);
      if (!turn.toolCalls.length) return { answer: turn.text ?? "I couldn't produce an answer.", provider: llm.name, tools: traces };
      messages.push({ role: "assistant", content: turn.text ?? "", toolCalls: turn.toolCalls });
      for (const call of turn.toolCalls) {
        const r = await runTool(ctx, call.name, call.args);
        traces.push({ name: call.name, args: call.args, ok: r.ok, result: r.result });
        // Wrapped so injected text inside results reads as data, not instructions.
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: toolResultMessage(r.result) });
      }
    }
    return { answer: "I hit my tool-call limit before finishing. Try a narrower question.", provider: llm.name, tools: traces };
  } catch (e) {
    const fallback = await mockAnalyst(ctx, question);
    return { ...fallback, answer: `${fallback.answer}\n\n_(${llm.name} unavailable: ${(e as Error).message} — answered by the built-in analyst.)_` };
  }
}

// ───────────────────────── deterministic analyst ─────────────────────────

function findPlayers(ctx: AnalyticsContext, q: string): string[] {
  const text = ` ${normalizeName(q, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ")} `;
  const hits: { id: string; at: number }[] = [];
  for (const p of ctx.snap.players) {
    const full = normalizeName(p.firstName, p.lastName);
    const at = text.indexOf(` ${full} `);
    if (at >= 0) hits.push({ id: p.id, at });
  }
  if (!hits.length) {
    // unique last-name match
    for (const p of ctx.snap.players) {
      const last = normalizeName(p.lastName, "").trim();
      const at = text.indexOf(` ${last} `);
      if (at >= 0 && ctx.snap.players.filter((x) => normalizeName(x.lastName, "").trim() === last).length === 1) hits.push({ id: p.id, at });
    }
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.id).filter((id, i, arr) => arr.indexOf(id) === i);
}

const posIn = (q: string) => q.match(/\b(QB|RB|WR|TE|PG|SG|SF|PF|C)\b/i)?.[1]?.toUpperCase();
type Obj = Record<string, unknown>;

async function mockAnalyst(ctx: AnalyticsContext, question: string): Promise<AskResult> {
  const q = question.toLowerCase();
  const traces: ToolTrace[] = [];
  const call = async (name: string, args: Obj) => {
    const r = await runTool(ctx, name, args);
    traces.push({ name, args, ok: r.ok, result: r.result });
    return r.result as Obj & Obj[];
  };
  const ids = findPlayers(ctx, question);
  for (const id of ids.slice(0, 3)) traces.push({ name: "searchPlayers", args: { query: playerName(ctx.player(id)) }, ok: true, result: [{ id, name: playerName(ctx.player(id)) }] });
  const n = (id: string) => playerName(ctx.player(id));
  const done = (answer: string): AskResult => ({ answer, provider: "mock", tools: traces });

  // Find a trade
  if (/find (me )?(a )?trade|trade .*accept|trade (idea|target)|who should i trade/.test(q)) {
    const t = (await call("findTrades", { focusGroup: posIn(question) })) as unknown as Obj[];
    if (!t.length) return done("I couldn't find a trade that improves your team without clearly hurting the other side. Your roster is efficiently built — focus on waivers.");
    const lines = t.slice(0, 3).map((x) => `- **${x.style}** with ${x.partner}: give ${(x.give as string[]).join(" + ")} for ${(x.get as string[]).join(" + ")} — you ${fmtPct(x.userBenefitPct as number)}, them ${fmtPct(x.partnerBenefitPct as number)} (calculated), fairness ${x.fairness}/100, acceptance estimate **${x.acceptance}**.`);
    const top = t[0];
    return done(`Here are trades that help **both** rosters:\n\n${lines.join("\n")}\n\nWhy ${top.partner} might say yes: ${(top.whyTheyAccept as string[]).slice(0, 2).join("; ").toLowerCase()}.\n\nAcceptance is a heuristic estimate — it can't know another manager's preferences.`);
  }

  // Evaluate a specific trade
  if (ids.length >= 2 && /trade|for |swap|deal/.test(q)) {
    const mine = ids.filter((id) => ctx.ownerOf(id) === ctx.userTeamId);
    const theirs = ids.filter((id) => ctx.ownerOf(id) !== ctx.userTeamId);
    const aGives = mine.length ? mine : [ids[0]];
    const bGives = mine.length ? theirs : ids.slice(1);
    const r = await call("simulateTrade", { aGives, bGives });
    if (r.error) return done(`I can't evaluate that trade: ${r.error}`);
    const a = r.a as Obj;
    const b = r.b as Obj;
    return done(`**${r.verdict}** — fairness ${r.fairness}/100 (calculated).\n\n- **${a.team}** (sends ${aGives.map(n).join(" + ")}): weekly lineup ${signed(a.weeklyDelta as number)} pts, title odds ${a.titleOdds} (simulated). ${(a.notes as string[]).slice(0, 2).join(". ")}\n- **${b.team}** (sends ${bGives.map(n).join(" + ")}): weekly lineup ${signed(b.weeklyDelta as number)} pts, title odds ${b.titleOdds}. ${(b.notes as string[]).slice(0, 2).join(". ")}\n\nAcceptance estimate: **${(r.acceptance as Obj).level}** — ${((r.acceptance as Obj).reasons as string[]).slice(0, 2).join("; ").toLowerCase()}. Projections are model estimates, not guarantees.`);
  }

  // Start / sit
  if (ids.length >= 2 && /start|sit|bench|or /.test(q)) {
    const r = await call("comparePlayers", { playerA: ids[0], playerB: ids[1] });
    const ss = r.startSit as Obj;
    const ex = ss.explanation as string[];
    return done(`**Start ${n(ss.pick as string)}.**\n\n- ${ex[2]}\n- ${ex[0]}\n- ${ex[1]}\n- ${ex[3]}\n\nThese are projections (floor–median–ceiling ≈ 20th/50th/80th percentile), not certainties.`);
  }

  // Scenario: who benefits if X sits
  if (ids.length >= 1 && /(sits|out|miss|ruled out|injur|benefit|if .* (rest|doesn))/.test(q)) {
    const r = await call("simulateScenario", { playerId: ids[0], type: "out" });
    const ben = (r.beneficiaries as Obj[]).filter((x) => (x.delta as number) > 0).slice(0, 4);
    if (!ben.length) return done(`If ${n(ids[0])} is out, no teammate's projection moves meaningfully in our usage model.`);
    return done(`If **${n(ids[0])}** is out, the biggest fantasy beneficiaries (projected, per game):\n\n${ben.map((x) => `- **${x.name}**: ${x.before} → ${x.after} (${signed(x.delta as number)}), positional rank ${x.rank}${x.freeAgent ? ` — free agent, waiver priority **${x.waiverPriority}**` : ""}`).join("\n")}\n\nChain: ${(r.chain as string[]).join(" → ")}.`);
  }

  // Breakouts
  if (/break ?out|about to pop|sleeper|emerg/.test(q)) {
    const r = (await call("findBreakouts", { position: posIn(question), limit: 5 })) as unknown as Obj[];
    if (!r.length) return done("No players currently show a clear opportunity-ahead-of-production gap at that position.");
    return done(`Players whose **opportunity is outpacing production** (calculated):\n\n${r.map((x) => { const c = x.calculated as Obj; return `- **${x.name}** (${x.position}, ${x.team}, ${x.fantasyOwner === "FREE AGENT" ? "free agent" : x.fantasyOwner}): opportunity ${c.opportunityScore} vs production ${c.productionScore}, trend ${String(c.opportunityTrend).toLowerCase()}.`; }).join("\n")}\n\nA breakout signal means usage is rising before points catch up — it is not a guarantee.`);
  }

  // Regression
  if (/regress|overperform|sustainab|sell high|lucky/.test(q)) {
    const r = (await call("findRegressionCandidates", { position: posIn(question), limit: 5 })) as unknown as Obj[];
    if (!r.length) return done("No fantasy-relevant player is meaningfully outproducing their usage right now.");
    return done(`Players producing **above what their usage supports** (calculated):\n\n${r.map((x) => `- **${x.name}** (${x.position}): ${Math.round(((x.ratio as number) - 1) * 100)}% above expected-from-usage${x.tdShare !== null ? `, ${Math.round((x.tdShare as number) * 100)}% of points from TDs` : ""} — ${(x.calculated as Obj).sustainability}.`).join("\n")}\n\nConsider selling while the box score looks better than the role.`);
  }

  // Waivers
  if (/waiver|pick ?up|free agent|add |drop/.test(q)) {
    const r = (await call("getWaivers", { limit: 4 })) as unknown as Obj[];
    if (!r.length) return done("No free agent improves your optimal lineup right now.");
    return done(`**Best pickups for your roster:**\n\n${r.map((x) => `- **${x.player}** — roster fit ${x.rosterFit} (${x.priority}). ${(x.reasons as string[])[0]}. Drop: ${x.drop ?? "—"} (${signed(x.weeklyGain as number)} pts/week).`).join("\n")}`);
  }

  // Single player
  if (ids.length === 1) {
    const prof = await call("getPlayerProfile", { playerId: ids[0] });
    const av = await call("getPlayerAvailability", { playerId: ids[0] });
    const op = await call("getPlayerOpportunity", { playerId: ids[0] });
    const pr = prof.projected as Obj;
    const c = prof.calculated as Obj;
    return done(`**${prof.name}** (${prof.position}, ${prof.team}) — value ${c.value} · **${c.label}**.\n\n- Projected (week ${pr.week}): ${pr.floor}–**${pr.median}**–${pr.ceiling}${(pr.gamesInWeek as number) > 1 ? ` per game × ${pr.gamesInWeek} games` : ""}, confidence ${Math.round((pr.confidence as number) * 100)}%.\n- Opportunity ${op.score}/100, ${String(op.trend).toLowerCase()} (calculated).\n- Availability ${av.score}/100 — ${String(av.expectedToPlay).toLowerCase()} to play; workload uncertainty ${String(av.workloadUncertainty).toLowerCase()}.\n- Market rank ${prof.position}${(prof.market as Obj).consensusPosRank} vs model ${prof.position}${prof.modelPosRank}; sustainability: ${c.sustainability}.${(c.tags as string[]).length ? `\n- Signals: ${(c.tags as string[]).join(", ")}.` : ""}`);
  }

  // Matchup
  if (/win|matchup|this week|favored|chance/.test(q)) {
    const m = await call("getMatchupContext", {});
    return done(`You're projected **${m.projected}** vs ${m.opponent}'s **${m.opponentProjected}** — a **${Math.round((m.winProbability as number) * 100)}%** model win probability (±${m.sd} pts one-sigma). ${(m.winProbability as number) < 0.4 ? "As an underdog, lean toward high-ceiling options in close start/sit calls." : (m.winProbability as number) > 0.62 ? "You're favored — prefer high-floor plays in close calls." : "It's close — go with median projections."}`);
  }

  // Default: roster health
  const r = await call("analyzeRoster", {});
  const w = (r.weaknesses as Obj[]).filter((x) => x.severity === "CRITICAL" || x.severity === "MODERATE").slice(0, 3);
  const s = r.scores as Obj;
  return done(`Your team grades **${s.overall}/100** vs the league (lineup ${s.lineup}, depth ${s.depth}, upside ${s.upside}; calculated).\n\n${w.length ? `Biggest needs:\n${w.map((x) => `- **${x.slot}** (${x.severity}) — ${x.note}`).join("\n")}` : "No critical weaknesses."}\n\nTry: "Find me a trade", "Who should I pick up?", or name two players to compare.`);
}

const signed = (v: number) => `${v > 0 ? "+" : ""}${v}`;
const fmtPct = (v: number) => `${v > 0 ? "+" : ""}${v}%`;
