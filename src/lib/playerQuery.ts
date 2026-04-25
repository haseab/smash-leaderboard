export interface QueryablePlayer {
  id: number | bigint | string;
  name: string | null;
  display_name: string | null;
}

const normalizePlayerQueryValue = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

const getUniqueQueryValues = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

export const getPlayerQueryLabel = (player: QueryablePlayer) =>
  player.display_name?.trim() ||
  player.name?.trim() ||
  `Player ${String(player.id)}`;

const getPlayerQueryAliases = (player: QueryablePlayer) =>
  getUniqueQueryValues([
    String(player.id),
    getPlayerQueryLabel(player),
    player.display_name || "",
    player.name || "",
  ]);

export const findPlayerByQueryValue = <T extends QueryablePlayer>(
  queryValue: string,
  players: T[]
) => {
  const trimmedQueryValue = queryValue.trim();

  if (!trimmedQueryValue) {
    return null;
  }

  const directIdMatch = players.find(
    (player) => String(player.id) === trimmedQueryValue
  );

  if (directIdMatch) {
    return directIdMatch;
  }

  const normalizedQueryValue = normalizePlayerQueryValue(trimmedQueryValue);

  return (
    players.find((player) =>
      getPlayerQueryAliases(player).some(
        (alias) => normalizePlayerQueryValue(alias) === normalizedQueryValue
      )
    ) || null
  );
};

export const resolvePlayerQueryValuesToIds = <T extends QueryablePlayer>(
  queryValues: string[],
  players: T[]
) =>
  getUniqueQueryValues(
    queryValues
      .map((queryValue) => findPlayerByQueryValue(queryValue, players))
      .filter((player): player is T => Boolean(player))
      .map((player) => String(player.id))
  );

export const serializePlayerIdToQueryValue = <T extends QueryablePlayer>(
  playerId: string | number | bigint,
  players: T[]
) => {
  const matchedPlayer = players.find(
    (player) => String(player.id) === String(playerId)
  );

  return matchedPlayer ? getPlayerQueryLabel(matchedPlayer) : String(playerId);
};

export const serializePlayerIdsToQueryValues = <T extends QueryablePlayer>(
  playerIds: Array<string | number | bigint>,
  players: T[]
) =>
  getUniqueQueryValues(
    playerIds.map((playerId) => serializePlayerIdToQueryValue(playerId, players))
  );
