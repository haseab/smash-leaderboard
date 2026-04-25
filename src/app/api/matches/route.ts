import { prisma } from "@/lib/prisma";
import { resolvePlayersByQueryValues } from "@/lib/server/playerQueryResolver";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

const MATCH_INCLUDE = {
  match_participants: {
    include: {
      players: {
        select: {
          name: true,
          display_name: true,
        },
      },
    },
  },
} satisfies Prisma.matchesInclude;

const MATCH_ORDER_BY: Prisma.matchesOrderByWithRelationInput[] = [
  { created_at: "desc" },
  { id: "desc" },
];

const MATCH_ORDER_BY_ASC: Prisma.matchesOrderByWithRelationInput[] = [
  { created_at: "asc" },
  { id: "asc" },
];

type MatchWithParticipants = Prisma.matchesGetPayload<{
  include: typeof MATCH_INCLUDE;
}>;

const transformMatches = (matches: MatchWithParticipants[]) =>
  matches.map((match) => ({
    id: Number(match.id),
    created_at: match.created_at.toISOString(),
    participants: match.match_participants.map((participant) => ({
      id: Number(participant.id),
      player: Number(participant.player),
      player_name: participant.players.name,
      player_display_name: participant.players.display_name,
      smash_character: participant.smash_character,
      is_cpu: participant.is_cpu,
      total_kos: participant.total_kos,
      total_falls: participant.total_falls,
      total_sds: participant.total_sds,
      has_won: participant.has_won,
    })),
  }));

