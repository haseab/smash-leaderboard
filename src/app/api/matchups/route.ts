import { resolvePlayerPairByQueryValues } from "@/lib/server/playerQueryResolver";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

interface MatchupStats {
  wins: number;
  losses: number;
  totalKos: number;
  totalFalls: number;
  totalSds: number;
}

interface MatchupRecentMatch {
  id: number;
  created_at: string;
  player1Character: string;
  player1Kos: number;
  player1Falls: number;
  player1Sds: number;
  player1Won: boolean;
  player2Character: string;
  player2Kos: number;
  player2Falls: number;
  player2Sds: number;
  player2Won: boolean;
}

interface MatchupSummaryRow {
  overall_matches: number;
  total_matches: number;
  player1_available_characters: string[];
  player2_available_characters: string[];
  player1_stats: MatchupStats;
  player2_stats: MatchupStats;
  recent_matches: MatchupRecentMatch[];
}

type MatchupTimeRange = "all" | "7d" | "30d" | "1y" | "custom";

const parseStringArray = (values: string[]) =>
  Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  );

const isValidDateInput = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const parseUtcDate = (value: string | null) => {
  if (!value || !isValidDateInput(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const subtractDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() - days);
  return next;
};

const subtractYears = (date: Date, years: number) => {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() - years);
  return next;
};

