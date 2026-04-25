import SmashTournamentELO from "@/components/SmashTournamentELO";
import { Suspense } from "react";

export default function MatchupsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SmashTournamentELO defaultTab="matchups" />
    </Suspense>
  );
}
