import { addUtcDays, parseUtcDate } from "@/lib/dateRange";
import { prisma } from "@/lib/prisma";
import { normalizeAppUrl } from "@/lib/site-url";
import { getCanonicalCharacterName } from "@/utils/characterMapping";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

interface PlayerQueryResult {
  id: bigint;
  created_at: Date;
  name: string;
  display_name: string | null;
  elo: bigint;
  country: string | null;
  picture: string | null;
  inactive: boolean;
  solo_team: boolean;
  top_ten_played: number;
  main_character: string | null;
  total_wins: bigint;
  total_losses: bigint;
  total_kos: bigint;
  total_falls: bigint;
  total_sds: bigint;
  current_win_streak: bigint;
  last_one_v_one_won: boolean | null;
  is_ranked: boolean;
  last_match_date: Date | null;
}

interface TransformedPlayer {
  id: number;
  created_at: string;
  name: string;
  display_name: string | null;
  elo: number;
  inactive: boolean;
  solo_team: boolean;
  is_ranked: boolean;
  top_ten_played: number;
  country: string | null;
  picture: string | null;
  main_character: string | null;
  total_wins: number;
  total_losses: number;
  total_kos: number;
  total_falls: number;
  total_sds: number;
  current_win_streak: number;
  last_one_v_one_won: boolean | null;
  last_match_date: string | null;
}

async function fetchPlayersFromDb(
  startDate: Date | null = null,
  endDate: Date | null = null
): Promise<TransformedPlayer[]> {
  const queryParams: Date[] = [];
  const oneVOneMatchDateFilters: string[] = [];

  if (startDate) {
    queryParams.push(startDate);
    oneVOneMatchDateFilters.push(
      `      AND vm.created_at >= $${queryParams.length}`
    );
  }

  if (endDate) {
    queryParams.push(addUtcDays(endDate, 1));
    oneVOneMatchDateFilters.push(
      `      AND vm.created_at < $${queryParams.length}`
    );
  }

  const oneVOneMatchDateFilter = oneVOneMatchDateFilters.join("\n");
  const query = `
  WITH
  -- Matches that are visible in the app (exclude archived and any match with a banned human player)
  visible_matches AS (
    SELECT
      m.id,
      m.created_at
    FROM matches m
    WHERE m.archived = false
      AND NOT EXISTS (
        SELECT 1
        FROM match_participants mp_hidden
        JOIN players p_hidden ON p_hidden.id = mp_hidden.player
        WHERE mp_hidden.match_id = m.id
          AND mp_hidden.is_cpu = false
          AND p_hidden.banned = true
      )
  ),

  -- Get 1v1 matches only (exactly 2 non-CPU participants)
  one_v_one_matches AS (
    SELECT vm.id as match_id
    FROM visible_matches vm
    JOIN match_participants mp ON vm.id = mp.match_id
    WHERE mp.is_cpu = false
${oneVOneMatchDateFilter}
    GROUP BY vm.id
    HAVING COUNT(*) = 2
  ),

  -- Main character calculation (mode of smash_character)
  main_chars AS (
    SELECT
      mp.player,
      mp.smash_character,
      COUNT(*) as char_count,
      ROW_NUMBER() OVER (PARTITION BY mp.player ORDER BY COUNT(*) DESC, mp.smash_character) as rn
    FROM match_participants mp
    JOIN one_v_one_matches ovm ON mp.match_id = ovm.match_id
    WHERE mp.is_cpu = false
    GROUP BY mp.player, mp.smash_character
  ),

  -- Player stats from 1v1 matches only
  player_stats AS (
    SELECT
      mp.player,
      COUNT(*) FILTER (WHERE mp.has_won = true) as total_wins,
      COUNT(*) FILTER (WHERE mp.has_won = false) as total_losses,
      COALESCE(SUM(mp.total_kos), 0) as total_kos,
      COALESCE(SUM(mp.total_falls), 0) as total_falls,
      COALESCE(SUM(mp.total_sds), 0) as total_sds
    FROM match_participants mp
    JOIN one_v_one_matches ovm ON mp.match_id = ovm.match_id
    WHERE mp.is_cpu = false
    GROUP BY mp.player
  ),

  -- Current win streak (consecutive wins from most recent matches)
  -- First, get all matches ordered for each player
  ordered_player_matches AS (
    SELECT
      mp.player,
      mp.has_won,
      ROW_NUMBER() OVER (PARTITION BY mp.player ORDER BY m.created_at DESC, m.id DESC) as match_order
    FROM match_participants mp
    JOIN one_v_one_matches ovm ON mp.match_id = ovm.match_id
    JOIN visible_matches m ON mp.match_id = m.id
    WHERE mp.is_cpu = false
  ),
  -- Find the first loss for each player
  first_losses AS (
    SELECT
      player,
      MIN(match_order) as first_loss_order
    FROM ordered_player_matches
    WHERE has_won = false
    GROUP BY player
  ),
  -- Calculate win streak: count wins before first loss
  win_streaks AS (
    SELECT
      opm.player,
      COUNT(*) as current_win_streak
    FROM ordered_player_matches opm
    LEFT JOIN first_losses fl ON opm.player = fl.player
    WHERE opm.has_won = true
      AND (fl.first_loss_order IS NULL OR opm.match_order < fl.first_loss_order)
    GROUP BY opm.player
  ),

  -- Most recent 1v1 result for each player
  last_one_v_one_results AS (
    SELECT
      player,
      has_won as last_one_v_one_won
    FROM ordered_player_matches
    WHERE match_order = 1
  ),

  -- Last match date for each player (from all matches, not just 1v1)
  last_match_dates AS (
    SELECT
      mp.player,
      MAX(m.created_at) as last_match_date
    FROM match_participants mp
    JOIN visible_matches m ON mp.match_id = m.id
    WHERE mp.is_cpu = false
    GROUP BY mp.player
  )

  -- Final query combining all CTEs
  SELECT
    p.id,
    p.created_at,
    p.name,
    p.display_name,
    p.elo,
    p.country,
    p.picture,
    p.inactive,
    p.solo_team,
    p.top_ten_played,
    COALESCE(mc.smash_character, NULL) as main_character,
    COALESCE(ps.total_wins, 0) as total_wins,
    COALESCE(ps.total_losses, 0) as total_losses,
    COALESCE(ps.total_kos, 0) as total_kos,
    COALESCE(ps.total_falls, 0) as total_falls,
    COALESCE(ps.total_sds, 0) as total_sds,
    COALESCE(ws.current_win_streak, 0) as current_win_streak,
    loor.last_one_v_one_won,
    CASE WHEN p.top_ten_played >= 3 THEN true ELSE false END as is_ranked,
    lmd.last_match_date
  FROM players p
  LEFT JOIN main_chars mc ON p.id = mc.player AND mc.rn = 1
  LEFT JOIN player_stats ps ON p.id = ps.player
  LEFT JOIN win_streaks ws ON p.id = ws.player
  LEFT JOIN last_one_v_one_results loor ON p.id = loor.player
  LEFT JOIN last_match_dates lmd ON p.id = lmd.player
  WHERE p.banned = false
  ORDER BY p.elo DESC;
  `;

  const result = (await prisma.$queryRawUnsafe(
    query,
    ...queryParams
  )) as PlayerQueryResult[];

  // Transform BigInt values to numbers for JSON serialization
  const transformedPlayers = result.map((player) => ({
    id: Number(player.id),
    created_at: player.created_at.toISOString(),
    name: player.name,
    display_name: player.display_name,
    elo: Number(player.elo),
    inactive: player.inactive,
    solo_team: player.solo_team,
    is_ranked: player.is_ranked,
    top_ten_played: player.top_ten_played,
    country: player.country,
    picture: normalizeAppUrl(player.picture),
    main_character: player.main_character
      ? getCanonicalCharacterName(player.main_character)
      : null,
    total_wins: Number(player.total_wins),
    total_losses: Number(player.total_losses),
    total_kos: Number(player.total_kos),
    total_falls: Number(player.total_falls),
    total_sds: Number(player.total_sds),
    current_win_streak: Number(player.current_win_streak),
    last_one_v_one_won: player.last_one_v_one_won,
    last_match_date: player.last_match_date
      ? player.last_match_date.toISOString()
      : null,
  }));

  return transformedPlayers;
}

