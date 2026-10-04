import { Suspense } from "react";
import { TradeLab } from "@/components/trade/TradeLab";
import { PageHeader, Skeleton } from "@/components/ui/cards";
import type { Sport } from "@/lib/domain/types";
import { tradeLabData } from "@/lib/services/views";

export const metadata = { title: "Trade Lab" };

export default async function Trade({ params }: { params: Promise<{ sport: Sport }> }) {
  const { sport } = await params;
  const d = await tradeLabData(sport);
  return (
    <>
      <PageHeader eyebrow="Trade Lab" title={<>Both sides of every trade.</>}
        sub="Rosters swap, optimal lineups re-solve, the season re-simulates — then we show who actually gets better. Often, both teams do." />
      <Suspense fallback={<Skeleton className="h-[600px]" />}>
        <TradeLab sport={sport} teams={d.teams} userTeamId={d.userTeamId} />
      </Suspense>
    </>
  );
}
