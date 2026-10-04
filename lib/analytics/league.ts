import { type AnalyticsContext, round1 } from "./context";
import { analyzeRoster, leagueProfiles } from "./roster";
import { baselineOdds } from "./simulation";

export interface PowerRow {
  teamId: string;
  rank: number;
  power: number;
  record: string;
  expectedRecord: string; // all-play based
  rosStrength: number;
  depth: number;
  upside: number;
  risk: number;
  playoffProb: number;
  champProb: number;
  pointsFor: number;
}

export function powerRankings(ctx: AnalyticsContext): PowerRow[] {
  const { snap } = ctx;
  const odds = baselineOdds(ctx);
  const profiles = leagueProfiles(ctx);
  // All-play expected wins over completed weeks
  const weeks = new Map<number, { team: string; pts: number }[]>();
  for (const m of snap.matchups) {
    if (m.homePoints === null || m.awayPoints === null) continue;
    const arr = weeks.get(m.week) ?? [];
    arr.push({ team: m.homeTeamId, pts: m.homePoints }, { team: m.awayTeamId, pts: m.awayPoints });
    weeks.set(m.week, arr);
  }
  const allPlay = new Map(snap.fantasyTeams.map((t) => [t.id, 0]));
  for (const arr of weeks.values()) {
    for (const x of arr) allPlay.set(x.team, allPlay.get(x.team)! + arr.filter((y) => y.team !== x.team && y.pts < x.pts).length / (arr.length - 1));
  }
  const rows = snap.fantasyTeams.map((t) => {
    const r = analyzeRoster(ctx, t.id);
    const games = t.wins + t.losses + t.ties;
    const xw = round1(allPlay.get(t.id) ?? 0);
    const o = odds.get(t.id)!;
    return {
      teamId: t.id, rank: 0,
      power: Math.round(r.scores.lineup * 0.5 + r.scores.ros * 0.2 + o.playoffProb * 0.3),
      record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`,
      expectedRecord: `${xw}-${round1(games - xw)}`,
      rosStrength: profiles.get(t.id)!.weeklyRos, depth: r.scores.depth, upside: r.scores.upside,
      risk: 100 - r.scores.availability, playoffProb: o.playoffProb, champProb: o.champProb, pointsFor: t.pointsFor,
    };
  });
  rows.sort((a, b) => b.power - a.power);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