// Cache the expensive query - only revalidated when "players" tag is invalidated
const getCachedPlayers = unstable_cache(
  fetchPlayersFromDb,
  ["players-data-with-solo-team-and-last-1v1-result"],
  {
    tags: ["players"],
    // No automatic revalidation - only on-demand via revalidateTag("players")
  }
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDateInput = searchParams.get("startDate");
    const endDateInput = searchParams.get("endDate");
    const startDate = parseUtcDate(startDateInput);
    const endDate = parseUtcDate(endDateInput);

    if ((startDateInput && !startDate) || (endDateInput && !endDate)) {
      return NextResponse.json(
        { error: "Invalid date filter" },
        { status: 400 }
      );
    }

    if (startDate && endDate && startDate > endDate) {
      return NextResponse.json(
        { error: "Start date must be on or before the end date" },
        { status: 400 }
      );
    }

    const hasDateFilter = Boolean(startDate || endDate);

    console.log(
      hasDateFilter
        ? "[GET /api/players] Fetching players with date filter..."
        : "[GET /api/players] Fetching players (cached)..."
    );

    const players = hasDateFilter
      ? await fetchPlayersFromDb(startDate, endDate)
      : await getCachedPlayers();

    console.log(
      "[GET /api/players] Returning",
      players.length,
      "players"
    );

    return NextResponse.json(players);
  } catch (error) {
    console.error("[GET /api/players] Error fetching players:", error);
    const errorWithMeta = error as Error & { meta?: unknown; code?: string };
    const errorDetails: Record<string, unknown> = {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
    if (errorWithMeta.meta) {
      errorDetails.meta = errorWithMeta.meta;
    }
    if (errorWithMeta.code) {
      errorDetails.code = errorWithMeta.code;
    }
    console.error("[GET /api/players] Error details:", errorDetails);
    return NextResponse.json(
      {
        error: "Failed to fetch players",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
