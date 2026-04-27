"use client";

import CharacterDropdown from "@/components/CharacterDropdown";
import CharacterProfilePicture from "@/components/CharacterProfilePicture";
import MatchCard, { MatchCardMatch } from "@/components/MatchCard";
import PlayerDropdown from "@/components/PlayerDropdown";
import {
  findPlayerByQueryValue,
  getPlayerQueryLabel,
  serializePlayerIdToQueryValue,
} from "@/lib/playerQuery";
import { X } from "lucide-react";
import ReactCountryFlag from "react-country-flag";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface MatchupExplorerPlayer {
  id: number;
  name: string;
  display_name: string | null;
  picture?: string | null;
  country?: string | null;
  main_character?: string | null;
}

interface MatchupParticipantStats {
  wins: number;
  losses: number;
  totalKos: number;
  totalFalls: number;
  totalSds: number;
}

type MatchupTimeRange = "all" | "7d" | "30d" | "1y" | "custom";

interface MatchupApiResponse {
  overallMatches: number;
  totalMatches: number;
  availableCharacters: {
    player1: string[];
    player2: string[];
  };
  player1: MatchupParticipantStats;
  player2: MatchupParticipantStats;
  recentMatches: Array<{
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
  }>;
  error?: string;
}

interface MatchupExplorerProps {
  players: MatchupExplorerPlayer[];
  isRefreshing: boolean;
  onPlayerClick: (playerId: number) => void;
  refreshToken: number;
}

interface MatchupQueryState {
  player1: string;
  player2: string;
  player1Character: string;
  player2Character: string;
  player1ExcludedCharacters: string[];
  player2ExcludedCharacters: string[];
  timeRange: MatchupTimeRange;
  startDate: string;
  endDate: string;
}

const getPlayerLabel = getPlayerQueryLabel;

const isValidCountryCode = (countryCode: string | null | undefined) =>
  Boolean(countryCode && /^[A-Z]{2}$/i.test(countryCode));