const parsePositiveInt = (
  value: string | null,
  fallback: number,
  max?: number
) => {
  const parsed = parseInt(value || "", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return max ? Math.min(parsed, max) : parsed;
};

const buildRelativeMatchCondition = (
  referenceMatch: { id: bigint; created_at: Date },
  direction: "above" | "below"
): Prisma.matchesWhereInput => {
  if (direction === "above") {
    return {
      OR: [
        {
          created_at: {
            gt: referenceMatch.created_at,
          },
        },
        {
          AND: [
            {
              created_at: referenceMatch.created_at,
            },
            {
              id: {
                gt: referenceMatch.id,
              },
            },
          ],
        },
      ],
    };
  }

  return {
    OR: [
      {
        created_at: {
          lt: referenceMatch.created_at,
        },
      },
      {
        AND: [
          {
            created_at: referenceMatch.created_at,
          },
          {
            id: {
              lt: referenceMatch.id,
            },
          },
        ],
      },
    ],
  };
};

const getContextOrderBy = (direction: "above" | "below") =>
  direction === "above" ? MATCH_ORDER_BY_ASC : MATCH_ORDER_BY;

const normalizeContextMatches = (
  matches: MatchWithParticipants[],
  direction: "above" | "below",
  limit: number
) => {
  const visibleMatches = matches.slice(0, limit);

  return direction === "above" ? [...visibleMatches].reverse() : visibleMatches;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const limit = parsePositiveInt(searchParams.get("limit"), 20, 100);
    const offset = (page - 1) * limit;
    const playerFilter = searchParams.getAll("player");
    const characterFilter = searchParams.getAll("character");
    const only1v1 = searchParams.get("only1v1") === "true";
    const matchIdParam = searchParams.get("matchId");
    const directionParam = searchParams.get("direction");
    const cursorMatchIdParam = searchParams.get("cursorMatchId");
    const contextLimit = parsePositiveInt(
      searchParams.get("contextLimit"),
      2,
      20
    );

    if (
      directionParam &&
      directionParam !== "above" &&
      directionParam !== "below"
    ) {
      return NextResponse.json(
        { error: "Invalid context direction" },
        { status: 400 }
      );
    }

    const contextDirection =
      directionParam === "above" || directionParam === "below"
        ? directionParam
        : null;
    const {
      playerIds: resolvedPlayerFilterIds,
      allResolved: allPlayerFiltersResolved,
    } = await resolvePlayersByQueryValues(playerFilter);

    console.log("API filters received:", {
      playerFilter,
      resolvedPlayerFilter: resolvedPlayerFilterIds.map(String),
      characterFilter,
      only1v1,
      matchIdParam,
      directionParam,
      cursorMatchIdParam,
    });

    if (playerFilter.length > 0 && !allPlayerFiltersResolved) {
      if (matchIdParam) {
        return NextResponse.json(
          { error: "Match not found with current filters" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        matches: [],
        pagination: { page, limit, hasMore: false },
      });
    }

    // Build Prisma where conditions - all filtering at database level
    const whereConditions: Prisma.matchesWhereInput[] = [
      { archived: false }, // Always exclude archived matches
      {
        match_participants: {
          none: {
            is_cpu: false,
            players: {
              is: {
                banned: true,
              },
            },
          },
        },
      },
    ];

    // Handle 1v1 filter: exactly 2 non-CPU participants
    // Prisma doesn't support HAVING COUNT in where clauses, so we use raw SQL
    // This is still efficient - we only get match IDs, not full match data
    if (only1v1) {
      const playerIds = resolvedPlayerFilterIds;

      if (playerIds.length > 0) {
        // 1v1 + player filter: Use raw SQL to combine both conditions efficiently
        // Build EXISTS conditions for each player (AND logic)
        const existsConditions = playerIds
          .map((_, idx) => {
            const alias = `mp${idx}`;
            return `EXISTS (
              SELECT 1 FROM match_participants ${alias}
              WHERE ${alias}.match_id = m.id 
              AND ${alias}.player = $${idx + 1}::bigint
              AND ${alias}.is_cpu = false
            )`;
          })
          .join(" AND ");

        const query = `
          SELECT m.id
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
          AND ${existsConditions}
          AND (
            SELECT COUNT(*) FROM match_participants mp_count
            WHERE mp_count.match_id = m.id AND mp_count.is_cpu = false
          ) = 2
        `;

        const oneVOneMatchIds = await prisma.$queryRawUnsafe<Array<{ id: bigint }>>(
          query,
          ...playerIds
        );
        
        if (oneVOneMatchIds.length === 0) {
          return NextResponse.json({
            matches: [],
            pagination: { page, limit, hasMore: false },
          });
        }
        
        whereConditions.push({ id: { in: oneVOneMatchIds.map((m) => m.id) } });
      } else {
        // Simple 1v1 filter without player filter
        const oneVOneQuery = `
          SELECT m.id
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
          AND (
            SELECT COUNT(*) FROM match_participants mp_count
            WHERE mp_count.match_id = m.id AND mp_count.is_cpu = false
          ) = 2
        `;
        
        const oneVOneMatchIds = await prisma.$queryRawUnsafe<Array<{ id: bigint }>>(oneVOneQuery);
        
        if (oneVOneMatchIds.length === 0) {
          return NextResponse.json({
            matches: [],
            pagination: { page, limit, hasMore: false },
          });
        }
        
        whereConditions.push({ id: { in: oneVOneMatchIds.map((m) => m.id) } });
      }
    }

    // Player filter: ALL specified players must be in the match (AND logic)
    // Only apply if not already handled by 1v1 filter above
    if (playerFilter.length > 0 && !only1v1) {
      // For each player, ensure they have a participant record in the match
      const playerConditions = resolvedPlayerFilterIds.map((playerId) => ({
        match_participants: {
          some: {
            player: playerId,
            is_cpu: false,
          },
        },
      }));
      whereConditions.push(...playerConditions);
    }

    // Character filter: ALL specified characters must be used in the match (AND logic)
    if (characterFilter.length > 0) {
      const characterConditions = characterFilter.map((character) => ({
        match_participants: {
          some: {
            smash_character: character,
          },
        },
      }));
      whereConditions.push(...characterConditions);
    }

    if (matchIdParam) {
      const anchorMatchId = parseInt(matchIdParam, 10);

      if (Number.isNaN(anchorMatchId)) {
        return NextResponse.json(
          { error: "Invalid match ID" },
          { status: 400 }
        );
      }

      const anchorMatch = await prisma.matches.findFirst({
        where: {
          AND: [...whereConditions, { id: BigInt(anchorMatchId) }],
        },
        include: MATCH_INCLUDE,
      });

      if (!anchorMatch) {
        return NextResponse.json(
          { error: "Match not found with current filters" },
          { status: 404 }
        );
      }

      if (!contextDirection) {
        const [aboveMatches, belowMatches] = await Promise.all([
          prisma.matches.findMany({
            where: {
              AND: [
                ...whereConditions,
                buildRelativeMatchCondition(anchorMatch, "above"),
              ],
            },
            include: MATCH_INCLUDE,
            orderBy: getContextOrderBy("above"),
            take: contextLimit + 1,
          }),
          prisma.matches.findMany({
            where: {
              AND: [
                ...whereConditions,
                buildRelativeMatchCondition(anchorMatch, "below"),
              ],
            },
            include: MATCH_INCLUDE,
            orderBy: getContextOrderBy("below"),
            take: contextLimit + 1,
          }),
        ]);

        const visibleAboveMatches = normalizeContextMatches(
          aboveMatches,
          "above",
          contextLimit
        );
        const visibleBelowMatches = normalizeContextMatches(
          belowMatches,
          "below",
          contextLimit
        );

        return NextResponse.json({
          matches: transformMatches([
            ...visibleAboveMatches,
            anchorMatch,
            ...visibleBelowMatches,
          ]),
          pagination: {
            mode: "context",
            anchorId: anchorMatchId,
            contextLimit,
            hasMoreAbove: aboveMatches.length > contextLimit,
            hasMoreBelow: belowMatches.length > contextLimit,
          },
        });
      }

      const cursorMatchId = parseInt(
        cursorMatchIdParam || anchorMatchId.toString(),
        10
      );

      if (Number.isNaN(cursorMatchId)) {
        return NextResponse.json(
          { error: "Invalid context cursor match ID" },
          { status: 400 }
        );
      }

      const referenceMatch =
        cursorMatchId === anchorMatchId
          ? anchorMatch
          : await prisma.matches.findFirst({
              where: {
                AND: [...whereConditions, { id: BigInt(cursorMatchId) }],
              },
              select: {
                id: true,
                created_at: true,
              },
            });

      if (!referenceMatch) {
        return NextResponse.json(
          { error: "Context cursor match not found with current filters" },
          { status: 404 }
        );
      }

      const contextualMatches = await prisma.matches.findMany({
        where: {
          AND: [
            ...whereConditions,
            buildRelativeMatchCondition(referenceMatch, contextDirection),
          ],
        },
        include: MATCH_INCLUDE,
        orderBy: getContextOrderBy(contextDirection),
        take: contextLimit + 1,
      });

      return NextResponse.json({
        matches: transformMatches(
          normalizeContextMatches(
            contextualMatches,
            contextDirection,
            contextLimit
          )
        ),
        pagination: {
          mode: "context",
          anchorId: anchorMatchId,
          contextLimit,
          direction: contextDirection,
          hasMoreAbove:
            contextDirection === "above"
              ? contextualMatches.length > contextLimit
              : undefined,
          hasMoreBelow:
            contextDirection === "below"
              ? contextualMatches.length > contextLimit
              : undefined,
        },
      });
    }

    // Get matches with pagination - all filtering done at database level
    const matches = await prisma.matches.findMany({
      where: {
        AND: whereConditions,
      },
      include: MATCH_INCLUDE,
      orderBy: MATCH_ORDER_BY,
      skip: offset,
      take: limit,
    });

    if (!matches || matches.length === 0) {
      return NextResponse.json({
        matches: [],
        pagination: {
          page,
          limit,
          hasMore: false,
        },
      });
    }

    const transformedMatches = transformMatches(matches);

    console.log(
      `Returning ${transformedMatches.length} matches for page ${page}`
    );

    // Return matches with pagination info
    return NextResponse.json({
      matches: transformedMatches,
      pagination: {
        page,
        limit,
        hasMore: transformedMatches.length === limit,
      },
    });
  } catch (error) {
    console.error("Error fetching matches:", error);
    return NextResponse.json(
      { error: "Failed to fetch matches" },
      { status: 500 }
    );
  }
}
