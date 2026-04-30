export const MATCH_RESULT_FILTER_VALUES = ["all", "wins", "losses"] as const;
export const MATCH_STOCK_FILTER_VALUES = ["all", "3", "2", "1"] as const;

export type MatchResultFilter = (typeof MATCH_RESULT_FILTER_VALUES)[number];
export type MatchStockFilter = (typeof MATCH_STOCK_FILTER_VALUES)[number];

export interface MatchOutcomeFilterState {
  result: MatchResultFilter;
  stock: MatchStockFilter;
}

export interface MatchOutcomeFilterParticipant {
  player: number;
  is_cpu?: boolean;
  total_kos: number;
  total_falls: number;
  total_sds: number;
  has_won: boolean;
}

export interface MatchOutcomeFilterMatch {
  participants: MatchOutcomeFilterParticipant[];
}

export const DEFAULT_MATCH_OUTCOME_FILTERS: MatchOutcomeFilterState = {
  result: "all",
  stock: "all",
};

export const parseMatchResultFilter = (
  value: string | null
): MatchResultFilter => {
  switch (value) {
    case "win":
    case "wins":
      return "wins";
    case "loss":
    case "losses":
      return "losses";
    default:
      return "all";
  }
};

export const parseMatchStockFilter = (
  value: string | null
): MatchStockFilter => {
  switch (value) {
    case "1":
    case "2":
    case "3":
      return value;
    default:
      return "all";
  }
};

export const hasActiveMatchOutcomeFilters = (
  filters: MatchOutcomeFilterState
) => filters.result !== "all" || filters.stock !== "all";

export const getActiveMatchOutcomeFilterCount = (
  filters: MatchOutcomeFilterState
) => [filters.result !== "all", filters.stock !== "all"].filter(Boolean).length;

export const STARTING_STOCKS = 3;

export const getStocksLost = (participant: MatchOutcomeFilterParticipant) =>
  participant.total_falls + participant.total_sds;

export const getEffectiveStocksLost = (
  participant: MatchOutcomeFilterParticipant,
  opponent: MatchOutcomeFilterParticipant
) => Math.max(getStocksLost(participant), opponent.total_kos ?? 0);

export const getMatchWinnerStocksRemaining = (
  participants: MatchOutcomeFilterParticipant[]
): number | null => {
  const playerParticipants = participants.filter(
    (participant) => participant.is_cpu !== true
  );

  if (playerParticipants.length !== 2) {
    return null;
  }

  const winner = playerParticipants.find((participant) => participant.has_won);
  const loser = playerParticipants.find((participant) => !participant.has_won);

  if (
    !winner ||
    !loser ||
    getEffectiveStocksLost(loser, winner) < STARTING_STOCKS
  ) {
    return null;
  }

  const stocksRemaining =
    STARTING_STOCKS - getEffectiveStocksLost(winner, loser);

  return stocksRemaining >= 1 && stocksRemaining <= STARTING_STOCKS
    ? stocksRemaining
    : null;
};

export const matchPassesOutcomeFilters = (
  match: MatchOutcomeFilterMatch,
  filters: MatchOutcomeFilterState,
  perspectivePlayerIds: number[] = []
) => {
  if (filters.result !== "all") {
    const perspectivePlayerId = perspectivePlayerIds[0];
    const perspectiveParticipant = match.participants.find(
      (participant) =>
        participant.is_cpu !== true && participant.player === perspectivePlayerId
    );

    if (!perspectiveParticipant) {
      return false;
    }

    const targetHasWon = filters.result === "wins";
    if (perspectiveParticipant.has_won !== targetHasWon) {
      return false;
    }
  }

  if (
    filters.stock !== "all" &&
    getMatchWinnerStocksRemaining(match.participants) !== Number(filters.stock)
  ) {
    return false;
  }

  return true;
};