const parseMatchupTimeRange = (value: string | null): MatchupTimeRange => {
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

const formatPercent = (wins: number, totalMatches: number) => {
  if (totalMatches === 0) {
    return "0.0%";
  }

  return `${((wins / totalMatches) * 100).toFixed(1)}%`;
};

const formatKdRatio = (stats: MatchupParticipantStats) => {
  const totalDeaths = stats.totalFalls + stats.totalSds;

  if (totalDeaths === 0) {
    return stats.totalKos > 0 ? "∞" : "0.00";
  }

  return (stats.totalKos / totalDeaths).toFixed(2);
};

const getInitials = (player: MatchupExplorerPlayer) =>
  getPlayerLabel(player)
    .split(" ")
    .map((segment) => segment[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

const formatDateValue = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString();

const formatDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const shiftDateByDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const shiftDateByYears = (date: Date, years: number) => {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
};

const getPresetDateInputs = (
  timeRange: Exclude<MatchupTimeRange, "custom">
) => {
  if (timeRange === "all") {
    return { startDate: "", endDate: "" };
  }

  const today = new Date();
  const endDate = formatDateInputValue(today);

  switch (timeRange) {
    case "7d":
      return {
        startDate: formatDateInputValue(shiftDateByDays(today, -7)),
        endDate,
      };
    case "30d":
      return {
        startDate: formatDateInputValue(shiftDateByDays(today, -30)),
        endDate,
      };
    case "1y":
      return {
        startDate: formatDateInputValue(shiftDateByYears(today, -1)),
        endDate,
      };
    default:
      return { startDate: "", endDate: "" };
  }
};

const getTimeRangeLabel = (
  timeRange: MatchupTimeRange,
  startDate: string,
  endDate: string
) => {
  switch (timeRange) {
    case "7d":
      return "Last Week";
    case "30d":
      return "Last 30 Days";
    case "1y":
      return "Last Year";
    case "custom":
      if (startDate && endDate) {
        return `${formatDateValue(startDate)} - ${formatDateValue(endDate)}`;
      }
      return "Custom Range";
    default:
      return "All Time";
  }
};

const getUniqueStringValues = (values: string[]) =>
  Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  ).sort();

const getCharacterOptions = (options: string[], selectedValues: string[]) =>
  getUniqueStringValues([...options, ...selectedValues]);

function PlayerAvatar({
  player,
  size = "lg",
}: {
  player: MatchupExplorerPlayer;
  size?: "md" | "lg";
}) {
  const sizeClasses = {
    md: "h-14 w-14 text-lg",
    lg: "h-20 w-20 text-2xl",
  };

  if (player.picture) {
    return (
      <img
        src={player.picture}
        alt={getPlayerLabel(player)}
        className={`${sizeClasses[size]} rounded-full border-2 border-gray-500 object-cover shadow-lg`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} flex items-center justify-center rounded-full border-2 border-gray-500 bg-gray-700 font-bold text-white shadow-lg`}
    >
      {getInitials(player)}
    </div>
  );
}

function PlayerSummaryCard({
  player,
  stats,
  selectedCharacter,
  excludedCharacters,
  accentClasses,
  onPlayerClick,
  onViewTopCharacters,
  disabled,
}: {
  player: MatchupExplorerPlayer;
  stats: MatchupParticipantStats;
  selectedCharacter: string;
  excludedCharacters: string[];
  accentClasses: string;
  onPlayerClick: (playerId: number) => void;
  onViewTopCharacters: (playerId: number) => void;
  disabled: boolean;
}) {
  const matchesPlayed = stats.wins + stats.losses;
  const headlineCharacter = selectedCharacter || player.main_character || "";

  return (
    <div
      className={`rounded-2xl border border-gray-700 bg-gray-800/80 p-5 shadow-lg transition-opacity ${
        disabled ? "opacity-70" : "opacity-100"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <PlayerAvatar player={player} />
            {headlineCharacter && (
              <div className="absolute -bottom-2 -right-2 rounded-full bg-black p-1 shadow-lg">
                <CharacterProfilePicture
                  characterName={headlineCharacter}
                  size="sm"
                  className="h-9 w-9 border-gray-300"
                />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onPlayerClick(player.id)}
              className="truncate text-left text-xl font-bold text-white transition-colors hover:text-yellow-400"
            >
              {getPlayerLabel(player)}
            </button>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-300">
              {player.country && isValidCountryCode(player.country) && (
                <ReactCountryFlag
                  countryCode={player.country.toUpperCase()}
                  svg
                  style={{ width: "1.2rem", height: "0.9rem" }}
                />
              )}
              <span>{selectedCharacter ? selectedCharacter : "Any character"}</span>
            </div>
            {excludedCharacters.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {excludedCharacters.map((character) => (
                  <span
                    key={character}
                    className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-orange-100"
                  >
                    Excluding {character}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div
          className={`rounded-full border px-3 py-1 text-sm font-semibold ${accentClasses}`}
        >
          {stats.wins}-{stats.losses}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onViewTopCharacters(player.id)}
          className="col-span-2 rounded-xl border border-blue-500/40 bg-blue-600/15 px-4 py-3 text-sm font-semibold text-blue-100 transition-colors hover:bg-blue-600/25 hover:text-white"
        >
          View Top Characters
        </button>
        <div className="rounded-xl bg-black/20 p-3">
          <div className="text-xs uppercase tracking-wide text-gray-400">
            Win %
          </div>
          <div className="mt-1 text-2xl font-bold text-white">
            {formatPercent(stats.wins, matchesPlayed)}
          </div>
        </div>
        <div className="rounded-xl bg-black/20 p-3">
          <div className="text-xs uppercase tracking-wide text-gray-400">
            K/D Ratio
          </div>
          <div className="mt-1 text-2xl font-bold text-white">
            {formatKdRatio(stats)}
          </div>
        </div>
        <div className="rounded-xl bg-black/20 p-3">
          <div className="text-xs uppercase tracking-wide text-gray-400">
            KOs
          </div>
          <div className="mt-1 text-xl font-semibold text-orange-300">
            {stats.totalKos}
          </div>
        </div>
        <div className="rounded-xl bg-black/20 p-3">
          <div className="text-xs uppercase tracking-wide text-gray-400">
            Falls + SDs
          </div>
          <div className="mt-1 text-xl font-semibold text-purple-300">
            {stats.totalFalls + stats.totalSds}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerFilterCard({
  player,
  selectedCharacter,
  availableCharacters,
  excludedCharacters,
  disabled,
  onCharacterChange,
  onAddExcludedCharacter,
  onRemoveExcludedCharacter,
  onClearExcludedCharacters,
}: {
  player: MatchupExplorerPlayer;
  selectedCharacter: string;
  availableCharacters: string[];
  excludedCharacters: string[];
  disabled: boolean;
  onCharacterChange: (character: string) => void;
  onAddExcludedCharacter: (character: string) => void;
  onRemoveExcludedCharacter: (character: string) => void;
  onClearExcludedCharacters: () => void;
}) {
  const availableExclusionOptions = availableCharacters.filter(
    (character) =>
      character !== selectedCharacter && !excludedCharacters.includes(character)
  );
  const headlineCharacter = selectedCharacter || player.main_character || "";

  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-800/70 p-4 shadow-lg">
      <div className="flex items-center gap-3">
        <div className="relative">
          <PlayerAvatar player={player} size="md" />
          {headlineCharacter && (
            <div className="absolute -bottom-1 -right-1 rounded-full bg-black p-1 shadow-lg">
              <CharacterProfilePicture
                characterName={headlineCharacter}
                size="sm"
                className="h-7 w-7 border-gray-300"
              />
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-white">
            {getPlayerLabel(player)}
          </div>
          <div className="text-sm text-gray-400">Character filters</div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <CharacterDropdown
            characters={availableCharacters}
            selectedValues={selectedCharacter ? [selectedCharacter] : []}
            onChange={(nextSelectedValues) =>
              onCharacterChange(nextSelectedValues[0] || "")
            }
            disabled={disabled}
            label="Character"
            placeholder="Any character"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="text-sm font-medium text-gray-300">
              Exclude characters
            </label>
            {excludedCharacters.length > 0 && (
              <button
                type="button"
                onClick={onClearExcludedCharacters}
                className="text-xs font-semibold text-gray-400 transition-colors hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          <CharacterDropdown
            characters={availableExclusionOptions}
            selectedValues={[]}
            onChange={(nextSelectedValues) => {
              const nextCharacter = nextSelectedValues[0];
              if (nextCharacter) {
                onAddExcludedCharacter(nextCharacter);
              }
            }}
            disabled={disabled || availableExclusionOptions.length === 0}
            placeholder={
              availableExclusionOptions.length > 0
                ? "Add excluded character"
                : "No exclusions available"
            }
          />

          {excludedCharacters.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {excludedCharacters.map((character) => (
                <button
                  key={character}
                  type="button"
                  onClick={() => onRemoveExcludedCharacter(character)}
                  className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-orange-100 transition-colors hover:bg-orange-500/20"
                >
                  <span>{character}</span>
                  <X size={12} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MatchupExplorer({
  players,
  isRefreshing,
  onPlayerClick,
  refreshToken,
}: MatchupExplorerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [matchup, setMatchup] = useState<MatchupApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customStartInput, setCustomStartInput] = useState("");
  const [customEndInput, setCustomEndInput] = useState("");
  const [recentMatchLimit, setRecentMatchLimit] = useState(5);
  const [showUtcTime, setShowUtcTime] = useState(false);

  const player1QueryValue = searchParams.get("player1") || "";
  const player2QueryValue = searchParams.get("player2") || "";
  const player1Character = searchParams.get("player1Character") || "";
  const player2Character = searchParams.get("player2Character") || "";
  const player1ExcludedCharacters = getUniqueStringValues(
    searchParams.getAll("player1ExcludeCharacter")
  );
  const player2ExcludedCharacters = getUniqueStringValues(
    searchParams.getAll("player2ExcludeCharacter")
  );
  const player1ExcludedCharactersKey = player1ExcludedCharacters.join("||");
  const player2ExcludedCharactersKey = player2ExcludedCharacters.join("||");
  const timeRange = parseMatchupTimeRange(searchParams.get("timeRange"));
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";

  const selectedPlayer1 = findPlayerByQueryValue(player1QueryValue, players);
  const selectedPlayer2 = findPlayerByQueryValue(player2QueryValue, players);
  const player1Id = selectedPlayer1 ? selectedPlayer1.id.toString() : "";
  const player2Id = selectedPlayer2 ? selectedPlayer2.id.toString() : "";

  useEffect(() => {
    if (timeRange === "custom") {
      setCustomStartInput(startDate);
      setCustomEndInput(endDate);
      return;
    }

    const presetDateInputs = getPresetDateInputs(timeRange);
    setCustomStartInput(presetDateInputs.startDate);
    setCustomEndInput(presetDateInputs.endDate);
  }, [timeRange, startDate, endDate]);

  useEffect(() => {
    setRecentMatchLimit(5);
  }, [
    player1Id,
    player2Id,
    player1Character,
    player2Character,
    player1ExcludedCharactersKey,
    player2ExcludedCharactersKey,
    timeRange,
    startDate,
    endDate,
  ]);

  const updateQuery = (next: MatchupQueryState) => {
    const params = new URLSearchParams();

    if (next.player1) {
      params.set(
        "player1",
        serializePlayerIdToQueryValue(next.player1, players)
      );
    }
    if (next.player2) {
      params.set(
        "player2",
        serializePlayerIdToQueryValue(next.player2, players)
      );
    }
    if (next.player1Character) {
      params.set("player1Character", next.player1Character);
    }
    if (next.player2Character) {
      params.set("player2Character", next.player2Character);
    }
    next.player1ExcludedCharacters.forEach((character) => {
      params.append("player1ExcludeCharacter", character);
    });
    next.player2ExcludedCharacters.forEach((character) => {
      params.append("player2ExcludeCharacter", character);
    });
    if (next.timeRange !== "all") {
      params.set("timeRange", next.timeRange);
    }
    if (next.timeRange === "custom" && next.startDate) {
      params.set("startDate", next.startDate);
    }
    if (next.timeRange === "custom" && next.endDate) {
      params.set("endDate", next.endDate);
    }

    const queryString = params.toString();
    router.replace(queryString ? `/matchups?${queryString}` : "/matchups", {
      scroll: false,
    });
  };

  useEffect(() => {
    if (!player1QueryValue || !player2QueryValue) {
      setMatchup(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (players.length === 0) {
      setMatchup(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (!selectedPlayer1 || !selectedPlayer2) {
      setMatchup(null);
      setError("Choose two valid players to compare.");
      setLoading(false);
      return;
    }

    if (player1Id === player2Id) {
      setMatchup(null);
      setError("Choose two different players to compare.");
      setLoading(false);
      return;
    }

    if (timeRange === "custom" && (!startDate || !endDate)) {
      setMatchup(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (timeRange === "custom" && startDate > endDate) {
      setMatchup(null);
      setError("Custom start date must be on or before the end date.");
      setLoading(false);
      return;
    }

    const abortController = new AbortController();

    const loadMatchup = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          player1: player1Id,
          player2: player2Id,
          recentLimit: String(recentMatchLimit),
        });

        if (player1Character) {
          params.set("player1Character", player1Character);
        }
        if (player2Character) {
          params.set("player2Character", player2Character);
        }
        player1ExcludedCharacters.forEach((character) => {
          params.append("player1ExcludeCharacter", character);
        });
        player2ExcludedCharacters.forEach((character) => {
          params.append("player2ExcludeCharacter", character);
        });
        if (timeRange !== "all") {
          params.set("timeRange", timeRange);
        }
        if (timeRange === "custom") {
          params.set("startDate", startDate);
          params.set("endDate", endDate);
        }

        const response = await fetch(`/api/matchups?${params.toString()}`, {
          cache: "no-store",
          signal: abortController.signal,
        });
        const data = (await response.json()) as MatchupApiResponse;

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch matchup data.");
        }

        setMatchup(data);
      } catch (fetchError) {
        if (abortController.signal.aborted) {
          return;
        }

        setMatchup(null);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to fetch matchup data."
        );
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadMatchup();

    return () => {
      abortController.abort();
    };
    // The exclusion arrays are normalized into stable string keys above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    player1Id,
    player2Id,
    player1QueryValue,
    player2QueryValue,
    player1Character,
    player2Character,
    player1ExcludedCharactersKey,
    player2ExcludedCharactersKey,
    timeRange,
    startDate,
    endDate,
    recentMatchLimit,
    refreshToken,
  ]);

  const player1Options = players.filter(
    (player) => !player2Id || player.id.toString() !== player2Id
  );
  const player2Options = players.filter(
    (player) => !player1Id || player.id.toString() !== player1Id
  );
  const bothPlayersSelected = Boolean(player1Id && player2Id);

  const currentMatchCount = matchup?.totalMatches || 0;
  const overallMatchCount = matchup?.overallMatches || 0;
  const playerOneWins = matchup?.player1.wins || 0;
  const playerTwoWins = matchup?.player2.wins || 0;
  const totalWins = playerOneWins + playerTwoWins;
  const playerOneShare =
    totalWins > 0 ? (playerOneWins / totalWins) * 100 : 50;
  const playerTwoShare =
    totalWins > 0 ? (playerTwoWins / totalWins) * 100 : 50;
  const dateRangeLabel = getTimeRangeLabel(timeRange, startDate, endDate);
  const customDateValidationError =
    customStartInput && customEndInput && customStartInput > customEndInput
      ? "Start date must be on or before the end date."
      : null;
  const filteredPlayerOneCharacters = getCharacterOptions(
    matchup?.availableCharacters.player1 || [],
    [player1Character, ...player1ExcludedCharacters]
  );
  const filteredPlayerTwoCharacters = getCharacterOptions(
    matchup?.availableCharacters.player2 || [],
    [player2Character, ...player2ExcludedCharacters]
  );

  const baseQueryState: MatchupQueryState = {
    player1: player1Id,
    player2: player2Id,
    player1Character,
    player2Character,
    player1ExcludedCharacters,
    player2ExcludedCharacters,
    timeRange,
    startDate,
    endDate,
  };

  const applyQueryState = (
    nextTimeRange: MatchupTimeRange,
    nextStartDate: string,
    nextEndDate: string
  ) => {
    const isSameQueryState =
      timeRange === nextTimeRange &&
      startDate === nextStartDate &&
      endDate === nextEndDate;

    if (isSameQueryState) {
      return;
    }

    setError(null);
    updateQuery({
      ...baseQueryState,
      timeRange: nextTimeRange,
      startDate: nextStartDate,
      endDate: nextEndDate,
    });
  };

  const applyPresetTimeRange = (
    nextTimeRange: Exclude<MatchupTimeRange, "custom">
  ) => {
    const presetDateInputs = getPresetDateInputs(nextTimeRange);
    setCustomStartInput(presetDateInputs.startDate);
    setCustomEndInput(presetDateInputs.endDate);
    applyQueryState(nextTimeRange, "", "");
  };

  const syncCustomRange = (nextStartDate: string, nextEndDate: string) => {
    if (!nextStartDate || !nextEndDate || nextStartDate > nextEndDate) {
      return;
    }

    applyQueryState("custom", nextStartDate, nextEndDate);
  };

  const handleCustomStartChange = (nextStartDate: string) => {
    setCustomStartInput(nextStartDate);
    syncCustomRange(nextStartDate, customEndInput);
  };

  const handleCustomEndChange = (nextEndDate: string) => {
    setCustomEndInput(nextEndDate);
    syncCustomRange(customStartInput, nextEndDate);
  };

  const handleCustomTimeRangeClick = () => {
    syncCustomRange(customStartInput, customEndInput);
  };

  const openCharacterRankings = (playerId: number) => {
    const rankingPlayer = serializePlayerIdToQueryValue(playerId, players);
    const params = new URLSearchParams();

    params.set("rankingsView", "character-based");
    params.append("rankingPlayer", rankingPlayer);

    router.push(`/?${params.toString()}`);
  };

  const openMatchHistory = (matchId: number) => {
    const params = new URLSearchParams();
    if (selectedPlayer1) {
      params.append(
        "player",
        serializePlayerIdToQueryValue(selectedPlayer1.id, players)
      );
    }
    if (selectedPlayer2) {
      params.append(
        "player",
        serializePlayerIdToQueryValue(selectedPlayer2.id, players)
      );
    }
    params.set("only1v1", "true");
    params.set("matchId", matchId.toString());
    params.set("showMatchIdSearch", "true");

    router.push(`/matches?${params.toString()}`);
  };

  const recentMatchCards: MatchCardMatch[] =
    matchup && selectedPlayer1 && selectedPlayer2
      ? matchup.recentMatches.map((match) => ({
          id: match.id,
          created_at: match.created_at,
          participants: [
            {
              id: match.id * 10 + 1,
              player: selectedPlayer1.id,
              player_name: selectedPlayer1.name,
              player_display_name: selectedPlayer1.display_name,
              smash_character: match.player1Character,
              is_cpu: false,
              total_kos: match.player1Kos,
              total_falls: match.player1Falls,
              total_sds: match.player1Sds,
              has_won: match.player1Won,
            },
            {
              id: match.id * 10 + 2,
              player: selectedPlayer2.id,
              player_name: selectedPlayer2.name,
              player_display_name: selectedPlayer2.display_name,
              smash_character: match.player2Character,
              is_cpu: false,
              total_kos: match.player2Kos,
              total_falls: match.player2Falls,
              total_sds: match.player2Sds,
              has_won: match.player2Won,
            },
          ],
        }))
      : [];
  const hasMoreRecentMatches =
    matchup !== null && matchup.totalMatches > recentMatchCards.length;

  return (
    <div
      className={`p-6 transition-opacity duration-300 ${
        isRefreshing ? "opacity-75" : "opacity-100"
      }`}
    >
      <div className="rounded-2xl border border-gray-700 bg-gray-800/90 p-5 shadow-lg">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                Matchup Search
              </div>
              <h3 className="mt-1 text-2xl font-bold text-white">
                Compare Two Players
              </h3>
            </div>

            {(player1Id || player2Id) && (
              <button
                type="button"
                onClick={() => {
                  setMatchup(null);
                  setError(null);
                  router.replace("/matchups");
                }}
                className="inline-flex items-center gap-2 self-start rounded-xl border border-gray-600 bg-gray-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-600"
              >
                <X size={14} />
                Clear
              </button>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <PlayerDropdown
              players={player1Options}
              selectedIds={player1Id ? [player1Id] : []}
              onChange={(nextSelectedIds) =>
                updateQuery({
                  ...baseQueryState,
                  player1: nextSelectedIds[0] || "",
                  player1Character: "",
                  player1ExcludedCharacters: [],
                })
              }
              placeholder="Search player one"
              label="Player One"
            />

            <PlayerDropdown
              players={player2Options}
              selectedIds={player2Id ? [player2Id] : []}
              onChange={(nextSelectedIds) =>
                updateQuery({
                  ...baseQueryState,
                  player2: nextSelectedIds[0] || "",
                  player2Character: "",
                  player2ExcludedCharacters: [],
                })
              }
              placeholder="Search player two"
              label="Player Two"
            />
          </div>

        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-950/40 px-5 py-4 text-red-100">
          {error}
        </div>
      )}

      {!bothPlayersSelected ? (
        <div className="mt-6 rounded-2xl border border-dashed border-gray-700 bg-gray-900/40 px-6 py-16 text-center text-gray-400">
          Choose two players to unlock matchup filters and results.
        </div>
      ) : !selectedPlayer1 || !selectedPlayer2 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-red-500/40 bg-red-950/30 px-6 py-16 text-center text-red-100">
          One of the selected players is no longer available.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="rounded-2xl border border-gray-700 bg-gradient-to-br from-gray-900 to-gray-800 p-5 shadow-lg">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                    Filters
                  </div>
                  <h3 className="mt-1 text-xl font-bold text-white">
                    Refine {getPlayerLabel(selectedPlayer1)} vs{" "}
                    {getPlayerLabel(selectedPlayer2)}
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-200">
                    {dateRangeLabel}
                  </div>
                  {loading && (
                    <div className="rounded-full border border-blue-500/30 bg-blue-950/30 px-3 py-1.5 text-sm font-medium text-blue-100">
                      Refreshing
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1fr_1fr_320px]">
                <PlayerFilterCard
                  player={selectedPlayer1}
                  selectedCharacter={player1Character}
                  availableCharacters={filteredPlayerOneCharacters}
                  excludedCharacters={player1ExcludedCharacters}
                  disabled={!matchup}
                  onCharacterChange={(character) =>
                    updateQuery({
                      ...baseQueryState,
                      player1Character: character,
                      player1ExcludedCharacters: player1ExcludedCharacters.filter(
                        (value) => value !== character
                      ),
                    })
                  }
                  onAddExcludedCharacter={(character) =>
                    updateQuery({
                      ...baseQueryState,
                      player1ExcludedCharacters: getUniqueStringValues([
                        ...player1ExcludedCharacters.filter(
                          (value) => value !== player1Character
                        ),
                        character,
                      ]),
                    })
                  }
                  onRemoveExcludedCharacter={(character) =>
                    updateQuery({
                      ...baseQueryState,
                      player1ExcludedCharacters: player1ExcludedCharacters.filter(
                        (value) => value !== character
                      ),
                    })
                  }
                  onClearExcludedCharacters={() =>
                    updateQuery({
                      ...baseQueryState,
                      player1ExcludedCharacters: [],
                    })
                  }
                />

                <PlayerFilterCard
                  player={selectedPlayer2}
                  selectedCharacter={player2Character}
                  availableCharacters={filteredPlayerTwoCharacters}
                  excludedCharacters={player2ExcludedCharacters}
                  disabled={!matchup}
                  onCharacterChange={(character) =>
                    updateQuery({
                      ...baseQueryState,
                      player2Character: character,
                      player2ExcludedCharacters: player2ExcludedCharacters.filter(
                        (value) => value !== character
                      ),
                    })
                  }
                  onAddExcludedCharacter={(character) =>
                    updateQuery({
                      ...baseQueryState,
                      player2ExcludedCharacters: getUniqueStringValues([
                        ...player2ExcludedCharacters.filter(
                          (value) => value !== player2Character
                        ),
                        character,
                      ]),
                    })
                  }
                  onRemoveExcludedCharacter={(character) =>
                    updateQuery({
                      ...baseQueryState,
                      player2ExcludedCharacters: player2ExcludedCharacters.filter(
                        (value) => value !== character
                      ),
                    })
                  }
                  onClearExcludedCharacters={() =>
                    updateQuery({
                      ...baseQueryState,
                      player2ExcludedCharacters: [],
                    })
                  }
                />

                <div className="flex h-full flex-col justify-between rounded-2xl border border-gray-700 bg-gray-800/70 p-4 shadow-lg">
                  <label className="mb-3 block text-sm font-medium text-gray-300">
                    Date Range
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "all" as const, label: "All" },
                      { value: "7d" as const, label: "7D" },
                      { value: "30d" as const, label: "30D" },
                      { value: "1y" as const, label: "1Y" },
                      { value: "custom" as const, label: "Custom" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          option.value === "custom"
                            ? handleCustomTimeRangeClick()
                            : applyPresetTimeRange(option.value)
                        }
                        className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                          timeRange === option.value
                            ? "bg-blue-600 text-white"
                            : "bg-gray-900 text-gray-300 hover:bg-gray-700 hover:text-white"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Start
                      </label>
                      <input
                        type="date"
                        value={customStartInput}
                        onChange={(event) =>
                          handleCustomStartChange(event.target.value)
                        }
                        className="w-full rounded-xl border border-gray-600 bg-gray-900 px-4 py-3 text-white outline-none transition-colors focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                        End
                      </label>
                      <input
                        type="date"
                        value={customEndInput}
                        onChange={(event) =>
                          handleCustomEndChange(event.target.value)
                        }
                        className="w-full rounded-xl border border-gray-600 bg-gray-900 px-4 py-3 text-white outline-none transition-colors focus:border-blue-500"
                      />
                    </div>
                    {customDateValidationError && (
                      <div className="text-sm font-medium text-red-400">
                        {customDateValidationError}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <>
              <div className="rounded-2xl border border-gray-700 bg-gradient-to-br from-gray-900 to-gray-800 p-6 shadow-lg">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                      Rivalry Snapshot
                    </div>
                    <h3 className="mt-1 text-2xl font-bold text-white">
                      {getPlayerLabel(selectedPlayer1)} vs{" "}
                      {getPlayerLabel(selectedPlayer2)}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm font-medium text-white">
                      {currentMatchCount} filtered matches
                    </div>
                    <div className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-300">
                      {overallMatchCount} total
                    </div>
                    <div className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-300">
                      {dateRangeLabel}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_260px_1fr]">
                  <PlayerSummaryCard
                    player={selectedPlayer1}
                    stats={
                      matchup?.player1 || {
                        wins: 0,
                        losses: 0,
                        totalKos: 0,
                        totalFalls: 0,
                        totalSds: 0,
                      }
                    }
                    selectedCharacter={player1Character}
                    excludedCharacters={player1ExcludedCharacters}
                    accentClasses="border-red-500/30 bg-red-600/20 text-red-100"
                    onPlayerClick={onPlayerClick}
                    onViewTopCharacters={openCharacterRankings}
                    disabled={!matchup}
                  />

                  <div className="rounded-2xl border border-gray-700 bg-black/20 p-5">
                    <div className="text-center text-sm uppercase tracking-[0.2em] text-gray-400">
                      Win Split
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div className="text-left">
                        <div className="text-4xl font-black text-red-300">
                          {playerOneWins}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {getPlayerLabel(selectedPlayer1)}
                        </div>
                      </div>
                      <div className="pb-2 text-lg font-semibold text-gray-500">
                        VS
                      </div>
                      <div className="text-right">
                        <div className="text-4xl font-black text-blue-300">
                          {playerTwoWins}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {getPlayerLabel(selectedPlayer2)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-5 flex h-4 overflow-hidden rounded-full bg-gray-700">
                      <div
                        className="h-full bg-gradient-to-r from-red-500 to-red-400"
                        style={{ width: `${playerOneShare}%` }}
                      />
                      <div
                        className="h-full bg-gradient-to-r from-blue-400 to-blue-500"
                        style={{ width: `${playerTwoShare}%` }}
                      />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                      <div className="rounded-xl bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">
                          {getPlayerLabel(selectedPlayer1)}
                        </div>
                        <div className="mt-1 text-lg font-bold text-white">
                          {formatPercent(playerOneWins, currentMatchCount)}
                        </div>
                      </div>
                      <div className="rounded-xl bg-black/20 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">
                          {getPlayerLabel(selectedPlayer2)}
                        </div>
                        <div className="mt-1 text-lg font-bold text-white">
                          {formatPercent(playerTwoWins, currentMatchCount)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <PlayerSummaryCard
                    player={selectedPlayer2}
                    stats={
                      matchup?.player2 || {
                        wins: 0,
                        losses: 0,
                        totalKos: 0,
                        totalFalls: 0,
                        totalSds: 0,
                      }
                    }
                    selectedCharacter={player2Character}
                    excludedCharacters={player2ExcludedCharacters}
                    accentClasses="border-blue-500/30 bg-blue-600/20 text-blue-100"
                    onPlayerClick={onPlayerClick}
                    onViewTopCharacters={openCharacterRankings}
                    disabled={!matchup}
                  />
                </div>

                {matchup && matchup.totalMatches === 0 && (
                  <div className="mt-6 rounded-2xl border border-yellow-500/30 bg-yellow-950/20 px-5 py-4 text-sm text-yellow-100">
                    {matchup.overallMatches === 0
                      ? timeRange === "all"
                        ? "These players do not have any recorded 1v1 matches against each other yet."
                        : "These players do not have any recorded 1v1 matches in the selected date window."
                      : "No matches were found for the current character, exclusion, and date filter combination."}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-gray-700 bg-gray-900/90 p-6 shadow-lg">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-white">Recent Matches</h3>
                    <p className="mt-1 text-sm text-gray-400">
                      Showing {recentMatchCards.length} of {currentMatchCount} matches
                    </p>
                  </div>

                  {hasMoreRecentMatches && (
                    <button
                      type="button"
                      onClick={() =>
                        setRecentMatchLimit((currentLimit) => currentLimit + 5)
                      }
                      disabled={loading}
                      className="inline-flex items-center gap-2 rounded-xl border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loading ? "Loading..." : "Load 5 More"}
                    </button>
                  )}
                </div>

                {recentMatchCards.length > 0 ? (
                  <div className="mt-6 space-y-4">
                    {recentMatchCards.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        players={[selectedPlayer1, selectedPlayer2]}
                        showUtcTime={showUtcTime}
                        onToggleTime={() => setShowUtcTime((current) => !current)}
                        onPlayerClick={onPlayerClick}
                        headerActions={
                          <button
                            type="button"
                            onClick={() => openMatchHistory(match.id)}
                            className="rounded bg-gray-600 px-2 py-1 text-xs font-medium text-white transition-colors duration-200 hover:bg-gray-500"
                          >
                            Open in match history
                          </button>
                        }
                      />
                    ))}

                    {hasMoreRecentMatches && (
                      <div className="flex justify-center pt-2">
                        <button
                          type="button"
                          onClick={() =>
                            setRecentMatchLimit((currentLimit) => currentLimit + 5)
                          }
                          disabled={loading}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-600 bg-gray-800 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {loading ? "Loading..." : "Load More Matches"}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-dashed border-gray-700 bg-gray-800/40 px-6 py-16 text-center text-gray-400">
                    {loading
                      ? "Loading matchup history..."
                      : "No recent matches match the current selection."}
                  </div>
                )}
              </div>
          </>
        </div>
      )}
    </div>
  );
}