const parseTimeRange = (value: string | null): MatchupTimeRange => {
  switch (value) {
    case "7d":
    case "30d":
    case "1y":
    case "custom":
      return value;
    default:
      return "all";
  }
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const recentLimitInput = Number(searchParams.get("recentLimit") || "5");
    const recentLimit = Number.isFinite(recentLimitInput)
      ? Math.min(Math.max(Math.floor(recentLimitInput), 5), 100)
      : 5;
    const playerOneQueryValue = searchParams.get("player1")?.trim() || "";
    const playerTwoQueryValue = searchParams.get("player2")?.trim() || "";
    const { playerOne, playerTwo } = await resolvePlayerPairByQueryValues([
      playerOneQueryValue,
      playerTwoQueryValue,
    ]);
    const playerOneId = playerOne ? Number(playerOne.id) : null;
    const playerTwoId = playerTwo ? Number(playerTwo.id) : null;
    const playerOneCharacter =
      searchParams.get("player1Character")?.trim() || "";
    const playerTwoCharacter =
      searchParams.get("player2Character")?.trim() || "";
    const playerOneExcludedCharacters = parseStringArray(
      searchParams
        .getAll("player1ExcludeCharacter")
        .filter((character) => character.trim() !== playerOneCharacter)
    );
    const playerTwoExcludedCharacters = parseStringArray(
      searchParams
        .getAll("player2ExcludeCharacter")
        .filter((character) => character.trim() !== playerTwoCharacter)
    );
    const timeRange = parseTimeRange(searchParams.get("timeRange"));
    const startDateInput = searchParams.get("startDate");
    const endDateInput = searchParams.get("endDate");

    if (!playerOneId || !playerTwoId) {
      return NextResponse.json(
        { error: "Two valid players are required." },
        { status: 400 }
      );
    }

    if (playerOneId === playerTwoId) {
      return NextResponse.json(
        { error: "Select two different players." },
        { status: 400 }
      );
    }

    const now = new Date();
    let rangeStart: Date | null = null;
    let rangeEndExclusive: Date | null = null;

    if (timeRange === "7d") {
      rangeStart = subtractDays(now, 7);
    } else if (timeRange === "30d") {
      rangeStart = subtractDays(now, 30);
    } else if (timeRange === "1y") {
      rangeStart = subtractYears(now, 1);
    } else if (timeRange === "custom") {
      const startDate = parseUtcDate(startDateInput);
      const endDate = parseUtcDate(endDateInput);

      if (!startDate || !endDate) {
        return NextResponse.json(
          { error: "A valid custom start and end date are required." },
          { status: 400 }
        );
      }

      if (startDate > endDate) {
        return NextResponse.json(
          { error: "Custom start date must be on or before the end date." },
          { status: 400 }
        );
      }

      rangeStart = startDate;
      rangeEndExclusive = addDays(endDate, 1);
    }

    const rangeStartFilter = rangeStart
      ? Prisma.sql`AND m.created_at >= ${rangeStart}`
      : Prisma.empty;
    const rangeEndFilter = rangeEndExclusive
      ? Prisma.sql`AND m.created_at < ${rangeEndExclusive}`
      : Prisma.empty;
    const playerOneCharacterFilter = playerOneCharacter
      ? Prisma.sql`AND h.player_one_character = ${playerOneCharacter}`
      : Prisma.empty;
    const playerTwoCharacterFilter = playerTwoCharacter
      ? Prisma.sql`AND h.player_two_character = ${playerTwoCharacter}`
      : Prisma.empty;
    const playerOneExcludedCharactersFilter =
      playerOneExcludedCharacters.length > 0
        ? Prisma.sql`AND h.player_one_character NOT IN (${Prisma.join(playerOneExcludedCharacters)})`
        : Prisma.empty;
    const playerTwoExcludedCharactersFilter =
      playerTwoExcludedCharacters.length > 0
        ? Prisma.sql`AND h.player_two_character NOT IN (${Prisma.join(playerTwoExcludedCharacters)})`
        : Prisma.empty;

    const [summaryRow] = await prisma.$queryRaw<MatchupSummaryRow[]>(Prisma.sql`
      WITH hidden_matches AS (
        SELECT DISTINCT mp_hidden.match_id
        FROM match_participants mp_hidden
        JOIN players p_hidden ON p_hidden.id = mp_hidden.player
        WHERE mp_hidden.is_cpu = false
          AND p_hidden.banned = true
      ),
      candidate_match_ids AS (
        SELECT
          m.id,
          m.created_at
        FROM match_participants mp1
        JOIN match_participants mp2
          ON mp2.match_id = mp1.match_id
         AND mp2.player = ${BigInt(playerTwoId)}
         AND mp2.is_cpu = false
        JOIN matches m ON m.id = mp1.match_id
        LEFT JOIN hidden_matches hm ON hm.match_id = m.id
        WHERE mp1.player = ${BigInt(playerOneId)}
          AND mp1.is_cpu = false
          AND hm.match_id IS NULL
          AND m.archived = false
          ${rangeStartFilter}
          ${rangeEndFilter}
      ),
      eligible_match_ids AS (
        SELECT
          cm.id,
          cm.created_at
        FROM candidate_match_ids cm
        JOIN match_participants mp_count
          ON mp_count.match_id = cm.id
         AND mp_count.is_cpu = false
        GROUP BY cm.id, cm.created_at
        HAVING COUNT(*) = 2
      ),
      head_to_head AS (
        SELECT
          em.id AS match_id,
          em.created_at,
          mp1.smash_character AS player_one_character,
          mp1.total_kos AS player_one_kos,
          mp1.total_falls AS player_one_falls,
          mp1.total_sds AS player_one_sds,
          mp1.has_won AS player_one_has_won,
          mp2.smash_character AS player_two_character,
          mp2.total_kos AS player_two_kos,
          mp2.total_falls AS player_two_falls,
          mp2.total_sds AS player_two_sds,
          mp2.has_won AS player_two_has_won
        FROM eligible_match_ids em
        JOIN match_participants mp1
          ON mp1.match_id = em.id
         AND mp1.player = ${BigInt(playerOneId)}
         AND mp1.is_cpu = false
        JOIN match_participants mp2
          ON mp2.match_id = em.id
         AND mp2.player = ${BigInt(playerTwoId)}
         AND mp2.is_cpu = false
      ),
      available_characters AS (
        SELECT
          COUNT(*)::int AS overall_matches,
          COALESCE(
            array_agg(DISTINCT h.player_one_character ORDER BY h.player_one_character),
            ARRAY[]::text[]
          ) AS player1_available_characters,
          COALESCE(
            array_agg(DISTINCT h.player_two_character ORDER BY h.player_two_character),
            ARRAY[]::text[]
          ) AS player2_available_characters
        FROM head_to_head h
      ),
      filtered_matches AS (
        SELECT *
        FROM head_to_head h
        WHERE 1 = 1
          ${playerOneCharacterFilter}
          ${playerTwoCharacterFilter}
          ${playerOneExcludedCharactersFilter}
          ${playerTwoExcludedCharactersFilter}
      ),
      summary AS (
        SELECT
          COUNT(*)::int AS total_matches,
          json_build_object(
            'wins',
            COUNT(*) FILTER (WHERE player_one_has_won)::int,
            'losses',
            COUNT(*) FILTER (WHERE NOT player_one_has_won)::int,
            'totalKos',
            COALESCE(SUM(player_one_kos), 0)::int,
            'totalFalls',
            COALESCE(SUM(player_one_falls), 0)::int,
            'totalSds',
            COALESCE(SUM(player_one_sds), 0)::int
          ) AS player1_stats,
          json_build_object(
            'wins',
            COUNT(*) FILTER (WHERE player_two_has_won)::int,
            'losses',
            COUNT(*) FILTER (WHERE NOT player_two_has_won)::int,
            'totalKos',
            COALESCE(SUM(player_two_kos), 0)::int,
            'totalFalls',
            COALESCE(SUM(player_two_falls), 0)::int,
            'totalSds',
            COALESCE(SUM(player_two_sds), 0)::int
          ) AS player2_stats
        FROM filtered_matches
      ),
      recent_matches AS (
        SELECT
          COALESCE(
            json_agg(
              json_build_object(
                'id',
                recent.match_id,
                'created_at',
                recent.created_at,
                'player1Character',
                recent.player_one_character,
                'player1Kos',
                recent.player_one_kos,
                'player1Falls',
                recent.player_one_falls,
                'player1Sds',
                recent.player_one_sds,
                'player1Won',
                recent.player_one_has_won,
                'player2Character',
                recent.player_two_character,
                'player2Kos',
                recent.player_two_kos,
                'player2Falls',
                recent.player_two_falls,
                'player2Sds',
                recent.player_two_sds,
                'player2Won',
                recent.player_two_has_won
              )
              ORDER BY recent.created_at DESC, recent.match_id DESC
            ),
            '[]'::json
          ) AS recent_matches
        FROM (
          SELECT *
          FROM filtered_matches
          ORDER BY created_at DESC, match_id DESC
          LIMIT ${recentLimit}
        ) recent
      )
      SELECT
        ac.overall_matches,
        s.total_matches,
        ac.player1_available_characters,
        ac.player2_available_characters,
        s.player1_stats,
        s.player2_stats,
        rm.recent_matches
      FROM available_characters ac
      CROSS JOIN summary s
      CROSS JOIN recent_matches rm
    `);

    const result = summaryRow || {
      overall_matches: 0,
      total_matches: 0,
      player1_available_characters: [],
      player2_available_characters: [],
      player1_stats: {
        wins: 0,
        losses: 0,
        totalKos: 0,
        totalFalls: 0,
        totalSds: 0,
      },
      player2_stats: {
        wins: 0,
        losses: 0,
        totalKos: 0,
        totalFalls: 0,
        totalSds: 0,
      },
      recent_matches: [],
    };

    return NextResponse.json({
      overallMatches: result.overall_matches,
      totalMatches: result.total_matches,
      availableCharacters: {
        player1: result.player1_available_characters,
        player2: result.player2_available_characters,
      },
      player1: result.player1_stats,
      player2: result.player2_stats,
      recentMatches: result.recent_matches,
    });
  } catch (error) {
    console.error("[GET /api/matchups] Error fetching matchup:", error);
    return NextResponse.json(
      { error: "Failed to fetch matchup data." },
      { status: 500 }
    );
  }
}
