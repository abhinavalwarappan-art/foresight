import Link from "next/link";
import { Logo } from "@/components/shell/Logo";
import { KindTag } from "@/components/ui/badges";
import { Card, CardHeader, MetricCard, PageHeader } from "@/components/ui/cards";
import { backtest } from "@/lib/analytics/backtest";
import { loadContext } from "@/lib/services/core";
import { requireAdmin } from "@/lib/admin/guard";

export const metadata = { title: "Model performance", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Internal page. Gate behind auth/role before exposing in production. */
export default async function ModelPerformance() {
  await requireAdmin();
  const sections = await Promise.all((["nfl", "nba"] as const).map(async (sport) => {
    const { ctx } = await loadContext(sport);
    return { sport, report: backtest(ctx.snap), isMock: ctx.snap.isMock };
  }));
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <Link href="/nfl" className="mb-8 inline-block"><Logo /></Link>
      <PageHeader eyebrow="Internal · backtesting" title="Model performance"
        sub={<>Walk-forward evaluation: each week is projected using only earlier data, then scored against actual results. Predictions are versioned and never overwritten (see <code className="font-mono text-xs">projection_snapshots</code>). <KindTag kind="calculated" /></>} />
      {sections.map(({ sport, report, isMock }) => (
        <section key={sport} className="mb-12">
          <div className="mb-4 flex items-center gap-3"><h2 className="font-mono text-sm font-semibold tracking-[0.16em]">{sport.toUpperCase()}</h2><span className="font-mono text-[11px] text-fg-dim">{report.modelVersion}{isMock ? " · mock data" : ""}</span></div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <MetricCard label="MAE" value={report.overall.mae} sub={sport === "nfl" ? "pts / player-week" : "pts / player-week"} accent="electric" />
            <MetricCard label="Baseline MAE" value={report.overall.baselineMae} sub="season-average naive" />
            <MetricCard label="RMSE" value={report.overall.rmse} />
            <MetricCard label="Bias" value={report.overall.bias} sub="+ = over-projects" />
            <MetricCard label="Range coverage" value={`${report.overall.coverage}%`} sub="target ≈ 60% (20th–80th)" />
            <MetricCard label="Rank corr." value={report.overall.rankCorr} sub="Spearman within position" />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="overflow-x-auto">
              <CardHeader eyebrow="By week" title="Walk-forward results" />
              <table className="mt-2 w-full text-sm">
                <thead><tr className="eyebrow border-b border-line [&>th]:px-5 [&>th]:py-2 [&>th]:text-right [&>th]:font-normal"><th className="!text-left">Week</th><th>N</th><th>MAE</th><th>Baseline</th><th>Bias</th><th>Coverage</th><th>ρ</th></tr></thead>
                <tbody>{report.weeks.map((w) => (
                  <tr key={w.week} className="border-b border-line/60 [&>td]:px-5 [&>td]:py-2 [&>td]:text-right">
                    <td className="!text-left font-mono">W{w.week}</td><td className="num">{w.n}</td>
                    <td className={`num ${w.mae < w.baselineMae ? "text-up" : "text-down"}`}>{w.mae}</td><td className="num text-fg-muted">{w.baselineMae}</td>
                    <td className="num">{w.bias}</td><td className="num">{w.coverage}%</td><td className="num">{w.rankCorr}</td>
                  </tr>
                ))}</tbody>
              </table>
            </Card>
            <Card>
              <CardHeader eyebrow="Calibration" title="Projected vs actual by projection bucket" />
              <div className="space-y-2 px-5 pb-5 pt-3">
                {report.calibration.map((c) => {
                  const max = Math.max(...report.calibration.map((x) => Math.max(x.predicted, x.actual)), 1);
                  return (
                    <div key={c.bucket} className="grid grid-cols-[70px_1fr_80px] items-center gap-3 text-xs">
                      <span className="num text-fg-dim">{c.bucket}</span>
                      <div className="space-y-1">
                        <div className="h-1.5 rounded-full bg-cyan/70" style={{ width: `${(c.predicted / max) * 100}%` }} />
                        <div className="h-1.5 rounded-full bg-white/50" style={{ width: `${(c.actual / max) * 100}%` }} />
                      </div>
                      <span className="num text-right text-fg-muted">{c.predicted} / {c.actual} <span className="text-fg-dim">n{c.n}</span></span>
                    </div>
                  );
                })}
                <p className="pt-2 text-[11px] text-fg-dim"><span className="text-cyan">■</span> projected mean · <span className="text-white/60">■</span> actual mean. Well-calibrated buckets have equal bars.</p>
              </div>
            </Card>
          </div>
        </section>
      ))}
      <p className="text-xs text-fg-dim">Next: compare against external projection sources where licensing allows, and persist every run to <code className="font-mono">model_predictions</code> / <code className="font-mono">model_outcomes</code>.</p>
    </div>
  );
}
