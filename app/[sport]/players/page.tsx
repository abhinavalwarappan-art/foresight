import { Suspense } from "react";
import { PlayerTable } from "@/components/player/PlayerTable";
import { KindTag } from "@/components/ui/badges";
import { PageHeader, Skeleton } from "@/components/ui/cards";
import type { Sport } from "@/lib/domain/types";
import { playersData } from "@/lib/services/views";

export const metadata = { title: "Players" };

export default async function Players({ params }: { params: Promise<{ sport: Sport }> }) {
  const { sport } = await params;
  const players = await playersData(sport);
  const positions = sport === "nfl" ? ["QB", "RB", "WR", "TE"] : ["PG", "SG", "SF", "PF", "C"];
  return (
    <>
      <PageHeader eyebrow="Player intelligence" title="Every player, priced like an asset"
        sub={<>Value blends rest-of-season projection and replacement level. <KindTag kind="market" /> rank is the crowd consensus; our <KindTag kind="projected" /> rank is the model. The gap is the opportunity.</>} />
      <Suspense fallback={<Skeleton className="h-[600px]" />}>
        <PlayerTable players={players} sport={sport} positions={positions} />
      </Suspense>
    </>
  );
}
