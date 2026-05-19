import { prisma } from "@/lib/prisma";
import {
  parseMatchResultFilter,
  parseMatchStockFilter,
} from "@/lib/matchOutcomeFilters";
import { getDateRangeSearchParamBounds } from "@/lib/dateRange";
import { resolvePlayersByQueryValues } from "@/lib/server/playerQueryResolver";
import { jsonWithApiDebug } from "@/lib/server/apiDebug";
import { unstable_cache } from "next/cache";
import {
  expandCharacterAliasQueryValues,
  getCanonicalCharacterName,
} from "@/utils/characterMapping";
import { Prisma } from "@prisma/client";

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

const MATCHES_CACHE_TAG = "matches";

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
      player_name:
        participant.players.name ||
        participant.players.display_name ||
        `Player ${Number(participant.player)}`,
      player_display_name: participant.players.display_name,
      smash_character: getCanonicalCharacterName(participant.smash_character),
      elo_diff: participant.elo_diff,
      is_cpu: participant.is_cpu,
      total_kos: participant.total_kos,
      total_falls: participant.total_falls,
      total_sds: participant.total_sds,
      has_won: participant.has_won,
    })),
  }));

const buildBaseVisibleMatchConditions = (): Prisma.matchesWhereInput[] => [
  { archived: false },
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

const fetchPageMatchesFromDb = async (
  whereConditions: Prisma.matchesWhereInput[],
  offset: number,
  limit: number
) => {
  const matches = await prisma.matches.findMany({
    where: {
      AND: whereConditions,
    },
    include: MATCH_INCLUDE,
    orderBy: MATCH_ORDER_BY,
    skip: offset,
    take: limit,
  });

  return transformMatches(matches);
};

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

const getQualifyingTeamRankingMatchIds = async (teamRankingId: number) => {
  const query = `
    WITH target_team AS (
      SELECT
        tr.id,
        CASE
          WHEN p1.solo_team AND p2.solo_team
            THEN 'solo:' || LEAST(tr.player_one, tr.player_two)::text
          WHEN p1.solo_team
            THEN 'solo:' || tr.player_one::text
          WHEN p2.solo_team
            THEN 'solo:' || tr.player_two::text
          ELSE LEAST(tr.player_one, tr.player_two)::text
            || ':'
            || GREATEST(tr.player_one, tr.player_two)::text
        END AS team_key
      FROM team_rankings tr
      JOIN players p1 ON p1.id = tr.player_one
      JOIN players p2 ON p2.id = tr.player_two
      WHERE tr.id = $1::bigint
    ),
    approved_teams AS (
      SELECT DISTINCT
        CASE
          WHEN p1.solo_team AND p2.solo_team
            THEN 'solo:' || LEAST(tr.player_one, tr.player_two)::text
          WHEN p1.solo_team
            THEN 'solo:' || tr.player_one::text
          WHEN p2.solo_team
            THEN 'solo:' || tr.player_two::text
          ELSE LEAST(tr.player_one, tr.player_two)::text
            || ':'
            || GREATEST(tr.player_one, tr.player_two)::text
        END AS team_key
      FROM team_rankings tr
      JOIN players p1 ON p1.id = tr.player_one
      JOIN players p2 ON p2.id = tr.player_two
      WHERE (
          (p1.solo_team AND p1.banned = false)
          OR (p2.solo_team AND p2.banned = false)
          OR (p1.banned = false AND p2.banned = false)
        )
        AND (
          (p1.solo_team AND p1.top_ten_played >= 3)
          OR (p2.solo_team AND p2.top_ten_played >= 3)
          OR (p1.top_ten_played >= 3 AND p2.top_ten_played >= 3)
        )
    ),
    team_sides AS (
      SELECT
        mp.match_id,
        mp.has_won,
        CASE
          WHEN BOOL_OR(p.solo_team)
            THEN 'solo:' || MIN(CASE WHEN p.solo_team THEN mp.player END)::text
          ELSE LEAST(MIN(mp.player), MAX(mp.player))::text
            || ':'
            || GREATEST(MIN(mp.player), MAX(mp.player))::text
        END AS team_key,
        CASE
          WHEN BOOL_OR(p.solo_team)
            THEN BOOL_OR(p.solo_team AND p.top_ten_played >= 3)
          ELSE BOOL_AND(p.top_ten_played >= 3)
        END AS is_ranked_team
      FROM match_participants mp
      JOIN players p ON p.id = mp.player
      WHERE mp.is_cpu = false
      GROUP BY mp.match_id, mp.has_won
      HAVING COUNT(*) = 2
    )
    SELECT m.id
    FROM matches m
    JOIN target_team tt ON true
    JOIN team_sides winners ON winners.match_id = m.id AND winners.has_won = true
    JOIN team_sides losers ON losers.match_id = m.id AND losers.has_won = false
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
        SELECT COUNT(*)
        FROM match_participants mp_count
        WHERE mp_count.match_id = m.id AND mp_count.is_cpu = false
      ) = 4
      AND winners.is_ranked_team = true
      AND losers.is_ranked_team = true
      AND winners.team_key IN (SELECT team_key FROM approved_teams)
      AND losers.team_key IN (SELECT team_key FROM approved_teams)
      AND (winners.team_key = tt.team_key OR losers.team_key = tt.team_key)
  `;

  return prisma.$queryRawUnsafe<Array<{ id: bigint }>>(query, teamRankingId);
};

const getStockFilteredMatchIds = async (stockRemaining: number) =>
  prisma.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
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
        SELECT COUNT(*)
        FROM match_participants mp_count
        WHERE mp_count.match_id = m.id
          AND mp_count.is_cpu = false
      ) = 2
      AND (
        SELECT COUNT(*)
        FROM match_participants mp_winners
        WHERE mp_winners.match_id = m.id
          AND mp_winners.is_cpu = false
          AND mp_winners.has_won = true
      ) = 1
      AND EXISTS (
        SELECT 1
        FROM match_participants mp_winner
        JOIN match_participants mp_loser
          ON mp_loser.match_id = mp_winner.match_id
         AND mp_loser.is_cpu = false
         AND mp_loser.has_won = false
        WHERE mp_winner.match_id = m.id
          AND mp_winner.is_cpu = false
          AND mp_winner.has_won = true
          AND GREATEST(
            mp_loser.total_falls + mp_loser.total_sds,
            mp_winner.total_kos
          ) >= 3
          AND (
            3 - GREATEST(
              mp_winner.total_falls + mp_winner.total_sds,
              mp_loser.total_kos
            )
          ) = ${stockRemaining}
      )
  `);

export async function GET(request: Request) {
  const startedAt = performance.now();

  try {
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const limit = parsePositiveInt(searchParams.get("limit"), 20, 100);
    const offset = (page - 1) * limit;
    const playerFilter = searchParams.getAll("player");
    const characterFilter = Array.from(
      new Set(
        searchParams
          .getAll("character")
          .map((character) => getCanonicalCharacterName(character))
          .filter(Boolean)
      )
    );
    const only1v1 = searchParams.get("only1v1") === "true";
    const only2v2 = searchParams.get("only2v2") === "true" && !only1v1;
    const participantCountFilter = only1v1 ? 2 : only2v2 ? 4 : null;
    const sameTeamOnly = searchParams.get("sameTeam") === "true";
    const teamRankingParam = searchParams.get("teamRanking");
    const matchIdParam = searchParams.get("matchId");
    const directionParam = searchParams.get("direction");
    const cursorMatchIdParam = searchParams.get("cursorMatchId");
    const startDateInput = searchParams.get("startDate");
    const endDateInput = searchParams.get("endDate");
    const {
      startDate,
      endDateExclusive,
      hasInvalidDateInput,
      hasInvertedDateRange,
    } = getDateRangeSearchParamBounds(searchParams);
    const resultFilter = parseMatchResultFilter(searchParams.get("result"));
    const stockFilter = parseMatchStockFilter(searchParams.get("stock"));
    const contextLimit = parsePositiveInt(
      searchParams.get("contextLimit"),
      2,
      20
    );
    const contextDirection =
      directionParam === "above" || directionParam === "below"
        ? directionParam
        : null;
    const teamRankingId = teamRankingParam
      ? parseInt(teamRankingParam, 10)
      : null;
    const hasDateFilter = Boolean(startDate || endDateExclusive);
    const getDebugMeta = (extra: Record<string, unknown> = {}) => ({
      page,
      limit,
      playerFilterCount: playerFilter.length,
      characterFilterCount: characterFilter.length,
      only1v1,
      only2v2,
      sameTeamOnly,
      hasDateFilter,
      resultFilter,
      stockFilter,
      mode: matchIdParam ? "context" : "page",
      contextDirection,
      hasTeamRankingFilter: Boolean(teamRankingParam),
      ...extra,
    });

    if (hasInvalidDateInput) {
      return jsonWithApiDebug(
        "/api/matches",
        request,
        startedAt,
        { error: "Invalid date filter" },
        { status: 400 },
        getDebugMeta({ reason: "invalid-date-filter" })
      );
    }

    if (hasInvertedDateRange) {
      return jsonWithApiDebug(
        "/api/matches",
        request,
        startedAt,
        { error: "Start date must be on or before the end date" },
        { status: 400 },
        getDebugMeta({ reason: "inverted-date-filter" })
      );
    }

    if (
      directionParam &&
      directionParam !== "above" &&
      directionParam !== "below"
    ) {
      return jsonWithApiDebug(
        "/api/matches",
        request,
        startedAt,
        { error: "Invalid context direction" },
        { status: 400 },
        getDebugMeta({ reason: "invalid-context-direction" })
      );
    }

    if (
      teamRankingParam &&
      (!Number.isInteger(teamRankingId) || (teamRankingId ?? 0) <= 0)
    ) {
      return jsonWithApiDebug(
        "/api/matches",
        request,
        startedAt,
        { error: "Invalid team ranking ID" },
        { status: 400 },
        getDebugMeta({ reason: "invalid-team-ranking" })
      );
    }

    const {
      playerIds: resolvedPlayerFilterIds,
      allResolved: allPlayerFiltersResolved,
    } = await resolvePlayersByQueryValues(playerFilter);

    console.log("API filters received:", {
      playerFilter,
      resolvedPlayerFilter: resolvedPlayerFilterIds.map(String),
      characterFilter,
      only1v1,
      only2v2,
      sameTeamOnly,
      teamRankingId,
      matchIdParam,
      directionParam,
      cursorMatchIdParam,
      startDate: startDateInput,
      endDate: endDateInput,
      resultFilter,
      stockFilter,
    });

    if (playerFilter.length > 0 && !allPlayerFiltersResolved) {
      if (matchIdParam) {
        return jsonWithApiDebug(
          "/api/matches",
          request,
          startedAt,
          { error: "Match not found with current filters" },
          { status: 404 },
          getDebugMeta({ reason: "unresolved-player-filter" })
        );
      }

      return jsonWithApiDebug(
        "/api/matches",
        request,
        startedAt,
        {
        matches: [],
        pagination: { page, limit, hasMore: false },
        },
        undefined,
        getDebugMeta({ rows: 0, reason: "unresolved-player-filter" })
      );
    }

    // Build Prisma where conditions - all filtering at database level
    const whereConditions: Prisma.matchesWhereInput[] = buildBaseVisibleMatchConditions();

    if (startDate || endDateExclusive) {
      whereConditions.push({
        created_at: {
          ...(startDate ? { gte: startDate } : {}),
          ...(endDateExclusive ? { lt: endDateExclusive } : {}),
        },
      });
    }

    if (teamRankingId !== null) {
      const qualifyingTeamMatchIds =
        await getQualifyingTeamRankingMatchIds(teamRankingId);

      if (qualifyingTeamMatchIds.length === 0 && !matchIdParam) {
        return jsonWithApiDebug(
          "/api/matches",
          request,
          startedAt,
          {
            matches: [],
            pagination: { page, limit, hasMore: false },
          },
          undefined,
          getDebugMeta({ rows: 0, reason: "no-team-ranking-matches" })
        );
      }

      whereConditions.push({
        id: { in: qualifyingTeamMatchIds.map((match) => match.id) },
      });
    }

    if (stockFilter !== "all") {
      const stockFilteredMatchIds = await getStockFilteredMatchIds(
        Number(stockFilter)
      );

      if (stockFilteredMatchIds.length === 0 && !matchIdParam) {
        return jsonWithApiDebug(
          "/api/matches",
          request,
          startedAt,
          {
            matches: [],
            pagination: { page, limit, hasMore: false },
          },
          undefined,
          getDebugMeta({ rows: 0, reason: "no-stock-filtered-matches" })
        );
      }

      whereConditions.push({
        id: { in: stockFilteredMatchIds.map((match) => match.id) },
      });
    }

    // Handle participant-count filters: exactly 2 or 4 non-CPU participants
    // Prisma doesn't support HAVING COUNT in where clauses, so we use raw SQL
    // This is still efficient - we only get match IDs, not full match data
    if (participantCountFilter) {
      const playerIds = resolvedPlayerFilterIds;
      const teamResultCondition =
        participantCountFilter === 4
          ? `AND (
            SELECT COUNT(*) FROM match_participants mp_winners
            WHERE mp_winners.match_id = m.id
              AND mp_winners.is_cpu = false
              AND mp_winners.has_won = true
          ) = 2
          AND (
            SELECT COUNT(*) FROM match_participants mp_losers
            WHERE mp_losers.match_id = m.id
              AND mp_losers.is_cpu = false
              AND mp_losers.has_won = false
          ) = 2`
          : "";

      if (playerIds.length > 0) {
        // Participant-count + player filter: Use raw SQL to combine both conditions efficiently
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
        const sameTeamCondition =
          sameTeamOnly && participantCountFilter === 4 && playerIds.length === 2
            ? `AND (
              SELECT COUNT(DISTINCT mp_team.has_won)
              FROM match_participants mp_team
              WHERE mp_team.match_id = m.id
                AND mp_team.is_cpu = false
                AND mp_team.player IN ($1::bigint, $2::bigint)
            ) = 1`
            : "";

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
          ${sameTeamCondition}
          ${teamResultCondition}
          AND (
            SELECT COUNT(*) FROM match_participants mp_count
            WHERE mp_count.match_id = m.id AND mp_count.is_cpu = false
          ) = ${participantCountFilter}
        `;

        const participantCountMatchIds = await prisma.$queryRawUnsafe<Array<{ id: bigint }>>(
          query,
          ...playerIds
        );
        
        if (participantCountMatchIds.length === 0) {
          return jsonWithApiDebug(
            "/api/matches",
            request,
            startedAt,
            {
              matches: [],
              pagination: { page, limit, hasMore: false },
            },
            undefined,
            getDebugMeta({
              rows: 0,
              reason: "no-participant-count-player-matches",
            })
          );
        }
        
        whereConditions.push({
          id: { in: participantCountMatchIds.map((m) => m.id) },
        });
      } else {
        // Simple participant-count filter without player filter
        const participantCountQuery = `
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
          ${teamResultCondition}
          AND (
            SELECT COUNT(*) FROM match_participants mp_count
            WHERE mp_count.match_id = m.id AND mp_count.is_cpu = false
          ) = ${participantCountFilter}
        `;
        
        const participantCountMatchIds = await prisma.$queryRawUnsafe<Array<{ id: bigint }>>(participantCountQuery);
        
        if (participantCountMatchIds.length === 0) {
          return jsonWithApiDebug(
            "/api/matches",
            request,
            startedAt,
            {
              matches: [],
              pagination: { page, limit, hasMore: false },
            },
            undefined,
            getDebugMeta({
              rows: 0,
              reason: "no-participant-count-matches",
            })
          );
        }
        
        whereConditions.push({
          id: { in: participantCountMatchIds.map((m) => m.id) },
        });
      }
    }

    const hasSinglePlayerCharacterFilter =
      resolvedPlayerFilterIds.length === 1 &&
      characterFilter.length === 1 &&
      !participantCountFilter;

    if (hasSinglePlayerCharacterFilter) {
      whereConditions.push({
        match_participants: {
          some: {
            player: resolvedPlayerFilterIds[0],
            is_cpu: false,
            smash_character: {
              in: expandCharacterAliasQueryValues(characterFilter[0]),
            },
          },
        },
      });
    }

    // Player filter: ALL specified players must be in the match (AND logic)
    // Only apply if not already handled by participant-count filter above
    if (
      playerFilter.length > 0 &&
      !participantCountFilter &&
      !hasSinglePlayerCharacterFilter
    ) {
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
    if (characterFilter.length > 0 && !hasSinglePlayerCharacterFilter) {
      const characterConditions = characterFilter.map((character) => ({
        match_participants: {
          some: {
            smash_character: {
              in: expandCharacterAliasQueryValues(character),
            },
          },
        },
      }));
      whereConditions.push(...characterConditions);
    }

    if (resultFilter !== "all" && resolvedPlayerFilterIds.length > 0) {
      const targetHasWon = resultFilter === "wins";
      const resultPerspectivePlayerId = resolvedPlayerFilterIds[0];

      whereConditions.push({
        match_participants: {
          some: {
            player: resultPerspectivePlayerId,
            is_cpu: false,
            has_won: targetHasWon,
          },
        },
      });
    }

    if (matchIdParam) {
      const anchorMatchId = parseInt(matchIdParam, 10);

      if (Number.isNaN(anchorMatchId)) {
        return jsonWithApiDebug(
          "/api/matches",
          request,
          startedAt,
          { error: "Invalid match ID" },
          { status: 400 },
          getDebugMeta({ reason: "invalid-match-id" })
        );
      }

      const anchorMatch = await prisma.matches.findFirst({
        where: {
          AND: [...whereConditions, { id: BigInt(anchorMatchId) }],
        },
        include: MATCH_INCLUDE,
      });

      if (!anchorMatch) {
        return jsonWithApiDebug(
          "/api/matches",
          request,
          startedAt,
          { error: "Match not found with current filters" },
          { status: 404 },
          getDebugMeta({ reason: "anchor-match-not-found" })
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

        const body = {
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
        };

        return jsonWithApiDebug(
          "/api/matches",
          request,
          startedAt,
          body,
          undefined,
          getDebugMeta({ rows: body.matches.length, contextLimit })
        );
      }

      const cursorMatchId = parseInt(
        cursorMatchIdParam || anchorMatchId.toString(),
        10
      );

      if (Number.isNaN(cursorMatchId)) {
        return jsonWithApiDebug(
          "/api/matches",
          request,
          startedAt,
          { error: "Invalid context cursor match ID" },
          { status: 400 },
          getDebugMeta({ reason: "invalid-context-cursor" })
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
        return jsonWithApiDebug(
          "/api/matches",
          request,
          startedAt,
          { error: "Context cursor match not found with current filters" },
          { status: 404 },
          getDebugMeta({ reason: "context-cursor-not-found" })
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

      const body = {
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
      };

      return jsonWithApiDebug(
        "/api/matches",
        request,
        startedAt,
        body,
        undefined,
        getDebugMeta({ rows: body.matches.length, contextLimit })
      );
    }

    const pageCacheKey = searchParams.toString();
    const getCachedPageMatches = unstable_cache(
      async () => fetchPageMatchesFromDb(whereConditions, offset, limit),
      ["matches-page-v1", pageCacheKey],
      {
        tags: [MATCHES_CACHE_TAG],
      }
    );

    // Get matches with pagination. The result is cached by the "matches" tag so
    // polling does not hit the database again until the tag is revalidated.
    const transformedMatches = await getCachedPageMatches();

    if (transformedMatches.length === 0) {
      return jsonWithApiDebug(
        "/api/matches",
        request,
        startedAt,
        {
          matches: [],
          pagination: {
            page,
            limit,
            hasMore: false,
          },
        },
        undefined,
        getDebugMeta({ rows: 0, reason: "no-page-matches" })
      );
    }

    console.log(
      `Returning ${transformedMatches.length} matches for page ${page}`
    );

    // Return matches with pagination info
    const body = {
      matches: transformedMatches,
      pagination: {
        page,
        limit,
        hasMore: transformedMatches.length === limit,
      },
    };

    return jsonWithApiDebug(
      "/api/matches",
      request,
      startedAt,
      body,
      undefined,
      getDebugMeta({
        rows: transformedMatches.length,
        source: "unstable_cache",
      })
    );
  } catch (error) {
    console.error("Error fetching matches:", error);
    return jsonWithApiDebug(
      "/api/matches",
      request,
      startedAt,
      { error: "Failed to fetch matches" },
      { status: 500 },
      { reason: "exception" }
    );
  }
}
