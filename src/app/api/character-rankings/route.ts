import { prisma } from "@/lib/prisma";
import { normalizeAppUrl } from "@/lib/site-url";
import { getCanonicalCharacterName } from "@/utils/characterMapping";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

interface CharacterRankingQueryResult {
  id: bigint;
  player_id: bigint;
  name: string | null;
  display_name: string | null;
  country: string | null;
  picture: string | null;
  character_name: string;
  elo: bigint;
  total_wins: number;
  total_losses: number;
  total_kos: number;
  total_falls: number;
  total_sds: number;
  current_win_streak: number;
  last_match_date: Date | null;
}

interface TransformedCharacterRanking {
  id: string;
  player_id: number;
  name: string;
  display_name: string | null;
  country: string | null;
  picture: string | null;
  character_name: string;
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

const compareCharacterRankings = (
  a: TransformedCharacterRanking,
  b: TransformedCharacterRanking
) => {
  if (b.elo !== a.elo) {
    return b.elo - a.elo;
  }

  if (b.current_win_streak !== a.current_win_streak) {
    return b.current_win_streak - a.current_win_streak;
  }

  if (b.total_wins !== a.total_wins) {
    return b.total_wins - a.total_wins;
  }

  const aName = a.display_name || a.name;
  const bName = b.display_name || b.name;
  const nameComparison = aName.localeCompare(bName);

  if (nameComparison !== 0) {
    return nameComparison;
  }

  return a.character_name.localeCompare(b.character_name);
};

const getLatestDate = (left: string | null, right: string | null) => {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
};

const mergeCanonicalCharacterRankings = (
  rankings: TransformedCharacterRanking[]
) => {
  const rankingsByCanonicalKey = new Map<string, TransformedCharacterRanking>();

  rankings.forEach((ranking) => {
    const key = `${ranking.player_id}:${ranking.character_name}`;
    const existingRanking = rankingsByCanonicalKey.get(key);

    if (!existingRanking) {
      rankingsByCanonicalKey.set(key, {
        ...ranking,
        id: `canonical:${key}`,
      });
      return;
    }

    const preferredRanking =
      compareCharacterRankings(ranking, existingRanking) < 0
        ? ranking
        : existingRanking;
    const totalWins = existingRanking.total_wins + ranking.total_wins;
    const totalLosses = existingRanking.total_losses + ranking.total_losses;

    rankingsByCanonicalKey.set(key, {
      ...preferredRanking,
      id: `canonical:${key}`,
      total_wins: totalWins,
      total_losses: totalLosses,
      matches: totalWins + totalLosses,
      total_kos: existingRanking.total_kos + ranking.total_kos,
      total_falls: existingRanking.total_falls + ranking.total_falls,
      total_sds: existingRanking.total_sds + ranking.total_sds,
      current_win_streak: Math.max(
        existingRanking.current_win_streak,
        ranking.current_win_streak
      ),
      last_match_date: getLatestDate(
        existingRanking.last_match_date,
        ranking.last_match_date
      ),
    });
  });

  return Array.from(rankingsByCanonicalKey.values()).sort(
    compareCharacterRankings
  );
};

async function fetchCharacterRankingsFromDb(
  includeInactive: boolean
): Promise<TransformedCharacterRanking[]> {
  const query = `
    SELECT
      cr.id,
      cr.player AS player_id,
      p.name,
      p.display_name,
      p.country,
      p.picture,
      cr.smash_character AS character_name,
      cr.elo,
      cr.total_wins,
      cr.total_losses,
      cr.total_kos,
      cr.total_falls,
      cr.total_sds,
      cr.current_win_streak,
      cr.last_match_date
    FROM character_rankings cr
    JOIN players p ON p.id = cr.player
    WHERE p.banned = false
      ${includeInactive ? "" : "AND p.inactive = false"}
    ORDER BY
      cr.elo DESC,
      cr.current_win_streak DESC,
      cr.total_wins DESC,
      COALESCE(p.display_name, p.name) ASC,
      cr.smash_character ASC;
  `;

  const result = (await prisma.$queryRawUnsafe(
    query
  )) as CharacterRankingQueryResult[];

  const transformedRankings = result.map((characterRanking) => ({
    id: characterRanking.id.toString(),
    player_id: Number(characterRanking.player_id),
    name:
      characterRanking.name ||
      characterRanking.display_name ||
      `Player ${Number(characterRanking.player_id)}`,
    display_name: characterRanking.display_name,
    country: characterRanking.country,
    picture: normalizeAppUrl(characterRanking.picture),
    character_name: getCanonicalCharacterName(characterRanking.character_name),
    elo: Number(characterRanking.elo),
    matches: characterRanking.total_wins + characterRanking.total_losses,
    total_wins: characterRanking.total_wins,
    total_losses: characterRanking.total_losses,
    total_kos: characterRanking.total_kos,
    total_falls: characterRanking.total_falls,
    total_sds: characterRanking.total_sds,
    current_win_streak: characterRanking.current_win_streak,
    last_match_date: characterRanking.last_match_date
      ? characterRanking.last_match_date.toISOString()
      : null,
  }));

  return mergeCanonicalCharacterRankings(transformedRankings);
}

const getCachedCharacterRankings = unstable_cache(
  () => fetchCharacterRankingsFromDb(false),
  ["character-rankings-data-v2"],
  {
    tags: ["players"],
  }
);

const getCachedCharacterRankingsIncludingInactive = unstable_cache(
  () => fetchCharacterRankingsFromDb(true),
  ["character-rankings-data-including-inactive-v2"],
  {
    tags: ["players"],
  }
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";

    console.log(
      "[GET /api/character-rankings] Fetching character rankings (cached)...",
      { includeInactive }
    );

    const characterRankings = includeInactive
      ? await getCachedCharacterRankingsIncludingInactive()
      : await getCachedCharacterRankings();

    console.log(
      "[GET /api/character-rankings] Returning",
      characterRankings.length,
      "rows",
      { includeInactive }
    );

    return NextResponse.json(characterRankings);
  } catch (error) {
    console.error(
      "[GET /api/character-rankings] Error fetching character rankings:",
      error
    );
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

    console.error(
      "[GET /api/character-rankings] Error details:",
      errorDetails
    );

    return NextResponse.json(
      {
        error: "Failed to fetch character rankings",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
