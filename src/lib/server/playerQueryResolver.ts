import "server-only";

import { findPlayerByQueryValue, type QueryablePlayer } from "@/lib/playerQuery";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

interface PlayerQueryCandidate extends QueryablePlayer {
  id: bigint;
}

const getUniqueNonEmptyQueryValues = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

const buildPlayerQueryConditions = (values: string[]) =>
  values.flatMap((value) => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return [];
    }

    const conditions: Prisma.playersWhereInput[] = [
      {
        name: {
          equals: trimmedValue,
          mode: "insensitive",
        },
      },
      {
        display_name: {
          equals: trimmedValue,
          mode: "insensitive",
        },
      },
    ];

    if (/^\d+$/.test(trimmedValue)) {
      conditions.push({
        id: BigInt(trimmedValue),
      });
    }

    return conditions;
  });

export const resolvePlayersByQueryValues = async (queryValues: string[]) => {
  const normalizedQueryValues = queryValues.map((value) => value.trim());
  const lookupValues = getUniqueNonEmptyQueryValues(normalizedQueryValues);

  if (lookupValues.length === 0) {
    return {
      resolvedPlayers: normalizedQueryValues.map(() => null) as Array<
        PlayerQueryCandidate | null
      >,
      matchedPlayers: [] as PlayerQueryCandidate[],
      playerIds: [] as bigint[],
      allResolved: normalizedQueryValues.every((value) => value.length === 0),
    };
  }

  const candidates = await prisma.players.findMany({
    where: {
      banned: false,
      OR: buildPlayerQueryConditions(lookupValues),
    },
    select: {
      id: true,
      name: true,
      display_name: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  const resolvedPlayers = normalizedQueryValues.map((queryValue) =>
    queryValue ? findPlayerByQueryValue(queryValue, candidates) : null
  );
  const matchedPlayers = resolvedPlayers.filter(
    (player): player is NonNullable<(typeof resolvedPlayers)[number]> =>
      Boolean(player)
  );

  return {
    resolvedPlayers,
    matchedPlayers,
    playerIds: Array.from(new Set(matchedPlayers.map((player) => player.id))),
    allResolved: normalizedQueryValues.every(
      (queryValue, index) =>
        queryValue.length === 0 || Boolean(resolvedPlayers[index])
    ),
  };
};

export const resolvePlayerPairByQueryValues = async (
  queryValues: [string, string]
) => {
  const result = await resolvePlayersByQueryValues(queryValues);

  return {
    ...result,
    playerOne: result.resolvedPlayers[0] ?? null,
    playerTwo: result.resolvedPlayers[1] ?? null,
  };
};
