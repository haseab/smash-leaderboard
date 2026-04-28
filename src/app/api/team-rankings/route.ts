import { prisma } from "@/lib/prisma";
import { normalizeAppUrl } from "@/lib/site-url";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

interface TeamRankingQueryResult {
  id: bigint;
  player_one_id: bigint;
  player_one_name: string | null;
  player_one_display_name: string | null;
  player_one_country: string | null;
  player_one_picture: string | null;
  player_two_id: bigint;
  player_two_name: string | null;
  player_two_display_name: string | null;
  player_two_country: string | null;
  player_two_picture: string | null;
  elo: bigint;
  total_wins: number;
  total_losses: number;
  total_kos: number;
  total_falls: number;
  total_sds: number;
  current_win_streak: number;
  last_match_date: Date | null;
}

interface TeamRankingPlayer {
  id: number;
  name: string;
  display_name: string | null;
  country: string | null;
  picture: string | null;
}

interface TransformedTeamRanking {
  id: string;
  player_one: TeamRankingPlayer;
  player_two: TeamRankingPlayer;
  elo: number;
  matches: number;
  total_wins: number;
  total_losses: number;
  total_kos: number;
  total_falls: number;
  total_sds: number;
  current_win_streak: number;
  last_match_date: string | null;
}

const getFallbackPlayerName = (
  playerId: bigint,
  name: string | null,
  displayName: string | null
) => name || displayName || `Player ${Number(playerId)}`;

async function fetchTeamRankingsFromDb(): Promise<TransformedTeamRanking[]> {
  const query = `
    SELECT
      tr.id,
      tr.player_one AS player_one_id,
      p1.name AS player_one_name,
      p1.display_name AS player_one_display_name,
      p1.country AS player_one_country,
      p1.picture AS player_one_picture,
      tr.player_two AS player_two_id,
      p2.name AS player_two_name,
      p2.display_name AS player_two_display_name,
      p2.country AS player_two_country,
      p2.picture AS player_two_picture,
      tr.elo,
      tr.total_wins,
      tr.total_losses,
      tr.total_kos,
      tr.total_falls,
      tr.total_sds,
      tr.current_win_streak,
      tr.last_match_date
    FROM team_rankings tr
    JOIN players p1 ON p1.id = tr.player_one
    JOIN players p2 ON p2.id = tr.player_two
    WHERE p1.banned = false
      AND p2.banned = false
      AND p1.top_ten_played >= 3
      AND p2.top_ten_played >= 3
      AND (tr.total_wins + tr.total_losses) >= 3
    ORDER BY
      tr.elo DESC,
      tr.current_win_streak DESC,
      tr.total_wins DESC,
      COALESCE(p1.display_name, p1.name) ASC,
      COALESCE(p2.display_name, p2.name) ASC;
  `;

  const result = (await prisma.$queryRawUnsafe(query)) as TeamRankingQueryResult[];

  return result.map((teamRanking) => ({
    id: teamRanking.id.toString(),
    player_one: {
      id: Number(teamRanking.player_one_id),
      name: getFallbackPlayerName(
        teamRanking.player_one_id,
        teamRanking.player_one_name,
        teamRanking.player_one_display_name
      ),
      display_name: teamRanking.player_one_display_name,
      country: teamRanking.player_one_country,
      picture: normalizeAppUrl(teamRanking.player_one_picture),
    },
    player_two: {
      id: Number(teamRanking.player_two_id),
      name: getFallbackPlayerName(
        teamRanking.player_two_id,
        teamRanking.player_two_name,
        teamRanking.player_two_display_name
      ),
      display_name: teamRanking.player_two_display_name,
      country: teamRanking.player_two_country,
      picture: normalizeAppUrl(teamRanking.player_two_picture),
    },
    elo: Number(teamRanking.elo),
    matches: teamRanking.total_wins + teamRanking.total_losses,
    total_wins: teamRanking.total_wins,
    total_losses: teamRanking.total_losses,
    total_kos: teamRanking.total_kos,
    total_falls: teamRanking.total_falls,
    total_sds: teamRanking.total_sds,
    current_win_streak: teamRanking.current_win_streak,
    last_match_date: teamRanking.last_match_date
      ? teamRanking.last_match_date.toISOString()
      : null,
  }));
}

const getCachedTeamRankings = unstable_cache(
  fetchTeamRankingsFromDb,
  ["team-rankings-data-with-inactive"],
  {
    tags: ["players"],
  }
);

export async function GET() {
  try {
    console.log("[GET /api/team-rankings] Fetching team rankings (cached)...");

    const teamRankings = await getCachedTeamRankings();

    console.log(
      "[GET /api/team-rankings] Returning",
      teamRankings.length,
      "rows"
    );

    return NextResponse.json(teamRankings);
  } catch (error) {
    console.error(
      "[GET /api/team-rankings] Error fetching team rankings:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to fetch team rankings",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
