import { prisma } from "@/lib/prisma";
import { normalizeAppUrl } from "@/lib/site-url";
import { getCanonicalCharacterName } from "@/utils/characterMapping";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

interface TeamRankingQueryResult {
  id: bigint;
  player_one_id: bigint;
  player_one_name: string | null;
  player_one_display_name: string | null;
  player_one_country: string | null;
  player_one_picture: string | null;
  player_one_solo_team: boolean;
  player_one_main_character: string | null;
  player_two_id: bigint;
  player_two_name: string | null;
  player_two_display_name: string | null;
  player_two_country: string | null;
  player_two_picture: string | null;
  player_two_solo_team: boolean;
  player_two_main_character: string | null;
  is_solo_team: boolean;
  team_name: string | null;
  logo: string | null;
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
  solo_team: boolean;
  main_character: string | null;
}

interface TransformedTeamRanking {
  id: string;
  team_name: string | null;
  logo: string | null;
  is_solo_team: boolean;
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
    WITH visible_two_v_two_matches AS (
      SELECT
        m.id,
        m.created_at
      FROM matches m
      JOIN match_participants mp_count ON mp_count.match_id = m.id
      WHERE m.archived = false
        AND NOT EXISTS (
          SELECT 1
          FROM match_participants mp_hidden
          JOIN players p_hidden ON p_hidden.id = mp_hidden.player
          WHERE mp_hidden.match_id = m.id
            AND mp_hidden.is_cpu = false
            AND p_hidden.banned = true
        )
      GROUP BY m.id, m.created_at
      HAVING COUNT(*) FILTER (WHERE mp_count.is_cpu = false) = 4
        AND COUNT(*) FILTER (
          WHERE mp_count.is_cpu = false AND mp_count.has_won = true
        ) = 2
        AND COUNT(*) FILTER (
          WHERE mp_count.is_cpu = false AND mp_count.has_won = false
        ) = 2
    ),
    eligible_team_rankings AS (
      SELECT
        tr.id,
        tr.player_one AS player_one_id,
        p1.name AS player_one_name,
        p1.display_name AS player_one_display_name,
        p1.country AS player_one_country,
        p1.picture AS player_one_picture,
        p1.solo_team AS player_one_solo_team,
        p1_main.smash_character AS player_one_main_character,
        tr.player_two AS player_two_id,
        p2.name AS player_two_name,
        p2.display_name AS player_two_display_name,
        p2.country AS player_two_country,
        p2.picture AS player_two_picture,
        p2.solo_team AS player_two_solo_team,
        p2_main.smash_character AS player_two_main_character,
        (p1.solo_team OR p2.solo_team) AS is_solo_team,
        tr.team_name,
        tr.logo,
        tr.elo,
        tr.total_wins,
        tr.total_losses,
        tr.total_kos,
        tr.total_falls,
        tr.total_sds,
        tr.current_win_streak,
        tr.last_match_date,
        ROW_NUMBER() OVER (
          PARTITION BY CASE
            WHEN p1.solo_team AND p2.solo_team
              THEN 'solo:' || LEAST(tr.player_one, tr.player_two)::text
            WHEN p1.solo_team
              THEN 'solo:' || tr.player_one::text
            WHEN p2.solo_team
              THEN 'solo:' || tr.player_two::text
            ELSE LEAST(tr.player_one, tr.player_two)::text
              || ':'
              || GREATEST(tr.player_one, tr.player_two)::text
          END
          ORDER BY tr.id ASC
        ) AS team_row_rank
      FROM team_rankings tr
      JOIN players p1 ON p1.id = tr.player_one
      JOIN players p2 ON p2.id = tr.player_two
      LEFT JOIN LATERAL (
        SELECT mp.smash_character
        FROM match_participants mp
        JOIN visible_two_v_two_matches vtvm ON vtvm.id = mp.match_id
        WHERE mp.player = p1.id
          AND mp.is_cpu = false
        GROUP BY mp.smash_character
        ORDER BY
          COUNT(*) DESC,
          MAX(vtvm.created_at) DESC,
          mp.smash_character ASC
        LIMIT 1
      ) p1_main ON true
      LEFT JOIN LATERAL (
        SELECT mp.smash_character
        FROM match_participants mp
        JOIN visible_two_v_two_matches vtvm ON vtvm.id = mp.match_id
        WHERE mp.player = p2.id
          AND mp.is_cpu = false
        GROUP BY mp.smash_character
        ORDER BY
          COUNT(*) DESC,
          MAX(vtvm.created_at) DESC,
          mp.smash_character ASC
        LIMIT 1
      ) p2_main ON true
      WHERE (
          (p1.solo_team AND p1.banned = false)
          OR (p2.solo_team AND p2.banned = false)
          OR (p1.banned = false AND p2.banned = false)
        )
    )
    SELECT
      id,
      player_one_id,
      player_one_name,
      player_one_display_name,
      player_one_country,
      player_one_picture,
      player_one_solo_team,
      player_one_main_character,
      player_two_id,
      player_two_name,
      player_two_display_name,
      player_two_country,
      player_two_picture,
      player_two_solo_team,
      player_two_main_character,
      is_solo_team,
      team_name,
      logo,
      elo,
      total_wins,
      total_losses,
      total_kos,
      total_falls,
      total_sds,
      current_win_streak,
      last_match_date
    FROM eligible_team_rankings
    WHERE team_row_rank = 1
    ORDER BY
      elo DESC,
      current_win_streak DESC,
      total_wins DESC,
      COALESCE(player_one_display_name, player_one_name) ASC,
      COALESCE(player_two_display_name, player_two_name) ASC;
  `;

  const result = (await prisma.$queryRawUnsafe(query)) as TeamRankingQueryResult[];

  return result.map((teamRanking) => ({
    id: teamRanking.id.toString(),
    team_name: teamRanking.team_name,
    logo: normalizeAppUrl(teamRanking.logo),
    is_solo_team: teamRanking.is_solo_team,
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
      solo_team: teamRanking.player_one_solo_team,
      main_character: teamRanking.player_one_main_character
        ? getCanonicalCharacterName(teamRanking.player_one_main_character)
        : null,
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
      solo_team: teamRanking.player_two_solo_team,
      main_character: teamRanking.player_two_main_character
        ? getCanonicalCharacterName(teamRanking.player_two_main_character)
        : null,
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
  ["team-rankings-data-all-curated-teams-with-2v2-mains"],
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
