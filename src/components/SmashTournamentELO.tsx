"use client";

import {
  getPlayerQueryLabel,
  resolvePlayerQueryValuesToIds,
  serializePlayerIdToQueryValue,
  serializePlayerIdsToQueryValues,
} from "@/lib/playerQuery";
import { Player } from "@/lib/prisma";
import {
  Check,
  Filter,
  List,
  RefreshCw,
  Search,
  Swords,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import React, { memo, useEffect, useRef, useState } from "react";
import ReactCountryFlag from "react-country-flag";
import CharacterDropdown from "./CharacterDropdown";
import CharacterIcon from "./CharacterIcon";
import CharacterProfilePicture from "./CharacterProfilePicture";
import MatchCard from "./MatchCard";
import MatchupExplorer from "./MatchupExplorer";
import PingDot from "./PingDot";
import PlayerDropdown, { type PlayerDropdownPlayer } from "./PlayerDropdown";

// Extended player interface for frontend with real stats
interface ExtendedPlayer extends Omit<Player, "id" | "elo"> {
  id: number;
  elo: number;
  matches: number;
  is_ranked: boolean;
  inactive: boolean;
  top_ten_played: number;
  main_character?: string;
  total_wins?: number;
  total_losses?: number;
  total_kos?: number;
  total_falls?: number;
  total_sds?: number;
  current_win_streak?: number;
  last_match_date?: string | null;
}

interface CharacterRanking {
  id: string;
  player_id: number;
  name: string;
  display_name: string | null;
  elo: number;
  matches: number;
  country?: string | null;
  picture?: string | null;
  character_name: string;
  total_wins?: number;
  total_losses?: number;
  total_kos?: number;
  total_falls?: number;
  total_sds?: number;
  current_win_streak?: number;
  last_match_date?: string | null;
}

type TierListEntry = {
  key: string;
  player_id: number;
  name: string;
  display_name: string | null;
  picture?: string | null;
  country?: string | null;
  character_name: string | null;
  characterLabel: "Character Based" | "Main character";
  elo: number;
  current_win_streak?: number;
  inactive: boolean;
  showInactiveOverlay: boolean;
};

// Match participant interface
interface MatchParticipant {
  id: number;
  player: number;
  player_name: string;
  player_display_name: string | null;
  smash_character: string;
  is_cpu: boolean;
  total_kos: number;
  total_falls: number;
  total_sds: number;
  has_won: boolean;
}

// Match interface
interface Match {
  id: number;
  created_at: string;
  participants: MatchParticipant[];
}

interface MatchesApiResponse {
  matches?: Match[];
  pagination?: {
    page?: number;
    limit?: number;
    hasMore?: boolean;
    mode?: "list" | "context";
    anchorId?: number;
    contextLimit?: number;
    direction?: "above" | "below";
    hasMoreAbove?: boolean;
    hasMoreBelow?: boolean;
  };
  error?: string;
}

type Tier = "S" | "A" | "B" | "C" | "D" | "E" | "F";
type CacheTag = "players" | "matches";
type LeaderboardTab = "overall" | "character" | "unranked" | "inactive";
type OverallRankingsView = "all-characters" | "best-character";
type TierListView = "all-characters" | "best-character";
type CharacterRankingPlayerFilterMode = "include" | "exclude";
type CharacterRankingPlayerRowLimit = 1 | 2 | 3 | 4 | 5 | "all";

interface CharacterBasedFilterQueryState {
  characterRankingPlayerFilterMode: CharacterRankingPlayerFilterMode;
  selectedCharacterRankingPlayerIds: string[];
  characterRankingPlayerRowLimit: CharacterRankingPlayerRowLimit;
}

interface RankingQueryState {
  leaderboardTab: LeaderboardTab;
  overallRankingsView: OverallRankingsView;
  selectedCharacterRankingCharacter: string;
  characterRankingPlayerFilterMode: CharacterRankingPlayerFilterMode;
  selectedCharacterRankingPlayerIds: string[];
  characterRankingPlayerRowLimit: CharacterRankingPlayerRowLimit;
}

const MATCHES_PAGE_SIZE = 20;
const MATCH_CONTEXT_PAGE_SIZE = 2;
const CHARACTER_RANKINGS_BATCH_SIZE = 50;
const CHARACTER_RANKING_MIN_MATCHES = 5;
const DEFAULT_CHARACTER_RANKING_PLAYER_ROW_LIMIT = 3;
const RANKING_QUERY_CHARACTER_PARAM = "rankingCharacter";
const RANKING_QUERY_PLAYER_PARAM = "rankingPlayer";
const RANKING_QUERY_PLAYER_LIMIT_PARAM = "rankingPlayerLimit";
const CHARACTER_RANKING_PLAYER_LIMIT_OPTIONS: CharacterRankingPlayerRowLimit[] = [
  1,
  2,
  3,
  4,
  5,
  "all",
];
const TIER_NAMES: Tier[] = ["S", "A", "B", "C", "D", "E", "F"];

const createEmptyTierList = (): Record<Tier, TierListEntry[]> => ({
  S: [],
  A: [],
  B: [],
  C: [],
  D: [],
  E: [],
  F: [],
});

const getUniqueQueryValues = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

const getPlayerIdSelectionKey = (playerIds: string[]) =>
  Array.from(new Set(playerIds)).sort().join("|");

const parseLeaderboardTab = (value: string | null): LeaderboardTab => {
  switch (value) {
    case "character":
    case "unranked":
    case "inactive":
      return value;
    default:
      return "overall";
  }
};

const parseOverallRankingsView = (value: string | null): OverallRankingsView => {
  switch (value) {
    case "all-characters":
    case "best-character":
      return value;
    default:
      return "best-character";
  }
};

const parseTierListView = (value: string | null): TierListView => {
  switch (value) {
    case "all-characters":
    case "best-character":
      return value;
    default:
      return "best-character";
  }
};

const parseCharacterRankingPlayerFilterMode = (
  value: string | null
): CharacterRankingPlayerFilterMode => {
  switch (value) {
    case "exclude":
      return value;
    default:
      return "include";
  }
};

const parseCharacterRankingPlayerRowLimit = (
  value: string | null
): CharacterRankingPlayerRowLimit => {
  switch (value) {
    case "1":
      return 1;
    case "2":
      return 2;
    case "3":
      return 3;
    case "4":
      return 4;
    case "5":
      return 5;
    case "all":
      return "all";
    default:
      return DEFAULT_CHARACTER_RANKING_PLAYER_ROW_LIMIT;
  }
};

// Memoized component for refresh status to prevent unnecessary rerendersO
const RefreshStatus = memo(
  ({
    refreshing,
    countdown,
    lastUpdated,
    centered = false,
    autoRefreshDisabled = false,
  }: {
    refreshing: boolean;
    countdown: number;
    lastUpdated: Date | null;
    centered?: boolean;
    autoRefreshDisabled?: boolean;
  }) => {
    if (!lastUpdated) return null;

    return (
      <div
        className={`text-sm text-gray-200 mt-1 flex items-center ${
          centered ? "justify-center" : ""
        }`}
      >
        {refreshing ? (
          <>
            <div className="animate-spin h-3 w-3 border border-white border-t-transparent rounded-full mr-2"></div>
            Refreshing...
          </>
        ) : autoRefreshDisabled ? (
          <>
            <span className="mr-2 text-yellow-300">●</span>
            <span>Reload page to start auto refreshing</span>
          </>
        ) : (
          <>
            {/* <span>Last updated: {lastUpdated.toLocaleTimeString()}</span> */}
            {/* <span className="mx-2 text-gray-400">•</span> */}
            <PingDot color="green" className="mr-2" />
            <span>Refreshing in {countdown}s</span>
          </>
        )}
      </div>
    );
  }
);

RefreshStatus.displayName = "RefreshStatus";

const HardRefreshButton = memo(
  ({
    onRefresh,
    centered = false,
    disabled = false,
  }: {
    onRefresh: () => void | Promise<void>;
    centered?: boolean;
    disabled?: boolean;
  }) => (
    <button
      onClick={onRefresh}
      type="button"
      disabled={disabled}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-500 bg-gray-800 text-white transition-colors duration-200 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60 ${
        centered ? "mt-3" : ""
      }`}
      title="Hard refresh data"
      aria-label="Hard refresh data"
    >
      <RefreshCw size={16} />
    </button>
  )
);

HardRefreshButton.displayName = "HardRefreshButton";

// ProfilePicture component with zoom and translate effects
const ProfilePicture = memo(
  ({
    player,
    size = "md",
    borderColor = "border-gray-600",
    borderWidth = "border-2",
    additionalClasses = "",
  }: {
    player: ExtendedPlayer | { name: string; display_name: string | null };
    size?: "sm" | "md" | "lg" | "xl";
    borderColor?: string;
    borderWidth?: string;
    additionalClasses?: string;
  }) => {
    const sizeClasses = {
      sm: "h-10 w-10 md:h-10 md:w-10",
      md: "h-12 w-12 md:h-20 md:w-20",
      lg: "h-16 w-16 md:h-20 md:w-20",
      xl: "h-24 w-24",
    };

    const textSizeClasses = {
      sm: "text-xs",
      md: "text-xs md:text-lg",
      lg: "text-lg md:text-2xl",
      xl: "text-2xl",
    };

    const getProfilePicture = (
      player:
        | ExtendedPlayer
        | { name: string; display_name: string | null; picture?: string | null }
    ): string | null => {
      // Check if player has a custom picture URL
      if ("picture" in player && player.picture) {
        return player.picture;
      }

      return null;
    };

    const getInitials = (
      player: ExtendedPlayer | { name: string; display_name: string | null }
    ): string => {
      const nameToUse = player.display_name || player.name;
      return (nameToUse || "")
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase();
    };

    const profilePic = getProfilePicture(player);

    const isRoundedLg = additionalClasses.includes("rounded-lg");
    const roundedClass = isRoundedLg ? "rounded-lg" : "rounded-full";

    if (profilePic) {
      return (
        <div
          className={`${sizeClasses[size]} ${roundedClass} overflow-hidden ${borderWidth} ${borderColor} ${additionalClasses}`}
        >
          <img
            src={profilePic}
            alt={player.display_name || player.name}
            className="w-full h-full object-cover"
          />
        </div>
      );
    }

    const bgColor = additionalClasses.includes("bg-") ? "" : "bg-gray-700";

    return (
      <div
        className={`${sizeClasses[size]} ${roundedClass} ${bgColor} flex items-center justify-center ${borderWidth} ${borderColor} ${additionalClasses}`}
      >
        <span className={`${textSizeClasses[size]} font-bold text-white`}>
          {getInitials(player)}
        </span>
      </div>
    );
  }
);

ProfilePicture.displayName = "ProfilePicture";

// Fire streak component for win streaks
const FireStreak = memo(({ streak }: { streak: number }) => {
  if (streak < 3) return null;

  const getBadgeStyles = (streak: number) => {
    if (streak >= 10) {
      return {
        bg: "bg-purple-500/20",
        border: "border-purple-500/50",
        text: "text-purple-300",
        glow: "shadow-[0_0_10px_rgba(168,85,247,0.3)]",
      };
    }
    if (streak >= 5) {
      return {
        bg: "bg-blue-500/20",
        border: "border-blue-500/50",
        text: "text-blue-300",
        glow: "shadow-[0_0_10px_rgba(59,130,246,0.3)]",
      };
    }
    return {
      bg: "bg-orange-500/20",
      border: "border-orange-500/50",
      text: "text-orange-300",
      glow: "shadow-[0_0_10px_rgba(251,146,60,0.3)]",
    };
  };

  const styles = getBadgeStyles(streak);

  return (
    <div
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 ml-1 md:px-2 md:py-0.5 md:ml-2 rounded-full border text-xs md:text-xs font-semibold animate-pulse ${styles.bg} ${styles.border} ${styles.text} ${styles.glow}`}
    >
      <span className="text-xs md:text-sm">🔥</span>
      <span>{streak}</span>
    </div>
  );
});

FireStreak.displayName = "FireStreak";

interface SmashTournamentELOProps {
  defaultTab?: "tiers" | "rankings" | "matchups" | "matches" | "players";
}

const getPlayerDisplayName = ({
  display_name,
  name,
}: {
  display_name: string | null;
  name: string;
}) => display_name || name;

const getPossessiveLabel = (label: string) =>
  `${label}${label.endsWith("'") ? "s" : "'s"}`;

interface CharacterBasedFiltersProps {
  description: string;
  showFilters: boolean;
  onToggle: () => void;
  playerOptions: PlayerDropdownPlayer[];
  selectedPlayerIds: string[];
  filterMode: CharacterRankingPlayerFilterMode;
  rowLimit: CharacterRankingPlayerRowLimit;
  onPlayersChange: (nextSelectedIds: string[]) => void;
  onFilterModeChange: (nextMode: CharacterRankingPlayerFilterMode) => void;
  onRowLimitChange: (nextLimit: CharacterRankingPlayerRowLimit) => void;
  onReset: () => void;
  hasAppliedFilters: boolean;
}

const CharacterBasedFilters = memo(
  ({
    description,
    showFilters,
    onToggle,
    playerOptions,
    selectedPlayerIds,
    filterMode,
    rowLimit,
    onPlayersChange,
    onFilterModeChange,
    onRowLimitChange,
    onReset,
    hasAppliedFilters,
  }: CharacterBasedFiltersProps) => (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-gray-400">{description}</div>
        {playerOptions.length > 0 && (
          <button
            type="button"
            onClick={onToggle}
            className={`inline-flex items-center self-end rounded-lg p-2 transition-colors duration-200 sm:self-auto ${
              showFilters
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white"
            }`}
            title="Toggle Filters"
            aria-label="Toggle character-based filters"
          >
            <Filter size={20} />
          </button>
        )}
      </div>

      {showFilters && playerOptions.length > 0 && (
        <div className="relative z-20 overflow-visible rounded-2xl border border-gray-700 bg-gradient-to-br from-gray-900 via-gray-900 to-black/90 p-4 shadow-lg md:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">
                  <Filter size={14} />
                  <span>Filter</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {hasAppliedFilters && (
                  <button
                    type="button"
                    onClick={onReset}
                    className="rounded-xl border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch">
              <div className="h-full rounded-xl border border-gray-800 bg-gray-900/70 p-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="text-sm font-medium text-gray-300">
                    {`Players (${selectedPlayerIds.length} selected)`}
                  </div>
                  <div className="text-sm font-medium text-gray-300 lg:min-w-[320px]">
                    Mode
                  </div>

                  <PlayerDropdown
                    players={playerOptions}
                    selectedIds={selectedPlayerIds}
                    onChange={onPlayersChange}
                    placeholder="All players"
                    label="Players"
                    multiple
                    hideLabel
                  />

                  <div className="lg:min-w-[320px]">
                    <div className="inline-flex min-h-[4.5rem] w-full items-center rounded-[1.75rem] border border-gray-700 bg-gray-950/80 p-1.5 lg:w-auto">
                      {[
                        {
                          value: "include" as const,
                          label: "Include",
                          icon: <Check size={18} />,
                        },
                        {
                          value: "exclude" as const,
                          label: "Exclude",
                          icon: <X size={18} />,
                        },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onFilterModeChange(option.value)}
                          className={`inline-flex min-h-[3.5rem] flex-1 items-center justify-center gap-2 rounded-2xl px-6 py-3 text-base font-semibold transition-colors lg:flex-none ${
                            filterMode === option.value
                              ? "bg-red-600 text-white shadow-[0_0_18px_rgba(220,38,38,0.28)]"
                              : "text-gray-300 hover:bg-gray-800 hover:text-white"
                          }`}
                        >
                          {option.icon}
                          <span>{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex h-full flex-col justify-between rounded-xl border border-gray-800 bg-gray-900/70 p-4">
                <label className="mb-3 block text-sm font-medium text-gray-300">
                  Rows Per Player
                </label>
                <div className="flex flex-wrap gap-2">
                  {CHARACTER_RANKING_PLAYER_LIMIT_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => onRowLimitChange(option)}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                        rowLimit === option
                          ? "bg-red-600 text-white shadow-[0_0_18px_rgba(220,38,38,0.28)]"
                          : "border border-gray-700 bg-gray-950/80 text-gray-300 hover:bg-gray-800 hover:text-white"
                      }`}
                    >
                      {option === "all" ? "All" : option}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
);

CharacterBasedFilters.displayName = "CharacterBasedFilters";

interface CharacterRankingSearchPanelProps {
  availableCharacters: string[];
  selectedCharacter: string;
  disabled: boolean;
  onCharacterChange: (nextCharacter: string) => void;
  onClear: () => void;
}

const CharacterRankingSearchPanel = memo(
  ({
    availableCharacters,
    selectedCharacter,
    disabled,
    onCharacterChange,
    onClear,
  }: CharacterRankingSearchPanelProps) => {
    const hasSelection = selectedCharacter.length > 0;

    return (
      <div className="rounded-2xl border border-gray-700 bg-gray-800/90 p-5 shadow-lg">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                Character Search
              </div>
              <h3 className="mt-1 text-2xl font-bold text-white">
                {hasSelection
                  ? `Who is the best ${selectedCharacter} player?`
                  : "Who is the best character player?"}
              </h3>
              <p className="mt-2 text-sm text-gray-400">
                Search a Smash character to rank players by character ELO.
                Needs minimum {CHARACTER_RANKING_MIN_MATCHES} matches to show.
              </p>
            </div>

            {hasSelection && (
              <button
                type="button"
                onClick={onClear}
                className="inline-flex items-center gap-2 self-start rounded-xl border border-gray-600 bg-gray-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-600"
              >
                <X size={14} />
                Clear
              </button>
            )}
          </div>

          <CharacterDropdown
            characters={availableCharacters}
            selectedValues={selectedCharacter ? [selectedCharacter] : []}
            onChange={(nextSelectedValues) =>
              onCharacterChange(nextSelectedValues[0] || "")
            }
            disabled={disabled}
            label="Character"
            placeholder={
              disabled
                ? "Character rankings are loading"
                : "Search a Smash character"
            }
          />
        </div>
      </div>
    );
  }
);

CharacterRankingSearchPanel.displayName = "CharacterRankingSearchPanel";

export default function SmashTournamentELO({
  defaultTab = "rankings",
}: SmashTournamentELOProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isCharacterBasedQueryPage =
    defaultTab === "rankings" || defaultTab === "tiers";
  const leaderboardTab =
    defaultTab === "rankings"
      ? parseLeaderboardTab(searchParams.get("leaderboard"))
      : "overall";
  const overallRankingsView =
    defaultTab === "rankings"
      ? parseOverallRankingsView(searchParams.get("overallView"))
      : "best-character";
  const selectedCharacterRankingCharacter =
    defaultTab === "rankings"
      ? (searchParams.get(RANKING_QUERY_CHARACTER_PARAM) || "").trim()
      : "";
  const tierListView =
    defaultTab === "tiers"
      ? parseTierListView(searchParams.get("tierView"))
      : "best-character";
  const characterRankingPlayerFilterMode =
    isCharacterBasedQueryPage
      ? parseCharacterRankingPlayerFilterMode(
          searchParams.get("rankingPlayerMode")
        )
      : "include";
  const rankingPlayerQueryValues =
    isCharacterBasedQueryPage
      ? getUniqueQueryValues(searchParams.getAll(RANKING_QUERY_PLAYER_PARAM))
      : [];
  const characterRankingPlayerRowLimit =
    isCharacterBasedQueryPage
      ? parseCharacterRankingPlayerRowLimit(
          searchParams.get(RANKING_QUERY_PLAYER_LIMIT_PARAM)
        )
      : DEFAULT_CHARACTER_RANKING_PLAYER_ROW_LIMIT;

  // State management
  const [players, setPlayers] = useState<ExtendedPlayer[]>([]);
  const [characterRankings, setCharacterRankings] = useState<CharacterRanking[]>(
    []
  );
  const [matches, setMatches] = useState<Match[]>([]);
  const [activeTab] = useState<
    "tiers" | "rankings" | "matchups" | "matches" | "players"
  >(defaultTab);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingCharacterRankings, setLoadingCharacterRankings] =
    useState<boolean>(false);
  const [hasFetchedCharacterRankings, setHasFetchedCharacterRankings] =
    useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [refreshingCharacterRankings, setRefreshingCharacterRankings] =
    useState<boolean>(false);
  const [hardRefreshing, setHardRefreshing] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(30);

  // Cache management
  const [playersCache, setPlayersCache] = useState<{
    data: ExtendedPlayer[];
    timestamp: number;
  } | null>(null);
  const CACHE_DURATION = 30000; // 30 seconds
  const [matchesPage, setMatchesPage] = useState<number>(1);
  const [loadingMoreMatches, setLoadingMoreMatches] = useState<boolean>(false);
  const [hasMoreMatches, setHasMoreMatches] = useState<boolean>(true);
  const [loadingMatchesAbove, setLoadingMatchesAbove] =
    useState<boolean>(false);
  const [loadingMatchesBelow, setLoadingMatchesBelow] =
    useState<boolean>(false);
  const [hasMoreMatchesAbove, setHasMoreMatchesAbove] =
    useState<boolean>(false);
  const [hasMoreMatchesBelow, setHasMoreMatchesBelow] =
    useState<boolean>(false);
  const [selectedPlayerFilter, setSelectedPlayerFilter] = useState<string[]>(
    []
  );
  const [selectedCharacterFilter, setSelectedCharacterFilter] = useState<
    string[]
  >([]);
  const [only1v1, setOnly1v1] = useState<boolean>(false);
  const [matchIdSearchInput, setMatchIdSearchInput] = useState<string>("");
  const [matchContextId, setMatchContextId] = useState<number | null>(null);
  const [matchSearchError, setMatchSearchError] = useState<string | null>(null);
  const [autoRefreshDisabled, setAutoRefreshDisabled] =
    useState<boolean>(false);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [showCharacterBasedFilters, setShowCharacterBasedFilters] =
    useState<boolean>(false);
  const [visibleCharacterRankingsCount, setVisibleCharacterRankingsCount] =
    useState<number>(CHARACTER_RANKINGS_BATCH_SIZE);
  const [showUtcTime, setShowUtcTime] = useState<boolean>(false);
  const [refreshingMatches, setRefreshingMatches] = useState<Set<number>>(
    new Set()
  );
  const [banningPlayerIds, setBanningPlayerIds] = useState<Set<number>>(
    new Set()
  );
  const characterRankingsSentinelRef = useRef<HTMLDivElement | null>(null);
  const hasAutoScrolledCharacterRankingsRef = useRef(false);
  const eligibleCharacterRankingPlayerIds = new Set(
    characterRankings
      .filter(
        (characterRanking) =>
          characterRanking.matches >= CHARACTER_RANKING_MIN_MATCHES
      )
      .map((characterRanking) => String(characterRanking.player_id))
  );
  const defaultCharacterBasedPlayerIds = [...players]
    .filter((player) => !player.inactive && player.is_ranked)
    .filter(
      (player) =>
        eligibleCharacterRankingPlayerIds.size === 0 ||
        eligibleCharacterRankingPlayerIds.has(String(player.id))
    )
    .sort((a, b) => b.elo - a.elo)
    .map((player) => String(player.id));
  const resolvedCharacterRankingPlayerIds = isCharacterBasedQueryPage
    ? resolvePlayerQueryValuesToIds(rankingPlayerQueryValues, players)
    : [];
  const selectedCharacterRankingPlayerIds =
    rankingPlayerQueryValues.length > 0
      ? resolvedCharacterRankingPlayerIds
      : defaultCharacterBasedPlayerIds;
  const selectedCharacterRankingPlayerIdsKey = getPlayerIdSelectionKey(
    selectedCharacterRankingPlayerIds
  );
  const defaultCharacterBasedPlayerIdsKey = getPlayerIdSelectionKey(
    defaultCharacterBasedPlayerIds
  );

  // Helper function to validate country code
  const isValidCountryCode = (countryCode: string | null): boolean => {
    if (!countryCode) return false;
    return /^[A-Z]{2}$/.test(countryCode.toUpperCase());
  };

  // Initialize filters from URL params on matches page
  useEffect(() => {
    if (defaultTab === "matches") {
      const playerQueryValues = getUniqueQueryValues(
        searchParams.getAll("player")
      );
      const characters = searchParams.getAll("character");
      const only1v1Param = searchParams.get("only1v1") === "true";
      const matchIdParam = searchParams.get("matchId") || "";
      const hasFilters =
        playerQueryValues.length > 0 || characters.length > 0 || only1v1Param;

      setSelectedPlayerFilter(
        resolvePlayerQueryValuesToIds(playerQueryValues, players)
      );
      setSelectedCharacterFilter(characters);
      setOnly1v1(only1v1Param);
      setMatchIdSearchInput(matchIdParam.replace(/\D/g, ""));
      setShowFilters(hasFilters);
    }
  }, [defaultTab, players, searchParams]);

  // Refs to store current filter values for use in intervals
  const currentPlayerFilter = useRef<string[]>([]);
  const currentCharacterFilter = useRef<string[]>([]);
  const current1v1Filter = useRef<boolean>(false);
  const currentActiveTab = useRef<string>("rankings");
  const currentAutoRefreshDisabled = useRef<boolean>(false);
  const currentLeaderboardTab = useRef<string>("overall");
  const currentOverallRankingsView =
    useRef<OverallRankingsView>("best-character");

  // Update refs when state changes
  useEffect(() => {
    currentPlayerFilter.current = selectedPlayerFilter;
  }, [selectedPlayerFilter]);

  useEffect(() => {
    currentCharacterFilter.current = selectedCharacterFilter;
  }, [selectedCharacterFilter]);

  useEffect(() => {
    current1v1Filter.current = only1v1;
  }, [only1v1]);

  useEffect(() => {
    currentActiveTab.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    currentAutoRefreshDisabled.current = autoRefreshDisabled;
  }, [autoRefreshDisabled]);

  useEffect(() => {
    currentLeaderboardTab.current = leaderboardTab;
  }, [leaderboardTab]);

  useEffect(() => {
    currentOverallRankingsView.current = overallRankingsView;
  }, [overallRankingsView]);

  useEffect(() => {
    if (defaultTab !== "rankings") {
      return;
    }

    setVisibleCharacterRankingsCount(CHARACTER_RANKINGS_BATCH_SIZE);
  }, [
    defaultTab,
    leaderboardTab,
    overallRankingsView,
    selectedCharacterRankingCharacter,
    characterRankingPlayerFilterMode,
    selectedCharacterRankingPlayerIdsKey,
    characterRankingPlayerRowLimit,
  ]);

  useEffect(() => {
    const shouldAutoScroll =
      defaultTab === "rankings" &&
      ((leaderboardTab === "character" &&
        selectedCharacterRankingCharacter.length > 0) ||
        (leaderboardTab === "overall" &&
          overallRankingsView === "best-character" &&
          rankingPlayerQueryValues.length > 0)) &&
      !loading &&
      !loadingCharacterRankings &&
      hasFetchedCharacterRankings;

    if (!shouldAutoScroll) {
      hasAutoScrolledCharacterRankingsRef.current = false;
      return;
    }

    if (hasAutoScrolledCharacterRankingsRef.current) {
      return;
    }

    hasAutoScrolledCharacterRankingsRef.current = true;

    const timeoutId = window.setTimeout(() => {
      window.scrollTo({
        top: Math.round(window.innerHeight * 0.3),
        behavior: "smooth",
      });
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [
    defaultTab,
    leaderboardTab,
    overallRankingsView,
    selectedCharacterRankingCharacter,
    rankingPlayerQueryValues.length,
    loading,
    loadingCharacterRankings,
    hasFetchedCharacterRankings,
  ]);

  // Function to handle tab navigation
  const handleTabClick = (tabId: string) => {
    switch (tabId) {
      case "rankings":
        router.push("/");
        break;
      case "tiers":
        router.push("/tierlist");
        break;
      case "matchups":
        router.push("/matchups");
        break;
      case "matches":
        router.push("/matches");
        break;
      case "players":
        router.push("/players");
        break;
      case "analytics":
        router.push("/analytics");
        break;
    }
  };

  // Function to handle player click and scroll
  const handlePlayerClick = (playerId: number) => {
    router.push(`/players#player-${playerId}`);
  };

  const handleViewTopCharacters = (playerId: number) => {
    const params = new URLSearchParams();
    params.set("overallView", "best-character");
    params.set(RANKING_QUERY_PLAYER_LIMIT_PARAM, "all");
    params.append(
      RANKING_QUERY_PLAYER_PARAM,
      serializePlayerIdToQueryValue(playerId, players)
    );
    router.push(`/?${params.toString()}`);
  };

  const handleCharacterRankingBadgeClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    characterName: string
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const params = new URLSearchParams();
    params.set("leaderboard", "character");
    params.set(RANKING_QUERY_CHARACTER_PARAM, characterName);
    router.push(`/?${params.toString()}`);
  };

  const rankingQueryState: RankingQueryState = {
    leaderboardTab,
    overallRankingsView,
    selectedCharacterRankingCharacter,
    characterRankingPlayerFilterMode,
    selectedCharacterRankingPlayerIds,
    characterRankingPlayerRowLimit,
  };

  const shouldPersistCharacterBasedFilters = (
    currentLeaderboard: LeaderboardTab,
    currentOverallView: OverallRankingsView
  ) =>
    currentLeaderboard === "character" ||
    (currentLeaderboard === "overall" && currentOverallView === "best-character");

  const appendCharacterBasedFilterParams = (
    params: URLSearchParams,
    state: CharacterBasedFilterQueryState
  ) => {
    if (state.characterRankingPlayerFilterMode !== "include") {
      params.set(
        "rankingPlayerMode",
        state.characterRankingPlayerFilterMode
      );
    }

    if (
      getPlayerIdSelectionKey(state.selectedCharacterRankingPlayerIds) !==
      defaultCharacterBasedPlayerIdsKey
    ) {
      serializePlayerIdsToQueryValues(
        state.selectedCharacterRankingPlayerIds,
        players
      ).forEach((playerQueryValue) => {
        params.append(RANKING_QUERY_PLAYER_PARAM, playerQueryValue);
      });
    }

    if (
      state.characterRankingPlayerRowLimit !==
      DEFAULT_CHARACTER_RANKING_PLAYER_ROW_LIMIT
    ) {
      params.set(
        RANKING_QUERY_PLAYER_LIMIT_PARAM,
        String(state.characterRankingPlayerRowLimit)
      );
    }
  };

  const updateRankingsURL = (nextState: Partial<RankingQueryState>) => {
    if (defaultTab !== "rankings") {
      return;
    }

    const mergedState: RankingQueryState = {
      ...rankingQueryState,
      ...nextState,
      selectedCharacterRankingCharacter:
        nextState.selectedCharacterRankingCharacter !== undefined
          ? nextState.selectedCharacterRankingCharacter.trim()
          : rankingQueryState.selectedCharacterRankingCharacter,
      selectedCharacterRankingPlayerIds: nextState.selectedCharacterRankingPlayerIds
        ? getUniqueQueryValues(nextState.selectedCharacterRankingPlayerIds)
        : rankingQueryState.selectedCharacterRankingPlayerIds,
    };
    const params = new URLSearchParams(searchParams.toString());

    params.delete("leaderboard");
    params.delete("overallView");
    params.delete(RANKING_QUERY_CHARACTER_PARAM);
    params.delete("rankingPlayerMode");
    params.delete(RANKING_QUERY_PLAYER_PARAM);
    params.delete(RANKING_QUERY_PLAYER_LIMIT_PARAM);

    if (mergedState.leaderboardTab !== "overall") {
      params.set("leaderboard", mergedState.leaderboardTab);
    }

    if (
      mergedState.leaderboardTab === "overall" &&
      mergedState.overallRankingsView !== "best-character"
    ) {
      params.set("overallView", mergedState.overallRankingsView);
    }

    if (
      mergedState.leaderboardTab === "character" &&
      mergedState.selectedCharacterRankingCharacter
    ) {
      params.set(
        RANKING_QUERY_CHARACTER_PARAM,
        mergedState.selectedCharacterRankingCharacter
      );
    }

    if (
      shouldPersistCharacterBasedFilters(
        mergedState.leaderboardTab,
        mergedState.overallRankingsView
      )
    ) {
      appendCharacterBasedFilterParams(params, {
        characterRankingPlayerFilterMode:
          mergedState.characterRankingPlayerFilterMode,
        selectedCharacterRankingPlayerIds:
          mergedState.selectedCharacterRankingPlayerIds,
        characterRankingPlayerRowLimit:
          mergedState.characterRankingPlayerRowLimit,
      });
    }

    const queryString = params.toString();
    router.replace(queryString ? `/?${queryString}` : "/");
  };

  const updateTierListURL = (
    nextView: TierListView,
    nextFilterState?: Partial<CharacterBasedFilterQueryState>
  ) => {
    if (defaultTab !== "tiers") {
      return;
    }

    const mergedFilterState: CharacterBasedFilterQueryState = {
      characterRankingPlayerFilterMode:
        nextFilterState?.characterRankingPlayerFilterMode ??
        characterRankingPlayerFilterMode,
      selectedCharacterRankingPlayerIds:
        nextFilterState?.selectedCharacterRankingPlayerIds
          ? getUniqueQueryValues(nextFilterState.selectedCharacterRankingPlayerIds)
          : selectedCharacterRankingPlayerIds,
      characterRankingPlayerRowLimit:
        nextFilterState?.characterRankingPlayerRowLimit ??
        characterRankingPlayerRowLimit,
    };
    const params = new URLSearchParams(searchParams.toString());
    params.delete("rankingPlayerMode");
    params.delete(RANKING_QUERY_PLAYER_PARAM);
    params.delete(RANKING_QUERY_PLAYER_LIMIT_PARAM);

    if (nextView === "best-character") {
      params.delete("tierView");
      appendCharacterBasedFilterParams(params, mergedFilterState);
    } else {
      params.set("tierView", nextView);
    }

    const queryString = params.toString();
    router.replace(queryString ? `/tierlist?${queryString}` : "/tierlist");
  };

  const updateCharacterBasedFilters = (
    nextState: Partial<CharacterBasedFilterQueryState>
  ) => {
    if (defaultTab === "rankings") {
      updateRankingsURL(nextState);
      return;
    }

    if (defaultTab === "tiers") {
      updateTierListURL(tierListView, nextState);
    }
  };

  const handleCharacterRankingPlayerFilterChange = (selected: string[]) => {
    updateCharacterBasedFilters({
      selectedCharacterRankingPlayerIds: selected,
    });
  };

  const handleCharacterRankingCharacterChange = (nextCharacter: string) => {
    updateRankingsURL({
      leaderboardTab: "character",
      selectedCharacterRankingCharacter: nextCharacter,
    });
  };

  const clearCharacterRankingCharacter = () => {
    updateRankingsURL({
      leaderboardTab: "character",
      selectedCharacterRankingCharacter: "",
    });
  };

  const clearCharacterRankingPlayerFilters = () => {
    updateCharacterBasedFilters({
      characterRankingPlayerFilterMode: "include",
      selectedCharacterRankingPlayerIds: defaultCharacterBasedPlayerIds,
      characterRankingPlayerRowLimit:
        DEFAULT_CHARACTER_RANKING_PLAYER_ROW_LIMIT,
    });
  };

  const shouldLoadCharacterRankings = (
    tab: "tiers" | "rankings" | "matchups" | "matches" | "players",
    currentLeaderboard: LeaderboardTab,
    currentOverallView: OverallRankingsView
  ) =>
    tab === "tiers" ||
    (tab === "rankings" &&
      (currentLeaderboard === "character" ||
        (currentLeaderboard === "overall" &&
          currentOverallView === "best-character")));

  const isRefreshing =
    refreshing || refreshingCharacterRankings || hardRefreshing;

  const clearPlayersCache = () => {
    setPlayersCache(null);
    try {
      localStorage.removeItem("playersCache");
    } catch {
      // Ignore localStorage failures and continue with in-memory state.
    }
  };

  const revalidateCache = async (tags: CacheTag[]) => {
    const response = await fetch("/api/revalidate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tags }),
      cache: "no-store",
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(data?.error || "Failed to revalidate cached data");
    }
  };

  const handleHardRefresh = async () => {
    if (hardRefreshing) {
      return;
    }

    clearPlayersCache();
    setError(null);
    setCountdown(30);
    setHardRefreshing(true);

    try {
      await revalidateCache(["players"]);
      await fetchPlayers(true, true);

      if (
        shouldLoadCharacterRankings(
          defaultTab,
          leaderboardTab,
          overallRankingsView
        )
      ) {
        await fetchCharacterRankings(true, true);
      }

      if (defaultTab !== "matches") {
        return;
      }

      const players = searchParams.getAll("player");
      const characters = searchParams.getAll("character");
      const only1v1Param = searchParams.get("only1v1") === "true";
      const matchIdParam = (searchParams.get("matchId") || "").replace(
        /\D/g,
        ""
      );

      if (matchIdParam) {
        await fetchMatchContext(
          matchIdParam,
          players,
          characters,
          only1v1Param,
          {
            isBackgroundRefresh: true,
            bypassBrowserCache: true,
          }
        );
      } else {
        await fetchMatches(
          1,
          false,
          players,
          characters,
          only1v1Param,
          true,
          true
        );
        setMatchesPage(1);
      }
    } catch (err) {
      console.error("Error hard refreshing data:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to hard refresh data. Please try again."
      );
    } finally {
      setHardRefreshing(false);
    }
  };

  // Function to add highlight effect to player profile after scrolling
  const highlightPlayerProfile = (playerId: number) => {
    const element = document.getElementById(`player-${playerId}`);
    if (element) {
      // Add highlight class
      element.classList.add("player-highlight");

      // Remove highlight after 3 seconds
      setTimeout(() => {
        element.classList.remove("player-highlight");
      }, 3000);
    }
  };

  // Load Google Font
  useEffect(() => {
    const link = document.createElement("link");
    link.href =
      "https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;600;700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);

    return () => {
      document.head.removeChild(link);
    };
  }, []);

  // Calculate ELO range percentile-based tier thresholds
  const calculateTierThresholds = (rankings: Array<{ elo: number }>) => {
    if (rankings.length === 0) {
      return { S: 2000, A: 1800, B: 1600, C: 1400, D: 1200, E: 1000, F: 800 };
    }

    // Get min and max ELO for range calculation
    const eloScores = rankings.map((ranking) => ranking.elo);
    const minElo = Math.min(...eloScores);
    const maxElo = Math.max(...eloScores);
    const eloRange = maxElo - minElo;

    // Calculate percentiles of the ELO range
    const getEloRangePercentile = (percentile: number): number => {
      return minElo + (eloRange * percentile) / 100;
    };

    return {
      S: getEloRangePercentile(90), // 90th percentile of ELO range
      A: getEloRangePercentile(75), // 75th percentile of ELO range
      B: getEloRangePercentile(50), // 50th percentile of ELO range
      C: getEloRangePercentile(25), // 25th percentile of ELO range
      D: getEloRangePercentile(10), // 10th percentile of ELO range
      E: getEloRangePercentile(5), // 5th percentile of ELO range
      F: minElo, // Minimum ELO
    };
  };

  // Update URL with filter parameters for matches
  const updateMatchesURL = (
    playerFilter: string[],
    characterFilter: string[],
    only1v1Filter: boolean,
    matchIdFilter: string = ""
  ) => {
    if (defaultTab === "matches") {
      const params = new URLSearchParams();
      const showMatchIdSearchParam =
        searchParams.get("showMatchIdSearch") === "true";

      serializePlayerIdsToQueryValues(playerFilter, players).forEach(
        (playerQueryValue) => params.append("player", playerQueryValue)
      );
      characterFilter.forEach((character) =>
        params.append("character", character)
      );
      if (only1v1Filter) params.append("only1v1", "true");
      if (matchIdFilter.trim()) params.append("matchId", matchIdFilter.trim());
      if (showMatchIdSearchParam) params.append("showMatchIdSearch", "true");

      const queryString = params.toString();
      const newUrl = queryString ? `/matches?${queryString}` : "/matches";

      // Use replace to avoid adding to history stack
      router.replace(newUrl);
    }
  };

  // Fetch players from database with caching
  useEffect(() => {
    // Check if we need fresh data
    const checkFreshData = () => {
      // Check memory cache first
      if (
        playersCache &&
        Date.now() - playersCache.timestamp <= CACHE_DURATION
      ) {
        return false;
      }

      // Check localStorage cache
      try {
        const cached = localStorage.getItem("playersCache");
        if (cached) {
          const parsedCache = JSON.parse(cached);
          if (Date.now() - parsedCache.timestamp <= CACHE_DURATION) {
            // Update memory cache from localStorage
            setPlayersCache(parsedCache);
            return false;
          }
        }
      } catch {
        // If localStorage fails, continue with fresh fetch
      }

      return true;
    };

    // Only fetch if we don't have cached data or it's stale
    if (checkFreshData()) {
      fetchPlayers();
    } else {
      // Use cached data (from memory or localStorage)
      const cacheToUse =
        playersCache ||
        JSON.parse(localStorage.getItem("playersCache") || "{}");
      if (cacheToUse.data) {
        setPlayers(cacheToUse.data);
        setLoading(false);
        setLastUpdated(new Date(cacheToUse.timestamp));
        if (!playersCache) {
          setPlayersCache(cacheToUse);
        }

        // Check for hash scroll when using cached data
        const hash = window.location.hash;
        if (hash.startsWith("#player-")) {
          const playerId = parseInt(hash.replace("#player-", ""));
          setTimeout(() => {
            const element = document.getElementById(`player-${playerId}`);
            if (element) {
              element.scrollIntoView({ behavior: "smooth", block: "center" });
              // Highlight the profile after scrolling
              setTimeout(() => highlightPlayerProfile(playerId), 500);
            }
          }, 200); // Increased timeout for cached data
        }
      } else {
        // Fallback to fetch if cache is corrupted
        fetchPlayers();
      }
    }

    // Only fetch matches for matches tab
    if (defaultTab === "matches") {
      const players = searchParams.getAll("player");
      const characters = searchParams.getAll("character");
      const only1v1Param = searchParams.get("only1v1") === "true";
      const matchIdParam = (searchParams.get("matchId") || "").replace(
        /\D/g,
        ""
      );

      setAutoRefreshDisabled(Boolean(matchIdParam));

      if (matchIdParam) {
        fetchMatchContext(matchIdParam, players, characters, only1v1Param);
      } else {
        fetchMatches(1, false, players, characters, only1v1Param);
      }
    }

    // Set up automatic refresh every 30 seconds - but only run for current active tab
    const refreshInterval = setInterval(() => {
      // Only refresh if this component is for the current active tab
      if (currentActiveTab.current === defaultTab) {
        // For matches tab, only refresh if auto-refresh is not disabled
        if (defaultTab === "matches" && currentAutoRefreshDisabled.current) {
          // Skip all refresh activity when auto-refresh is disabled for matches
          return;
        }

        fetchPlayers(true);
        if (
          shouldLoadCharacterRankings(
            defaultTab,
            currentLeaderboardTab.current as LeaderboardTab,
            currentOverallRankingsView.current
          )
        ) {
          fetchCharacterRankings(true);
        }
        if (defaultTab === "matches") {
          fetchMatches(
            1,
            false,
            currentPlayerFilter.current,
            currentCharacterFilter.current,
            current1v1Filter.current,
            true
          );
          setMatchesPage(1);
        }
      }

      // Only update countdown if not in disabled state for matches tab
      if (!(defaultTab === "matches" && currentAutoRefreshDisabled.current)) {
        setCountdown(30);
      }
    }, 30000);

    // Set up countdown timer every second
    const countdownInterval = setInterval(() => {
      // Don't update countdown if auto-refresh is disabled for matches tab
      if (defaultTab === "matches" && currentAutoRefreshDisabled.current) {
        return;
      }

      setCountdown((prev) => {
        if (prev <= 1) {
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    // Cleanup intervals on component unmount
    return () => {
      clearInterval(refreshInterval);
      clearInterval(countdownInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTab, searchParams]);

  const fetchPlayers = async (
    isBackgroundRefresh = false,
    bypassBrowserCache = false
  ) => {
    if (!isBackgroundRefresh) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const response = await fetch("/api/players", {
        cache: bypassBrowserCache ? "no-store" : "default",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch players");
      }
      const data: Array<{
        id: number;
        name: string;
        display_name: string | null;
        elo: number;
        inactive: boolean;
        is_ranked: boolean;
        top_ten_played: number;
        created_at: string;
        country?: string | null;
        picture?: string | null;
        main_character?: string;
        total_wins?: number;
        total_losses?: number;
        total_kos?: number;
        total_falls?: number;
        total_sds?: number;
        current_win_streak?: number;
      }> = await response.json();

      // Process players with real stats from database
      const playersWithMatches = data.map((player) => ({
        ...player,
        matches: (player.total_wins || 0) + (player.total_losses || 0),
      }));

      setPlayers(playersWithMatches);
      const now = new Date();
      setLastUpdated(now);

      // Update cache
      const cacheData = {
        data: playersWithMatches,
        timestamp: now.getTime(),
      };
      setPlayersCache(cacheData);

      // Also cache in localStorage
      try {
        localStorage.setItem("playersCache", JSON.stringify(cacheData));
      } catch {
        // If localStorage fails, continue without caching
      }

      // Check for hash after players are loaded
      const hash = window.location.hash;
      if (hash.startsWith("#player-")) {
        const playerId = parseInt(hash.replace("#player-", ""));
        setTimeout(() => {
          const element = document.getElementById(`player-${playerId}`);
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            // Highlight the profile after scrolling
            setTimeout(() => highlightPlayerProfile(playerId), 500);
          }
        }, 200);
      }
    } catch (err) {
      console.error("Error fetching players:", err);
      setError("Failed to load players. Please try again later.");
    } finally {
      if (!isBackgroundRefresh) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  };

  const fetchCharacterRankings = async (
    isBackgroundRefresh = false,
    bypassBrowserCache = false
  ) => {
    if (!isBackgroundRefresh) {
      setLoadingCharacterRankings(true);
    } else {
      setRefreshingCharacterRankings(true);
    }
    setError(null);

    try {
      const characterRankingsUrl =
        defaultTab === "tiers"
          ? "/api/character-rankings?includeInactive=true"
          : "/api/character-rankings";
      const response = await fetch(characterRankingsUrl, {
        cache: bypassBrowserCache ? "no-store" : "default",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch character rankings");
      }

      const data: CharacterRanking[] = await response.json();

      setCharacterRankings(data);
      setHasFetchedCharacterRankings(true);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Error fetching character rankings:", err);
      setError("Failed to load character rankings. Please try again later.");
    } finally {
      setHasFetchedCharacterRankings(true);
      if (!isBackgroundRefresh) {
        setLoadingCharacterRankings(false);
      } else {
        setRefreshingCharacterRankings(false);
      }
    }
  };

  useEffect(() => {
    if (
      shouldLoadCharacterRankings(
        defaultTab,
        leaderboardTab,
        overallRankingsView
      ) &&
      !hasFetchedCharacterRankings
    ) {
      fetchCharacterRankings();
    }
    // `fetchCharacterRankings` is intentionally omitted because this effect is
    // keyed off route/view state, and the function itself is recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    defaultTab,
    leaderboardTab,
    overallRankingsView,
    hasFetchedCharacterRankings,
  ]);

  const handleBanPlayer = async (player: ExtendedPlayer) => {
    const playerLabel = getPlayerQueryLabel(player);
    const confirmed = window.confirm(
      `Ban ${playerLabel}? This hides the player and any match history involving them.`
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setBanningPlayerIds((prev) => new Set(prev).add(player.id));

    try {
      const response = await fetch(`/api/players/${player.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ banned: true }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error || "Failed to ban player");
      }

      clearPlayersCache();
      await fetchPlayers(true);
    } catch (err) {
      console.error("Error banning player:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to ban player. Please try again later."
      );
    } finally {
      setBanningPlayerIds((prev) => {
        const next = new Set(prev);
        next.delete(player.id);
        return next;
      });
    }
  };

  const renderBanButton = (player: ExtendedPlayer) => {
    const isBanning = banningPlayerIds.has(player.id);

    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          void handleBanPlayer(player);
        }}
        disabled={isBanning}
        className={`inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors md:text-sm ${
          isBanning
            ? "cursor-not-allowed bg-gray-700 text-gray-300"
            : "bg-red-600 text-white hover:bg-red-700"
        }`}
      >
        <X size={14} />
        <span>{isBanning ? "Banning..." : "Ban"}</span>
      </button>
    );
  };

  const appendMatchFilterParams = (
    params: URLSearchParams,
    playerFilter: string[] = [],
    characterFilter: string[] = [],
    only1v1Filter: boolean = false
  ) => {
    playerFilter.forEach((player) => params.append("player", player));
    characterFilter.forEach((character) =>
      params.append("character", character)
    );

    if (only1v1Filter) {
      params.append("only1v1", "true");
    }
  };

  const mergeMatchesByDirection = (
    existingMatches: Match[],
    newMatches: Match[],
    direction: "above" | "below"
  ) => {
    const existingIds = new Set(existingMatches.map((match) => match.id));
    const uniqueMatches = newMatches.filter(
      (match) => !existingIds.has(match.id)
    );

    return direction === "above"
      ? [...uniqueMatches, ...existingMatches]
      : [...existingMatches, ...uniqueMatches];
  };
  const fetchMatches = async (
    page: number = 1,
    append: boolean = false,
    playerFilter?: string[],
    characterFilter?: string[],
    only1v1Filter?: boolean,
    isBackgroundRefresh: boolean = false,
    bypassBrowserCache: boolean = false
  ) => {
    // Only set loading state for initial page load (not for appending or background refresh)
    if (!append && !isBackgroundRefresh) {
      setLoading(true);
    }

    try {
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("limit", MATCHES_PAGE_SIZE.toString());
      appendMatchFilterParams(
        params,
        playerFilter || [],
        characterFilter || [],
        only1v1Filter || false
      );

      const url = `/api/matches?${params.toString()}`;
      const response = await fetch(url, {
        cache: bypassBrowserCache ? "no-store" : "default",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch matches");
      }
      const data = (await response.json()) as MatchesApiResponse | Match[];

      // Handle both old format (direct array) and new format (object with matches and pagination)
      let matches: Match[];
      let hasMore = false;

      if (Array.isArray(data)) {
        // Old format compatibility
        matches = data;
        hasMore = data.length === MATCHES_PAGE_SIZE;
      } else {
        // New format
        matches = data.matches || [];
        hasMore = data.pagination?.hasMore || false;
      }

      if (append) {
        setMatches((prev) => [...prev, ...matches]);
      } else {
        setMatches(matches);
        setMatchContextId(null);
        setMatchSearchError(null);
        setHasMoreMatchesAbove(false);
        setHasMoreMatchesBelow(false);
      }

      setHasMoreMatches(hasMore);
    } catch (err) {
      console.error("Error fetching matches:", err);
      // Don't set error state for matches as it's secondary to players
    } finally {
      // Clear loading state after initial load
      if (!append && !isBackgroundRefresh) {
        setLoading(false);
      }
    }
  };

  const fetchMatchContext = async (
    matchId: string,
    playerFilter: string[] = [],
    characterFilter: string[] = [],
    only1v1Filter: boolean = false,
    options: {
      isBackgroundRefresh?: boolean;
      bypassBrowserCache?: boolean;
    } = {}
  ) => {
    const {
      isBackgroundRefresh = false,
      bypassBrowserCache = false,
    } = options;
    const trimmedMatchId = matchId.trim();

    if (!/^\d+$/.test(trimmedMatchId)) {
      setMatchSearchError("Enter a valid numeric match ID.");
      return;
    }

    if (!isBackgroundRefresh) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setMatchSearchError(null);
    setAutoRefreshDisabled(true);

    try {
      const params = new URLSearchParams();
      params.append("matchId", trimmedMatchId);
      params.append("contextLimit", MATCH_CONTEXT_PAGE_SIZE.toString());
      appendMatchFilterParams(
        params,
        playerFilter,
        characterFilter,
        only1v1Filter
      );

      const response = await fetch(`/api/matches?${params.toString()}`, {
        cache: bypassBrowserCache ? "no-store" : "default",
      });
      const data = (await response.json()) as MatchesApiResponse;

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch match context");
      }

      setMatches(data.matches || []);
      setMatchContextId(Number(trimmedMatchId));
      setHasMoreMatches(false);
      setHasMoreMatchesAbove(Boolean(data.pagination?.hasMoreAbove));
      setHasMoreMatchesBelow(Boolean(data.pagination?.hasMoreBelow));
    } catch (err) {
      console.error("Error fetching match context:", err);
      setMatches([]);
      setMatchContextId(null);
      setHasMoreMatches(false);
      setHasMoreMatchesAbove(false);
      setHasMoreMatchesBelow(false);
      setMatchSearchError(
        err instanceof Error
          ? err.message
          : "Failed to fetch match context. Please try again."
      );
    } finally {
      if (!isBackgroundRefresh) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  };

  const loadMoreMatches = async () => {
    if (loadingMoreMatches || !hasMoreMatches) return;

    setAutoRefreshDisabled(true);
    setLoadingMoreMatches(true);
    const nextPage = matchesPage + 1;
    await fetchMatches(
      nextPage,
      true,
      selectedPlayerFilter,
      selectedCharacterFilter,
      only1v1
    );
    setMatchesPage(nextPage);
    setLoadingMoreMatches(false);
  };

  const loadMoreMatchContext = async (direction: "above" | "below") => {
    if (!matchContextId || matches.length === 0) {
      return;
    }

    const isLoadingDirection =
      direction === "above" ? loadingMatchesAbove : loadingMatchesBelow;
    const hasMoreDirection =
      direction === "above" ? hasMoreMatchesAbove : hasMoreMatchesBelow;

    if (isLoadingDirection || !hasMoreDirection) {
      return;
    }

    const cursorMatchId =
      direction === "above" ? matches[0]?.id : matches[matches.length - 1]?.id;

    if (!cursorMatchId) {
      return;
    }

    setMatchSearchError(null);
    setAutoRefreshDisabled(true);

    if (direction === "above") {
      setLoadingMatchesAbove(true);
    } else {
      setLoadingMatchesBelow(true);
    }

    try {
      const params = new URLSearchParams();
      params.append("matchId", matchContextId.toString());
      params.append("direction", direction);
      params.append("cursorMatchId", cursorMatchId.toString());
      params.append("contextLimit", MATCH_CONTEXT_PAGE_SIZE.toString());
      appendMatchFilterParams(
        params,
        selectedPlayerFilter,
        selectedCharacterFilter,
        only1v1
      );

      const response = await fetch(`/api/matches?${params.toString()}`);
      const data = (await response.json()) as MatchesApiResponse;

      if (!response.ok) {
        throw new Error(data.error || "Failed to load more match context");
      }

      setMatches((prev) =>
        mergeMatchesByDirection(prev, data.matches || [], direction)
      );

      if (direction === "above") {
        setHasMoreMatchesAbove(Boolean(data.pagination?.hasMoreAbove));
      } else {
        setHasMoreMatchesBelow(Boolean(data.pagination?.hasMoreBelow));
      }
    } catch (err) {
      console.error("Error loading more match context:", err);
      setMatchSearchError(
        err instanceof Error
          ? err.message
          : "Failed to load more matches in this direction."
      );
    } finally {
      if (direction === "above") {
        setLoadingMatchesAbove(false);
      } else {
        setLoadingMatchesBelow(false);
      }
    }
  };

  // Function to refresh a single match
  const refreshSingleMatch = async (matchId: number) => {
    try {
      // Add match ID to refreshing set
      setRefreshingMatches((prev) => new Set(prev).add(matchId));

      const response = await fetch(`/api/matches/${matchId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch match");
      }

      const updatedMatch = await response.json();

      // Update only this match in the matches array
      setMatches((prev) =>
        prev.map((match) => (match.id === matchId ? updatedMatch : match))
      );
    } catch (error) {
      console.error("Error refreshing match:", error);
    } finally {
      // Remove match ID from refreshing set
      setRefreshingMatches((prev) => {
        const newSet = new Set(prev);
        newSet.delete(matchId);
        return newSet;
      });
    }
  };

  const handleMatchIdSearch = async () => {
    const trimmedMatchId = matchIdSearchInput.trim();

    if (!trimmedMatchId) {
      setMatchSearchError("Enter a match ID to search.");
      return;
    }

    if (!/^\d+$/.test(trimmedMatchId)) {
      setMatchSearchError("Enter a valid numeric match ID.");
      return;
    }

    setMatchesPage(1);
    updateMatchesURL(
      selectedPlayerFilter,
      selectedCharacterFilter,
      only1v1,
      trimmedMatchId
    );
    await fetchMatchContext(
      trimmedMatchId,
      selectedPlayerFilter,
      selectedCharacterFilter,
      only1v1
    );
  };

  const clearMatchIdSearch = async () => {
    setMatchIdSearchInput("");
    setMatchSearchError(null);
    setMatchContextId(null);
    setHasMoreMatchesAbove(false);
    setHasMoreMatchesBelow(false);
    setMatchesPage(1);
    setAutoRefreshDisabled(false);

    updateMatchesURL(selectedPlayerFilter, selectedCharacterFilter, only1v1);
    await fetchMatches(
      1,
      false,
      selectedPlayerFilter,
      selectedCharacterFilter,
      only1v1
    );
  };

  // Search function to manually trigger filtering
  const handleSearch = async () => {
    console.log("handleSearch called with filters:", {
      player: selectedPlayerFilter,
      character: selectedCharacterFilter,
      only1v1: only1v1,
      matchId: matchIdSearchInput,
    });
    setMatchesPage(1);

    const trimmedMatchId = matchIdSearchInput.trim();

    if (trimmedMatchId) {
      if (!/^\d+$/.test(trimmedMatchId)) {
        setMatchSearchError("Enter a valid numeric match ID.");
        return;
      }

      updateMatchesURL(
        selectedPlayerFilter,
        selectedCharacterFilter,
        only1v1,
        trimmedMatchId
      );
      await fetchMatchContext(
        trimmedMatchId,
        selectedPlayerFilter,
        selectedCharacterFilter,
        only1v1
      );
      return;
    }

    setAutoRefreshDisabled(false);

    updateMatchesURL(selectedPlayerFilter, selectedCharacterFilter, only1v1);
    await fetchMatches(
      1,
      false,
      selectedPlayerFilter,
      selectedCharacterFilter,
      only1v1
    );
  };

  // Determine tier based on ELO using percentile-based thresholds
  const getTier = (
    elo: number,
    tierThresholds: ReturnType<typeof calculateTierThresholds>
  ): Tier => {
    if (elo >= tierThresholds.S) return "S";
    if (elo >= tierThresholds.A) return "A";
    if (elo >= tierThresholds.B) return "B";
    if (elo >= tierThresholds.C) return "C";
    if (elo >= tierThresholds.D) return "D";
    if (elo >= tierThresholds.E) return "E";
    return "F";
  };

  // Helper function to calculate days ago from last match date
  const getDaysAgo = (
    lastMatchDate: string | null | undefined
  ): number | null => {
    if (!lastMatchDate) return null;
    const lastMatch = new Date(lastMatchDate);
    const now = new Date();
    const diffTime = now.getTime() - lastMatch.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Sort players by ELO
  const sortedPlayers = [...players].sort((a, b) => b.elo - a.elo);
  const trimmedMatchIdSearchInput = matchIdSearchInput.trim();
  const isMatchContextActive = matchContextId !== null;
  const hasActiveMatchSearch =
    trimmedMatchIdSearchInput.length > 0 ||
    isMatchContextActive ||
    matchSearchError !== null;
  const shouldShowMatchIdSearchBar =
    searchParams.get("showMatchIdSearch") === "true" || hasActiveMatchSearch;

  // Separate active and inactive players
  const activePlayers = sortedPlayers.filter((player) => !player.inactive);
  // Only include ranked players (top_ten_played >= 3) in inactive list
  const inactivePlayers = sortedPlayers.filter(
    (player) => player.inactive && player.is_ranked
  );

  // Sort inactive players by last match date (most recent first, least inactive first)
  const sortedInactivePlayers = [...inactivePlayers].sort((a, b) => {
    const aDays = getDaysAgo(a.last_match_date);
    const bDays = getDaysAgo(b.last_match_date);
    // If both have dates, sort by most recent first (lower days = less inactive)
    if (aDays !== null && bDays !== null) {
      return aDays - bDays;
    }
    // If only one has a date, prioritize it (put it first)
    if (aDays !== null && bDays === null) return -1;
    if (aDays === null && bDays !== null) return 1;
    // If neither has a date, sort by ELO (fallback)
    return b.elo - a.elo;
  });

  // Separate ranked and unranked players
  // Ranked players: only active ranked players
  const rankedPlayers = activePlayers.filter((player) => player.is_ranked);
  // Unranked players: includes both active and inactive unranked players
  const unrankedPlayers = sortedPlayers.filter((player) => !player.is_ranked);

  // Sort unranked players by how close they are to becoming ranked (descending: 2/3, 1/3, 0/3)
  const sortedUnrankedPlayers = unrankedPlayers.sort(
    (a, b) => b.top_ten_played - a.top_ten_played
  );

  // Calculate dynamic tier thresholds ONLY for ranked players
  const tierThresholds = calculateTierThresholds(rankedPlayers);
  const eligibleCharacterRankings = characterRankings.filter(
    (characterRanking) =>
      characterRanking.matches >= CHARACTER_RANKING_MIN_MATCHES
  );
  const characterRankingCharacterOptions = Array.from(
    new Set(
      eligibleCharacterRankings.map(
        (characterRanking) => characterRanking.character_name
      )
    )
  ).sort((a, b) => a.localeCompare(b));
  const bestCharacterRankings: CharacterRanking[] = [];
  const seenBestCharacterPlayers = new Set<number>();

  eligibleCharacterRankings.forEach((characterRanking) => {
    if (seenBestCharacterPlayers.has(characterRanking.player_id)) {
      return;
    }

    seenBestCharacterPlayers.add(characterRanking.player_id);
    bestCharacterRankings.push(characterRanking);
  });

  const characterRankingPlayerOptions: PlayerDropdownPlayer[] = [];
  const seenCharacterRankingPlayerIds = new Set<string>();

  eligibleCharacterRankings.forEach((characterRanking) => {
    const playerId = characterRanking.player_id.toString();

    if (seenCharacterRankingPlayerIds.has(playerId)) {
      return;
    }

    seenCharacterRankingPlayerIds.add(playerId);
    characterRankingPlayerOptions.push({
      id: characterRanking.player_id,
      name: characterRanking.name,
      display_name: characterRanking.display_name,
      picture: characterRanking.picture ?? null,
    });
  });

  characterRankingPlayerOptions.sort((a, b) =>
    getPlayerQueryLabel(a).localeCompare(getPlayerQueryLabel(b))
  );

  const filteredCharacterRankings = eligibleCharacterRankings.filter(
    (characterRanking) => {
      const playerId = characterRanking.player_id.toString();

      if (selectedCharacterRankingPlayerIds.length === 0) {
        return true;
      }

      return characterRankingPlayerFilterMode === "include"
        ? selectedCharacterRankingPlayerIds.includes(playerId)
        : !selectedCharacterRankingPlayerIds.includes(playerId);
    }
  );
  const limitedCharacterRankings =
    characterRankingPlayerRowLimit === "all"
      ? filteredCharacterRankings
      : (() => {
          const playerCounts = new Map<string, number>();

          return filteredCharacterRankings.filter((characterRanking) => {
            const playerId = characterRanking.player_id.toString();
            const currentCount = playerCounts.get(playerId) ?? 0;

            if (currentCount >= characterRankingPlayerRowLimit) {
              return false;
            }

            playerCounts.set(playerId, currentCount + 1);
            return true;
          });
        })();
  const hasCharacterRankingPlayerFilters =
    selectedCharacterRankingPlayerIdsKey !== defaultCharacterBasedPlayerIdsKey;
  const hasCharacterRankingRowLimit =
    characterRankingPlayerRowLimit !==
    DEFAULT_CHARACTER_RANKING_PLAYER_ROW_LIMIT;
  const hasCharacterRankingControlsApplied =
    hasCharacterRankingPlayerFilters ||
    hasCharacterRankingRowLimit ||
    characterRankingPlayerFilterMode !== "include";
  const playersById = new Map(sortedPlayers.map((player) => [player.id, player]));
  const playersTabRankedPlayers = (() => {
    const rankedPlayersById = new Map(rankedPlayers.map((player) => [player.id, player]));
    const seenPlayerIds = new Set<number>();
    const orderedRankedPlayers: ExtendedPlayer[] = [];

    bestCharacterRankings.forEach((characterRanking) => {
      const rankedPlayer = rankedPlayersById.get(characterRanking.player_id);
      if (!rankedPlayer || seenPlayerIds.has(rankedPlayer.id)) {
        return;
      }

      seenPlayerIds.add(rankedPlayer.id);
      orderedRankedPlayers.push(rankedPlayer);
    });

    rankedPlayers.forEach((rankedPlayer) => {
      if (seenPlayerIds.has(rankedPlayer.id)) {
        return;
      }

      orderedRankedPlayers.push(rankedPlayer);
    });

    return orderedRankedPlayers;
  })();
  const characterBasedTierEntries = limitedCharacterRankings.filter(
    (characterRanking) => {
      const player = playersById.get(characterRanking.player_id);
      const daysAgo = getDaysAgo(
        player?.last_match_date ?? characterRanking.last_match_date
      );

      return daysAgo !== null && daysAgo < 90;
    }
  );
  const characterBasedTierThresholds = calculateTierThresholds(
    characterBasedTierEntries.length > 0
      ? characterBasedTierEntries
      : limitedCharacterRankings
  );
  const characterBasedTierList = createEmptyTierList();

  characterBasedTierEntries.forEach((characterRanking) => {
    const player = playersById.get(characterRanking.player_id);
    const tier = getTier(characterRanking.elo, characterBasedTierThresholds);

    characterBasedTierList[tier].push({
      key: characterRanking.id,
      player_id: characterRanking.player_id,
      name: characterRanking.name,
      display_name: characterRanking.display_name,
      picture: characterRanking.picture ?? null,
      country: characterRanking.country ?? null,
      character_name: characterRanking.character_name,
      characterLabel: "Character Based",
      elo: characterRanking.elo,
      current_win_streak: characterRanking.current_win_streak,
      inactive: player?.inactive ?? false,
      showInactiveOverlay: player?.inactive ?? false,
    });
  });
  const allCharactersTierList = createEmptyTierList();

  rankedPlayers.forEach((player) => {
    const tier = getTier(player.elo, tierThresholds);

    allCharactersTierList[tier].push({
      key: `player-${player.id}`,
      player_id: player.id,
      name: player.name,
      display_name: player.display_name,
      picture: player.picture ?? null,
      country: player.country ?? null,
      character_name: player.main_character ?? null,
      characterLabel: "Main character",
      elo: player.elo,
      current_win_streak: player.current_win_streak,
      inactive: false,
      showInactiveOverlay: false,
    });
  });
  const isAllCharactersTierView = tierListView === "all-characters";
  const displayedTierList = isAllCharactersTierView
    ? allCharactersTierList
    : characterBasedTierList;
  const tierListSubtitle = isAllCharactersTierView
    ? "Based on each player's overall ELO"
    : "Based on filtered character ELO rankings";
  const tierListDescription = isAllCharactersTierView
    ? "Tiered by overall player ELO using their full match history."
    : "Tiered by filtered character ELO rows, with at least 5 games on that character.";
  const tierListControlOptions = [
    {
      id: "all-characters" as const,
      label: "Overall",
      count: rankedPlayers.length,
    },
    {
      id: "best-character" as const,
      label: "Character Based",
      count: characterBasedTierEntries.length,
    },
  ];
  const characterBasedRankingsDescription =
    "Character-based rankings filtered by player and rows per player, with at least 5 games on that character.";
  const selectedCharacterRankings = selectedCharacterRankingCharacter
    ? eligibleCharacterRankings.filter(
        (characterRanking) =>
          characterRanking.character_name === selectedCharacterRankingCharacter
      )
    : [];

  const isOverallLeaderboard = leaderboardTab === "overall";
  const isOverallAllCharactersView =
    isOverallLeaderboard && overallRankingsView === "all-characters";
  const isOverallBestCharacterView =
    isOverallLeaderboard && overallRankingsView === "best-character";
  const isCharacterLeaderboard = leaderboardTab === "character";
  const hasSelectedCharacterRankingCharacter =
    selectedCharacterRankingCharacter.length > 0;
  const shouldShowCharacterSearchResults =
    isCharacterLeaderboard && hasSelectedCharacterRankingCharacter;
  const isCharacterRowsLeaderboard =
    shouldShowCharacterSearchResults || isOverallBestCharacterView;
  const displayedCharacterRankings = isOverallBestCharacterView
    ? limitedCharacterRankings
    : shouldShowCharacterSearchResults
    ? selectedCharacterRankings
    : [];
  const visibleCharacterRankings = isCharacterRowsLeaderboard
    ? displayedCharacterRankings.slice(0, visibleCharacterRankingsCount)
    : [];
  const characterTierThresholds = calculateTierThresholds(
    displayedCharacterRankings
  );
  const hasMoreVisibleCharacterRankings =
    isCharacterRowsLeaderboard &&
    visibleCharacterRankings.length < displayedCharacterRankings.length;
  const leaderboardCount = isOverallAllCharactersView
    ? rankedPlayers.length
    : isCharacterRowsLeaderboard
    ? displayedCharacterRankings.length
    : isCharacterLeaderboard
    ? 0
    : leaderboardTab === "unranked"
    ? unrankedPlayers.length
    : inactivePlayers.length;

  useEffect(() => {
    if (!isCharacterRowsLeaderboard || !hasMoreVisibleCharacterRankings) {
      return;
    }

    const sentinel = characterRankingsSentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) {
          return;
        }

        setVisibleCharacterRankingsCount((currentCount) =>
          Math.min(
            currentCount + CHARACTER_RANKINGS_BATCH_SIZE,
            displayedCharacterRankings.length
          )
        );
      },
      {
        rootMargin: "400px 0px",
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [
    displayedCharacterRankings.length,
    hasMoreVisibleCharacterRankings,
    isCharacterRowsLeaderboard,
  ]);

  // Get tier badge color
  const getTierBadgeColor = (tier: Tier): string => {
    switch (tier) {
      case "S":
        return "bg-gradient-to-r from-yellow-400 to-yellow-500 text-black";
      case "A":
        return "bg-gradient-to-r from-red-500 to-red-600 text-white";
      case "B":
        return "bg-gradient-to-r from-blue-500 to-blue-600 text-white";
      case "C":
        return "bg-gradient-to-r from-green-500 to-green-600 text-white";
      case "D":
        return "bg-gradient-to-r from-purple-500 to-purple-600 text-white";
      case "E":
        return "bg-gradient-to-r from-gray-500 to-gray-600 text-white";
      case "F":
        return "bg-gradient-to-r from-slate-700 to-slate-800 text-white";
      default:
        return "bg-gradient-to-r from-gray-500 to-gray-600 text-white";
    }
  };

  return (
    <>
      {/* CSS for player highlight effect */}
      <style jsx>{`
        .player-highlight {
          animation: highlight 3s ease-in-out;
          box-shadow: 0 0 20px rgba(255, 215, 0, 0.8),
            0 0 40px rgba(255, 215, 0, 0.4);
          border: 2px solid rgba(255, 215, 0, 0.6) !important;
        }

        @keyframes highlight {
          0% {
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.8),
              0 0 40px rgba(255, 215, 0, 0.4);
            border-color: rgba(255, 215, 0, 0.6);
          }
          50% {
            box-shadow: 0 0 30px rgba(255, 215, 0, 1),
              0 0 60px rgba(255, 215, 0, 0.6);
            border-color: rgba(255, 215, 0, 0.8);
          }
          100% {
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.8),
              0 0 40px rgba(255, 215, 0, 0.4);
            border-color: rgba(255, 215, 0, 0.6);
          }
        }
      `}</style>

      <div
        className="flex flex-col items-center p-6 md:p-0 min-h-screen bg-black text-white antialiased"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 50%, rgba(30, 30, 30, 0.4) 0%, rgba(0, 0, 0, 0.8) 100%)",
          backgroundAttachment: "fixed",
          fontFamily: "'Roboto Mono', monospace",
        }}
      >
        {/* Smash-style header */}
        <header className="max-w-5xl w-full bg-gradient-to-r from-red-600 to-red-700 border-b-4 border-yellow-500 shadow-lg relative overflow-hidden rounded-3xl md:mt-8">
          {/* Glare effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white to-transparent opacity-10 skew-x-12 transform -translate-x-full"></div>

          <div className="py-6 flex justify-center items-center relative z-10">
            <div className="flex items-center space-x-8">
              {/* Founders Inc Logo */}
              <img
                src="/images/founders-icon.png"
                alt="Founders Inc Logo"
                className="hidden md:block h-12 w-auto object-contain"
                style={{
                  filter: "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))",
                }}
              />

              <h1
                className="hidden md:block text-5xl font-bold tracking-wide uppercase text-white"
                style={{
                  textShadow:
                    "0 0 15px rgba(255, 255, 255, 0.6), 3px 3px 6px rgba(0, 0, 0, 0.8)",
                  letterSpacing: "0.15em",
                }}
              >
                ×
              </h1>

              {/* Smash Bros Logo */}
              <img
                src="/images/smash-logo.png"
                alt="Super Smash Bros Logo"
                className="h-16 w-auto object-contain"
                style={{
                  filter: "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))",
                }}
              />
            </div>
          </div>
        </header>

        {/* Navigation */}
        <nav className="bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700 shadow-md sticky top-0 z-50 mt-6 rounded-xl mx-4">
          <div className="">
            <ul className="flex rounded-xl overflow-hidden">
              {[
                {
                  id: "rankings",
                  icon: <Trophy size={20} />,
                  label: "Rankings",
                },
                { id: "tiers", icon: <List size={20} />, label: "Tier List" },
                {
                  id: "matchups",
                  icon: <Search size={20} />,
                  label: "Matchups",
                },
                { id: "matches", icon: <Swords size={20} />, label: "Matches" },
                { id: "players", icon: <Users size={20} />, label: "Players" },
                // Temporarily hide the analytics tab.
                // {
                //   id: "analytics",
                //   icon: <BarChart size={20} />,
                //   label: "Analytics",
                // },
              ].map((tab, index, tabs) => (
                <li key={tab.id} className="">
                  <button
                    onClick={() => handleTabClick(tab.id)}
                    className={`w-full px-2 py-3 md:px-4 md:py-5 flex flex-col md:flex-row items-center justify-center space-y-1 md:space-y-0 md:space-x-3 transition-all duration-200 relative overflow-hidden text-sm md:text-xl font-semibold ${
                      activeTab === tab.id
                        ? "bg-gradient-to-b from-red-600 to-red-700 text-white"
                        : "text-gray-400 hover:text-white hover:bg-gray-800"
                    }`}
                    style={{
                      boxShadow:
                        activeTab === tab.id
                          ? "inset 0 -3px 0 rgba(255, 215, 0, 0.7)"
                          : "none",
                      borderRadius:
                        index === 0
                          ? "0.75rem 0 0 0.75rem"
                          : index === tabs.length - 1
                          ? "0 0.75rem 0.75rem 0"
                          : "0",
                    }}
                  >
                    {/* Glare effect for active tab */}
                    {activeTab === tab.id && (
                      <div className="absolute inset-0 bg-gradient-to-br from-white to-transparent opacity-10 skew-x-12 transform -translate-x-full"></div>
                    )}

                    <span className="relative z-10">
                      <span className="block md:hidden">
                        {React.cloneElement(tab.icon, { size: 16 })}
                      </span>
                      <span className="hidden md:block">{tab.icon}</span>
                    </span>
                    <span className="relative z-10 text-xs md:text-xl">
                      {tab.label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Main content */}
        <main className="max-w-5xl w-full py-3">
          {error && (
            <div className="bg-gradient-to-r from-red-600 to-red-700 border border-red-800 text-white px-4 py-3 rounded-xl mb-6 flex justify-between items-center shadow-lg">
              <span className="text-lg">{error}</span>
              <button
                onClick={() => setError(null)}
                className="text-white hover:text-gray-200 rounded-full h-6 w-6 flex items-center justify-center bg-red-800"
              >
                &times;
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div
                className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-yellow-500"
                style={{
                  boxShadow: "0 0 20px rgba(255, 215, 0, 0.5)",
                }}
              ></div>
            </div>
          ) : (
            <>
              {/* Rankings Tab */}
              {activeTab === "rankings" && (
                <div className="relative overflow-visible rounded-2xl border border-gray-700 bg-gradient-to-b from-gray-900 to-gray-800 shadow-lg">
                  <div className="px-6 py-5 bg-gradient-to-r from-red-600 to-red-700 flex items-center justify-between relative overflow-hidden rounded-t-2xl">
                    {/* Glare effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white to-transparent opacity-10 skew-x-12 transform -translate-x-full"></div>

                    <div className="flex flex-col md:flex-row items-center relative z-10 justify-between w-full">
                      <div className="flex items-center space-x-2">
                        <Trophy
                          className="mr-3 text-yellow-500"
                          size={24}
                          style={{
                            filter:
                              "drop-shadow(0 0 5px rgba(255, 215, 0, 0.5))",
                          }}
                        />
                        <div>
                          <h2
                            className="text-2xl font-bold text-white"
                            style={{
                              textShadow: "0 0 10px rgba(0, 0, 0, 0.5)",
                            }}
                          >
                            Leaderboard
                          </h2>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-col items-center gap-3 md:mt-0 md:items-end">
                        <RefreshStatus
                          refreshing={isRefreshing}
                          countdown={countdown}
                          lastUpdated={lastUpdated}
                          centered={false}
                        />
                        <HardRefreshButton
                          onRefresh={handleHardRefresh}
                          disabled={isRefreshing}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Leaderboard Sub-tabs */}
                  <div className="px-6 py-4 bg-gray-800 border-b border-gray-700">
                    <div className="flex space-x-1">
                      {[
                        { id: "overall", label: "Overall Rankings" },
                        { id: "character", label: "Character Rankings" },
                        { id: "unranked", label: "Unranked Players" },
                        { id: "inactive", label: "Inactive Players" },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() =>
                            updateRankingsURL({
                              leaderboardTab: tab.id as LeaderboardTab,
                            })
                          }
                          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-200 ${
                            leaderboardTab === tab.id
                              ? "bg-red-600 text-white"
                              : "text-gray-400 hover:text-white hover:bg-gray-700"
                          }`}
                        >
                          {tab.label}
                          <span className="ml-2 text-xs bg-gray-600 px-2 py-1 rounded-full">
                            {tab.id === "overall"
                              ? rankedPlayers.length
                              : tab.id === "character"
                              ? characterRankingCharacterOptions.length
                              : tab.id === "unranked"
                              ? unrankedPlayers.length
                              : inactivePlayers.length}
                          </span>
                        </button>
                      ))}
                    </div>
                    {leaderboardTab === "overall" && (
                      <div className="mt-4">
                        <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-900 p-1">
                          {[
                            {
                              id: "all-characters",
                              label: "Overall",
                              count: rankedPlayers.length,
                            },
                            {
                              id: "best-character",
                              label: "Character Based",
                              count: limitedCharacterRankings.length,
                            },
                          ].map((tab) => (
                            <button
                              key={tab.id}
                              onClick={() =>
                                updateRankingsURL({
                                  overallRankingsView:
                                    tab.id as OverallRankingsView,
                                })
                              }
                              className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors duration-200 ${
                                overallRankingsView === tab.id
                                  ? "bg-red-600 text-white"
                                  : "text-gray-400 hover:bg-gray-700 hover:text-white"
                              }`}
                            >
                              <span>{tab.label}</span>
                              <span className="rounded-full bg-gray-700 px-2 py-1 text-xs">
                                {tab.count}
                              </span>
                            </button>
                          ))}
                        </div>
                        {overallRankingsView === "all-characters" ? (
                          <div className="mt-2 text-sm text-gray-400">
                            Overall player ELO using their full match history.
                          </div>
                        ) : (
                          <div className="mt-4">
                            <CharacterBasedFilters
                              description={characterBasedRankingsDescription}
                              showFilters={showCharacterBasedFilters}
                              onToggle={() =>
                                setShowCharacterBasedFilters((current) => !current)
                              }
                              playerOptions={characterRankingPlayerOptions}
                              selectedPlayerIds={
                                selectedCharacterRankingPlayerIds
                              }
                              filterMode={characterRankingPlayerFilterMode}
                              rowLimit={characterRankingPlayerRowLimit}
                              onPlayersChange={
                                handleCharacterRankingPlayerFilterChange
                              }
                              onFilterModeChange={(nextMode) =>
                                updateCharacterBasedFilters({
                                  characterRankingPlayerFilterMode: nextMode,
                                })
                              }
                              onRowLimitChange={(nextLimit) =>
                                updateCharacterBasedFilters({
                                  characterRankingPlayerRowLimit: nextLimit,
                                })
                              }
                              onReset={clearCharacterRankingPlayerFilters}
                              hasAppliedFilters={
                                hasCharacterRankingControlsApplied
                              }
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {leaderboardTab === "character" && (
                      <div className="mt-4">
                        <CharacterRankingSearchPanel
                          availableCharacters={characterRankingCharacterOptions}
                          selectedCharacter={selectedCharacterRankingCharacter}
                          disabled={
                            loadingCharacterRankings ||
                            !hasFetchedCharacterRankings
                          }
                          onCharacterChange={
                            handleCharacterRankingCharacterChange
                          }
                          onClear={clearCharacterRankingCharacter}
                        />
                      </div>
                    )}
                    {leaderboardTab === "unranked" && (
                      <div className="mt-2 text-sm text-gray-400">
                        Sorted by progress toward ranking (need to play 3+ top
                        10 players)
                      </div>
                    )}
                    {leaderboardTab === "inactive" && (
                      <div className="mt-2 text-sm text-gray-400">
                        Players who have not played in the last 4 weeks
                      </div>
                    )}
                  </div>

                  {sortedPlayers.length === 0 ? (
                    <div className="text-gray-400 text-center py-16 px-6">
                      <p className="text-2xl font-bold">
                        No fighters have entered the arena yet!
                      </p>
                      <p className="mt-2 text-lg">
                        Add some fighters to begin the tournament
                      </p>
                    </div>
                  ) : isCharacterLeaderboard &&
                    !hasSelectedCharacterRankingCharacter ? (
                    <div className="p-6">
                      <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/40 px-6 py-16 text-center text-gray-400">
                        <p className="text-2xl font-bold text-white">
                          Choose a character to unlock the rankings.
                        </p>
                        <p className="mt-2 text-lg">
                          Search any Smash character to see who has the highest
                          character ELO, with at least{" "}
                          {CHARACTER_RANKING_MIN_MATCHES} recorded matches on
                          that character.
                        </p>
                        {(loadingCharacterRankings ||
                          !hasFetchedCharacterRankings) && (
                          <div className="mt-6 flex items-center justify-center gap-3 text-sm text-gray-500">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-yellow-500"></div>
                            <span>Loading character rankings...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : isCharacterRowsLeaderboard &&
                    (loadingCharacterRankings || !hasFetchedCharacterRankings) ? (
                    <div className="flex justify-center items-center h-64">
                      <div
                        className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-yellow-500"
                        style={{
                          boxShadow: "0 0 20px rgba(255, 215, 0, 0.5)",
                        }}
                      ></div>
                    </div>
                  ) : isCharacterRowsLeaderboard && leaderboardCount === 0 ? (
                    <div className="text-gray-400 text-center py-16 px-6">
                      <p className="text-2xl font-bold">
                        {isOverallBestCharacterView
                          ? "No character-based rankings yet."
                          : `No ${selectedCharacterRankingCharacter} rankings yet.`}
                      </p>
                      <p className="mt-2 text-lg">
                        {isOverallBestCharacterView
                          ? "Character-based rows appear after the capture pipeline has written persisted character ELOs, once a player has at least 5 games on that character."
                          : `No player has at least ${CHARACTER_RANKING_MIN_MATCHES} recorded matches on ${selectedCharacterRankingCharacter} yet.`}
                      </p>
                    </div>
                  ) : (
                    <div
                      className={`p-6 transition-opacity duration-300 ${
                        isRefreshing ? "opacity-75" : "opacity-100"
                      }`}
                    >
                      <div className="overflow-x-auto rounded-xl">
                        <table className="w-full divide-y divide-gray-800">
                          <thead>
                            <tr className="bg-gradient-to-r from-gray-800 to-gray-700">
                              <th className="px-2 py-3 md:px-6 md:py-6 text-left text-xs md:text-lg font-bold text-gray-300 uppercase tracking-wider rounded-tl-xl w-24">
                                {isOverallLeaderboard || isCharacterRowsLeaderboard
                                  ? "Rank"
                                  : leaderboardTab === "unranked"
                                  ? "Progress"
                                  : "Last Played"}
                              </th>
                              <th className="px-1 py-3 md:px-2 md:py-6 text-center text-xs md:text-lg font-bold text-gray-300 uppercase tracking-wider w-12">
                                Flag
                              </th>
                              <th className="px-2 py-3 md:px-4 md:py-6 text-left text-xs md:text-lg font-bold text-gray-300 uppercase tracking-wider">
                                {isCharacterRowsLeaderboard ? "Entry" : "Player"}
                              </th>
                              {leaderboardTab !== "unranked" && (
                                <th className="px-1 py-3 md:px-3 md:py-6 text-center text-xs md:text-lg font-bold text-gray-300 uppercase tracking-wider w-16">
                                  <div className="flex items-center justify-center">
                                    <span>ELO</span>
                                    {/* <ArrowUpDown
                                      size={12}
                                      className="ml-1 md:ml-2 text-gray-500 md:w-5 md:h-5"
                                    /> */}
                                  </div>
                                </th>
                              )}
                              {leaderboardTab !== "inactive" && (
                                <th
                                  className={`px-1 py-3 md:px-4 md:py-6 text-center text-xs md:text-lg font-bold text-gray-300 uppercase tracking-wider ${
                                    leaderboardTab === "unranked"
                                      ? "w-24 md:w-32"
                                      : "w-16"
                                  } ${
                                    isCharacterRowsLeaderboard
                                      ? "rounded-tr-xl"
                                      : ""
                                  }`}
                                >
                                  {leaderboardTab === "unranked"
                                    ? "To Rank"
                                    : "Tier"}
                                </th>
                              )}
                              {!isCharacterRowsLeaderboard && (
                                <th className="px-1 py-3 md:px-3 md:py-6 text-center text-xs md:text-lg font-bold text-gray-300 uppercase tracking-wider rounded-tr-xl w-16">
                                  Main
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="bg-gray-900 divide-y divide-gray-800">
                            {isCharacterRowsLeaderboard
                              ? visibleCharacterRankings.map(
                                  (
                                    characterRanking,
                                    index,
                                    currentCharacterRankings
                                  ) => {
                                    const playerDisplayName =
                                      getPlayerDisplayName(characterRanking);
                                    const possessiveCharacterLabel = `${getPossessiveLabel(
                                      playerDisplayName
                                    )} ${characterRanking.character_name}`;
                                    const isLast =
                                      index ===
                                      currentCharacterRankings.length - 1;

                                    return (
                                      <tr
                                        key={characterRanking.id}
                                        className="hover:bg-gray-800 transition-colors duration-150"
                                      >
                                        <td
                                          className={`px-2 py-3 md:px-6 md:py-8 whitespace-nowrap ${
                                            isLast ? "rounded-bl-xl" : ""
                                          }`}
                                        >
                                          <div className="justify-center flex items-center">
                                              <span className="text-sm md:text-3xl font-bold text-white">
                                                #{index + 1}
                                              </span>
                                            {index === 0 && (
                                              <Trophy
                                                size={14}
                                                className="ml-1 md:ml-3 md:w-6 md:h-6 text-yellow-500"
                                                style={{
                                                  filter:
                                                    "drop-shadow(0 0 5px rgba(255, 215, 0, 0.5))",
                                                }}
                                              />
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-1 py-3 md:px-2 md:py-8 whitespace-nowrap text-center">
                                          {characterRanking.country &&
                                          isValidCountryCode(
                                            characterRanking.country
                                          ) ? (
                                            <ReactCountryFlag
                                              countryCode={characterRanking.country.toUpperCase()}
                                              svg
                                              style={{
                                                width: "2rem",
                                                height: "1.25rem",
                                              }}
                                              className="inline-block md:!w-12 md:!h-8"
                                            />
                                          ) : (
                                            <span className="text-gray-500 text-xs">
                                              -
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-2 py-3 md:px-6 md:py-8 text-white">
                                          <div
                                            className="flex min-w-0 items-center gap-2 md:gap-4 cursor-pointer hover:opacity-80 transition-opacity"
                                            onClick={() =>
                                              handlePlayerClick(
                                                characterRanking.player_id
                                              )
                                            }
                                            title={possessiveCharacterLabel}
                                          >
                                            <div className="shrink-0">
                                              <ProfilePicture
                                                player={characterRanking}
                                                size="md"
                                              />
                                            </div>
                                            <div className="min-w-0">
                                              <div className="flex min-w-0 flex-wrap items-center gap-2 md:gap-3 leading-tight">
                                                <span className="text-base font-bold text-white md:text-2xl">
                                                  {getPossessiveLabel(
                                                    playerDisplayName
                                                  )}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={(event) =>
                                                    handleCharacterRankingBadgeClick(
                                                      event,
                                                      characterRanking.character_name
                                                    )
                                                  }
                                                  className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-gray-700/80 bg-gray-800/70 px-2.5 py-1 text-sm font-semibold text-gray-200 shadow-lg transition-colors hover:border-yellow-400/70 hover:bg-gray-700/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/70 md:px-3 md:py-1.5 md:text-xl"
                                                  title={`Show ${possessiveCharacterLabel} in Character Rankings`}
                                                  aria-label={`Show ${possessiveCharacterLabel} in Character Rankings`}
                                                >
                                                  <CharacterProfilePicture
                                                    characterName={
                                                      characterRanking.character_name
                                                    }
                                                    size="sm"
                                                    className="h-6 w-6 md:h-8 md:w-8 shrink-0 border border-gray-200 shadow-sm"
                                                    alt={`${characterRanking.character_name} portrait`}
                                                  />
                                                  <span className="truncate">
                                                    {
                                                      characterRanking.character_name
                                                    }
                                                  </span>
                                                </button>
                                                <FireStreak
                                                  streak={
                                                    characterRanking.current_win_streak ||
                                                    0
                                                  }
                                                />
                                              </div>
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-1 py-3 md:px-3 md:py-8 text-center whitespace-nowrap">
                                          <span
                                            className="text-sm md:text-2xl font-bold text-yellow-500 bg-gray-800 px-2 py-1 md:px-4 md:py-2 rounded-full"
                                            style={{
                                              textShadow:
                                                "0 0 10px rgba(255, 215, 0, 0.6)",
                                            }}
                                          >
                                            {characterRanking.elo}
                                          </span>
                                        </td>
                                        <td
                                          className={`px-1 py-3 md:px-2 md:py-8 text-center whitespace-nowrap ${
                                            isLast ? "rounded-br-xl" : ""
                                          }`}
                                        >
                                          <span
                                            className={`w-8 h-8 md:w-12 md:h-12 inline-flex items-center justify-center text-xs md:text-lg font-bold rounded-full ${getTierBadgeColor(
                                              getTier(
                                                characterRanking.elo,
                                                characterTierThresholds
                                              )
                                            )} shadow-lg`}
                                          >
                                            {getTier(
                                              characterRanking.elo,
                                              characterTierThresholds
                                            )}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  }
                                )
                              : (leaderboardTab === "overall"
                                  ? rankedPlayers
                                  : leaderboardTab === "unranked"
                                  ? sortedUnrankedPlayers
                                  : sortedInactivePlayers
                                ).map((player, index, currentPlayers) => {
                                  const isLast =
                                    index === currentPlayers.length - 1;
                                  return (
                                    <tr
                                      key={player.id}
                                      className="hover:bg-gray-800 transition-colors duration-150"
                                    >
                                      <td
                                        className={`px-2 py-3 md:px-6 md:py-8 whitespace-nowrap ${
                                          isLast ? "rounded-bl-xl" : ""
                                        }`}
                                      >
                                        <div className="justify-center flex items-center">
                                          {leaderboardTab === "unranked" ? (
                                            <div className="flex items-center">
                                              <div
                                                className={`w-4 h-4 md:w-6 md:h-6 rounded-full mr-2 ${
                                                  player.top_ten_played >= 2
                                                    ? "bg-green-500"
                                                    : player.top_ten_played >= 1
                                                    ? "bg-yellow-500"
                                                    : "bg-red-500"
                                                }`}
                                              ></div>
                                              <span className="text-sm md:text-lg font-bold text-gray-300">
                                                {player.top_ten_played}/3
                                              </span>
                                            </div>
                                          ) : leaderboardTab === "inactive" ? (
                                            <div className="text-center">
                                              <span className="text-sm md:text-lg font-bold text-gray-300">
                                                {(() => {
                                                  const daysAgo = getDaysAgo(
                                                    player.last_match_date
                                                  );
                                                  if (daysAgo === null) {
                                                    return "Never";
                                                  }
                                                  return `${daysAgo} days ago`;
                                                })()}
                                              </span>
                                            </div>
                                          ) : (
                                            <>
                                              <span className="text-sm md:text-3xl font-bold text-white">
                                                #{index + 1}
                                              </span>
                                              {index === 0 &&
                                                isOverallAllCharactersView && (
                                                  <Trophy
                                                    size={14}
                                                    className="ml-1 md:ml-3 md:w-6 md:h-6 text-yellow-500"
                                                    style={{
                                                      filter:
                                                        "drop-shadow(0 0 5px rgba(255, 215, 0, 0.5))",
                                                    }}
                                                  />
                                                )}
                                            </>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-1 py-3 md:px-2 md:py-8 whitespace-nowrap text-center">
                                        {player.country &&
                                        isValidCountryCode(player.country) ? (
                                          <ReactCountryFlag
                                            countryCode={player.country.toUpperCase()}
                                            svg
                                            style={{
                                              width: "2rem",
                                              height: "1.25rem",
                                            }}
                                            className="inline-block md:!w-12 md:!h-8"
                                          />
                                        ) : (
                                          <span className="text-gray-500 text-xs">
                                            -
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-2 py-3 md:px-6 md:py-8 whitespace-nowrap text-sm md:text-2xl font-bold text-white">
                                        <div
                                          className="flex items-center space-x-2 md:space-x-4 cursor-pointer hover:opacity-80 transition-opacity"
                                          onClick={() =>
                                            handlePlayerClick(player.id)
                                          }
                                        >
                                          <ProfilePicture
                                            player={player}
                                            size="md"
                                          />
                                          <div className="flex items-center">
                                            <span>
                                              {player.display_name ||
                                                player.name}
                                            </span>
                                            <FireStreak
                                              streak={
                                                player.current_win_streak || 0
                                              }
                                            />
                                          </div>
                                        </div>
                                      </td>
                                      {leaderboardTab !== "unranked" && (
                                        <td className="px-1 py-3 md:px-3 md:py-8 text-center whitespace-nowrap">
                                          <span
                                            className="text-sm md:text-2xl font-bold text-yellow-500 bg-gray-800 px-2 py-1 md:px-4 md:py-2 rounded-full"
                                            style={{
                                              textShadow:
                                                "0 0 10px rgba(255, 215, 0, 0.6)",
                                            }}
                                          >
                                            {player.elo}
                                          </span>
                                        </td>
                                      )}
                                      {leaderboardTab !== "inactive" && (
                                        <td
                                          className={`px-1 py-3 md:px-2 md:py-8 text-center whitespace-nowrap ${
                                            leaderboardTab === "unranked"
                                              ? "w-24 md:w-32"
                                              : ""
                                          }`}
                                        >
                                          {leaderboardTab === "unranked" ? (
                                            <div className="text-center">
                                              <span className="text-sm md:text-lg font-bold text-gray-300">
                                                {3 - player.top_ten_played}
                                              </span>
                                              <div className="text-xs text-gray-500 whitespace-normal leading-tight max-w-[8.5rem] md:max-w-[10rem] mx-auto">
                                                {3 - player.top_ten_played === 1
                                                  ? "more top 10 player matchup needed"
                                                  : "more top 10 player matchups needed"}
                                              </div>
                                            </div>
                                          ) : (
                                            <span
                                              className={`w-8 h-8 md:w-12 md:h-12 inline-flex items-center justify-center text-xs md:text-lg font-bold rounded-full ${getTierBadgeColor(
                                                getTier(
                                                  player.elo,
                                                  tierThresholds
                                                )
                                              )} shadow-lg`}
                                            >
                                              {getTier(player.elo, tierThresholds)}
                                            </span>
                                          )}
                                        </td>
                                      )}
                                      <td
                                        className={`px-1 py-3 md:px-2 md:py-8 text-center ${
                                          isLast ? "rounded-br-xl" : ""
                                        }`}
                                      >
                                        {player.main_character ? (
                                          <CharacterProfilePicture
                                            characterName={
                                              player.main_character
                                            }
                                            size="sm"
                                            className="border-2 border-gray-300 w-8 h-8 md:w-12 md:h-12"
                                          />
                                        ) : (
                                          <span className="text-gray-500 text-xs">
                                            -
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                          </tbody>
                        </table>
                      </div>
                      {isCharacterRowsLeaderboard && (
                        <div className="px-2 pt-4 text-center">
                          <div className="text-sm text-gray-400">
                            Showing {visibleCharacterRankings.length} of{" "}
                            {displayedCharacterRankings.length}{" "}
                            {shouldShowCharacterSearchResults &&
                            selectedCharacterRankingCharacter
                              ? `${selectedCharacterRankingCharacter} rankings`
                              : "character rankings"}
                          </div>
                          {hasMoreVisibleCharacterRankings ? (
                            <div
                              ref={characterRankingsSentinelRef}
                              className="flex items-center justify-center py-4"
                              aria-hidden="true"
                            >
                              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-yellow-500"></div>
                            </div>
                          ) : (
                            displayedCharacterRankings.length >
                              CHARACTER_RANKINGS_BATCH_SIZE && (
                              <div className="py-4 text-sm text-gray-500">
                                Reached the end of the character rankings.
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Inactive Players Table (shown below overall rankings) */}
                  {isOverallAllCharactersView &&
                    sortedInactivePlayers.length > 0 && (
                      <div className="mt-8">
                        <div className="mb-4">
                          <h3 className="text-xl font-bold text-white px-2">
                            Inactive Players ({sortedInactivePlayers.length})
                          </h3>
                          <div className="mt-2 text-sm text-gray-400 px-2">
                            Players who have not played in the last 4 weeks
                          </div>
                        </div>
                        <div className="overflow-x-auto rounded-xl">
                          <table className="w-full divide-y divide-gray-800">
                            <thead>
                              <tr className="bg-gradient-to-r from-gray-800 to-gray-700">
                                <th className="px-2 py-3 md:px-6 md:py-6 text-left text-xs md:text-lg font-bold text-gray-300 uppercase tracking-wider rounded-tl-xl w-24">
                                  Last Played
                                </th>
                                <th className="px-1 py-3 md:px-2 md:py-6 text-center text-xs md:text-lg font-bold text-gray-300 uppercase tracking-wider w-12">
                                  Flag
                                </th>
                                <th className="px-2 py-3 md:px-4 md:py-6 text-left text-xs md:text-lg font-bold text-gray-300 uppercase tracking-wider">
                                  Player
                                </th>
                                <th className="px-1 py-3 md:px-3 md:py-6 text-center text-xs md:text-lg font-bold text-gray-300 uppercase tracking-wider w-16">
                                  <div className="flex items-center justify-center">
                                    <span>ELO</span>
                                  </div>
                                </th>
                                <th className="px-1 py-3 md:px-3 md:py-6 text-center text-xs md:text-lg font-bold text-gray-300 uppercase tracking-wider rounded-tr-xl w-16">
                                  Main
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-gray-900 divide-y divide-gray-800">
                              {sortedInactivePlayers.map(
                                (player, index, currentPlayers) => {
                                  const isLast =
                                    index === currentPlayers.length - 1;
                                  return (
                                    <tr
                                      key={player.id}
                                      className="hover:bg-gray-800 transition-colors duration-150"
                                    >
                                      <td
                                        className={`px-2 py-3 md:px-6 md:py-8 whitespace-nowrap ${
                                          isLast ? "rounded-bl-xl" : ""
                                        }`}
                                      >
                                        <div className="text-center">
                                          <span className="text-sm md:text-lg font-bold text-gray-300">
                                            {(() => {
                                              const daysAgo = getDaysAgo(
                                                player.last_match_date
                                              );
                                              if (daysAgo === null) {
                                                return "Never";
                                              }
                                              return `${daysAgo} days ago`;
                                            })()}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-1 py-3 md:px-2 md:py-8 whitespace-nowrap text-center">
                                        {player.country &&
                                        isValidCountryCode(player.country) ? (
                                          <ReactCountryFlag
                                            countryCode={player.country.toUpperCase()}
                                            svg
                                            style={{
                                              width: "2rem",
                                              height: "1.25rem",
                                            }}
                                            className="inline-block md:!w-12 md:!h-8"
                                          />
                                        ) : (
                                          <span className="text-gray-500 text-xs">
                                            -
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-2 py-3 md:px-6 md:py-8 whitespace-nowrap text-sm md:text-2xl font-bold text-white">
                                        <div
                                          className="flex items-center space-x-2 md:space-x-4 cursor-pointer hover:opacity-80 transition-opacity"
                                          onClick={() =>
                                            handlePlayerClick(player.id)
                                          }
                                        >
                                          <ProfilePicture
                                            player={player}
                                            size="md"
                                          />
                                          <div className="flex items-center">
                                            <span>
                                              {player.display_name ||
                                                player.name}
                                            </span>
                                            <FireStreak
                                              streak={
                                                player.current_win_streak || 0
                                              }
                                            />
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-1 py-3 md:px-3 md:py-8 text-center whitespace-nowrap">
                                        <span
                                          className="text-sm md:text-2xl font-bold text-yellow-500 bg-gray-800 px-2 py-1 md:px-4 md:py-2 rounded-full"
                                          style={{
                                            textShadow:
                                              "0 0 10px rgba(255, 215, 0, 0.6)",
                                          }}
                                        >
                                          {player.elo}
                                        </span>
                                      </td>
                                      <td
                                        className={`px-1 py-3 md:px-2 md:py-8 text-center ${
                                          isLast ? "rounded-br-xl" : ""
                                        }`}
                                      >
                                        {player.main_character ? (
                                          <CharacterProfilePicture
                                            characterName={
                                              player.main_character
                                            }
                                            size="sm"
                                            className="border-2 border-gray-300 w-8 h-8 md:w-12 md:h-12"
                                          />
                                        ) : (
                                          <span className="text-gray-500 text-xs">
                                            -
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                }
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                </div>
              )}

              {/* Character Selection Grid (Tier List) */}
              {activeTab === "tiers" && (
                <div>
                  {sortedPlayers.length === 0 ? (
                    <div className="text-gray-400 text-center py-16 bg-gray-900 bg-opacity-50 rounded-2xl">
                      <p className="text-2xl font-bold">
                        No fighters have entered the arena yet!
                      </p>
                      <p className="mt-2 text-lg">
                        Add some fighters to begin the tournament
                      </p>
                    </div>
                  ) : (
                    <div className="bg-gradient-to-b from-gray-900 to-gray-800 rounded-2xl border border-gray-700 shadow-lg relative">
                      <div className="px-6 py-5 bg-gradient-to-r from-red-600 to-red-700 flex items-center justify-center relative overflow-hidden rounded-t-2xl">
                        {/* Glare effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white to-transparent opacity-10 skew-x-12 transform -translate-x-full"></div>

                        <div className="relative z-10 flex items-center justify-center gap-4">
                          <div className="text-center">
                            <h2
                              className="text-2xl font-bold text-white uppercase tracking-wider"
                              style={{
                                textShadow: "0 0 10px rgba(0, 0, 0, 0.5)",
                              }}
                            >
                              Official Tier List
                            </h2>
                            <div className="mt-1 text-sm text-red-100/90">
                              {tierListSubtitle}
                            </div>
                            <RefreshStatus
                              refreshing={isRefreshing}
                              countdown={countdown}
                              lastUpdated={lastUpdated}
                              centered={true}
                            />
                          </div>
                          <HardRefreshButton
                            onRefresh={handleHardRefresh}
                            disabled={isRefreshing}
                          />
                        </div>
                      </div>

                      {(loadingCharacterRankings || !hasFetchedCharacterRankings) ? (
                        <div className="flex justify-center items-center h-64">
                          <div
                            className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-yellow-500"
                            style={{
                              boxShadow: "0 0 20px rgba(255, 215, 0, 0.5)",
                            }}
                          ></div>
                        </div>
                      ) : (
                        <div
                          className={`p-6 transition-opacity duration-300 ${
                            isRefreshing ? "opacity-75" : "opacity-100"
                          }`}
                        >
                        <div className="mb-6">
                          <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-900 p-1">
                            {tierListControlOptions.map((option) => (
                              <button
                                key={option.id}
                                onClick={() => updateTierListURL(option.id)}
                                className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors duration-200 ${
                                  tierListView === option.id
                                    ? "bg-red-600 text-white"
                                    : "text-gray-400 hover:bg-gray-700 hover:text-white"
                                }`}
                              >
                                <span>{option.label}</span>
                                <span className="rounded-full bg-gray-700 px-2 py-1 text-xs">
                                  {option.count}
                                </span>
                              </button>
                            ))}
                          </div>
                          {isAllCharactersTierView ? (
                            <div className="mt-2 text-sm text-gray-400">
                              {tierListDescription}
                            </div>
                          ) : (
                            <div className="mt-4">
                              <CharacterBasedFilters
                                description={tierListDescription}
                                showFilters={showCharacterBasedFilters}
                                onToggle={() =>
                                  setShowCharacterBasedFilters(
                                    (current) => !current
                                  )
                                }
                                playerOptions={characterRankingPlayerOptions}
                                selectedPlayerIds={
                                  selectedCharacterRankingPlayerIds
                                }
                                filterMode={characterRankingPlayerFilterMode}
                                rowLimit={characterRankingPlayerRowLimit}
                                onPlayersChange={
                                  handleCharacterRankingPlayerFilterChange
                                }
                                onFilterModeChange={(nextMode) =>
                                  updateCharacterBasedFilters({
                                    characterRankingPlayerFilterMode: nextMode,
                                  })
                                }
                                onRowLimitChange={(nextLimit) =>
                                  updateCharacterBasedFilters({
                                    characterRankingPlayerRowLimit: nextLimit,
                                  })
                                }
                                onReset={clearCharacterRankingPlayerFilters}
                                hasAppliedFilters={
                                  hasCharacterRankingControlsApplied
                                }
                              />
                            </div>
                          )}
                        </div>
                        {/* Tier List Table */}
                        <div className="space-y-1 md:space-y-0">
                          {TIER_NAMES.map((tierName) => {
                              const tierPlayers = displayedTierList[tierName];

                              return (
                                <div
                                  key={tierName}
                                  className="flex bg-gray-800 rounded-lg md:rounded-none border border-gray-700 md:border-b md:border-l-0 md:border-r-0 md:border-t-0 relative"
                                >
                                  {/* Tier Label */}
                                  <div
                                    className={`${getTierBadgeColor(
                                      tierName
                                    )} w-20 md:w-32 flex items-center justify-center py-4 md:py-8`}
                                  >
                                    <span
                                      className="text-3xl md:text-5xl font-bold text-white"
                                      style={{
                                        textShadow:
                                          "2px 2px 4px rgba(0, 0, 0, 0.8)",
                                      }}
                                    >
                                      {tierName}
                                    </span>
                                  </div>

                                  {/* Players in Tier */}
                                  <div className="flex-1 p-4 md:p-8 relative">
                                    {tierPlayers.length === 0 ? (
                                      <div className="flex items-center justify-center h-16 md:h-24 text-gray-500 italic md:text-xl">
                                        No players in this tier
                                      </div>
                                    ) : (
                                      <div className="flex flex-wrap gap-4 md:gap-6">
                                        {tierPlayers.map((player) => (
                                          <div
                                            key={player.key}
                                            className="relative group cursor-pointer"
                                            title={`${
                                              player.display_name || player.name
                                            }${
                                              player.character_name
                                                ? ` (${player.character_name})`
                                                : ""
                                            } - ELO: ${player.elo}${
                                              player.showInactiveOverlay
                                                ? " (Inactive)"
                                                : ""
                                            }`}
                                            onClick={() =>
                                              handlePlayerClick(
                                                player.player_id
                                              )
                                            }
                                          >
                                            <div className="relative">
                                              <ProfilePicture
                                                player={player}
                                                size="lg"
                                                borderColor={
                                                  player.showInactiveOverlay
                                                    ? "border-gray-500 group-hover:border-gray-400"
                                                    : "border-gray-600 group-hover:border-yellow-400"
                                                }
                                                borderWidth="border-2 md:border-3"
                                                additionalClasses={`rounded-lg transition-all duration-200 bg-gray-700 md:shadow-lg ${
                                                  player.showInactiveOverlay
                                                    ? "opacity-60 grayscale"
                                                    : ""
                                                }`}
                                              />
                                              {!isAllCharactersTierView &&
                                                player.character_name && (
                                                <div className="absolute bottom-0 left-0 z-20 -translate-x-[33%] translate-y-[33%] rounded-full bg-gray-950/90 p-1 shadow-lg ring-2 ring-gray-700">
                                                  <CharacterProfilePicture
                                                    characterName={
                                                      player.character_name
                                                    }
                                                    size="md"
                                                    className="h-9 w-9 md:h-12 md:w-12 border-0"
                                                    alt={`${player.character_name} icon`}
                                                  />
                                                </div>
                                              )}

                                              {/* Inactive player overlay with speech bubble */}
                                              {player.showInactiveOverlay && (
                                                <>
                                                  {/* Semi-transparent dark overlay */}
                                                  <div className="absolute inset-0 bg-black/40 rounded-lg z-10 pointer-events-none"></div>

                                                  {/* Circular thought bubble with sleep emoji */}
                                                  <div className="absolute top-0 right-0 z-20 pointer-events-none transform translate-x-1/2 -translate-y-1/2">
                                                    <div className="relative bg-white/95 w-6 h-6 md:w-8 md:h-8 rounded-full shadow-lg border border-gray-300 flex items-center justify-center">
                                                      <span className="text-xs md:text-sm">
                                                        💤
                                                      </span>
                                                      {/* Thought bubble circles */}
                                                      <div className="absolute -bottom-0.5 -left-0.5 w-1.5 h-1.5 md:w-2 md:h-2 bg-white/95 rounded-full border border-gray-300"></div>
                                                      <div className="absolute -bottom-1.5 -left-2 w-1 h-1 md:w-1.5 md:h-1.5 bg-white/95 rounded-full border border-gray-300"></div>
                                                    </div>
                                                  </div>
                                                </>
                                              )}
                                            </div>

                                            {/* Player name and ELO tooltip on hover */}
                                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-black bg-opacity-95 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-[9999] shadow-xl border border-gray-600">
                                              <div className="font-semibold flex items-center">
                                                {player.display_name ||
                                                  player.name}
                                                {player.country &&
                                                  isValidCountryCode(
                                                    player.country
                                                  ) && (
                                                    <ReactCountryFlag
                                                      countryCode={player.country.toUpperCase()}
                                                      svg
                                                      style={{
                                                        width: "1rem",
                                                        height: "0.75rem",
                                                        marginLeft: "0.5rem",
                                                      }}
                                                    />
                                                  )}
                                                <FireStreak
                                                  streak={
                                                    player.current_win_streak ||
                                                    0
                                                  }
                                                />
                                              </div>
                                              {player.character_name && (
                                                <div className="text-gray-300">
                                                  {player.characterLabel}:{" "}
                                                  {player.character_name}
                                                </div>
                                              )}
                                              <div className="text-yellow-400 font-bold">
                                                ELO: {player.elo}
                                              </div>
                                              <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-black"></div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Matchups Tab */}
              {activeTab === "matchups" && (
                <div>
                  {players.length < 2 ? (
                    <div className="text-gray-400 text-center py-16 bg-gray-900 bg-opacity-50 rounded-2xl">
                      <p className="text-2xl font-bold">
                        At least two players are needed for head-to-head stats.
                      </p>
                      <p className="mt-2 text-lg">
                        Once there are two players, you can compare their rivalry
                        here.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-gradient-to-b from-gray-900 to-gray-800 rounded-2xl border border-gray-700 shadow-lg relative">
                      <div className="px-6 py-5 bg-gradient-to-r from-red-600 to-red-700 flex items-center justify-between relative overflow-hidden rounded-t-2xl">
                        <div className="absolute inset-0 bg-gradient-to-br from-white to-transparent opacity-10 skew-x-12 transform -translate-x-full"></div>

                        <div className="flex flex-col md:flex-row items-center relative z-10 justify-between w-full">
                          <div className="flex items-center space-x-2">
                            <Search
                              className="mr-3 text-yellow-500"
                              size={24}
                              style={{
                                filter:
                                  "drop-shadow(0 0 5px rgba(255, 215, 0, 0.5))",
                              }}
                            />
                            <div>
                              <h2
                                className="text-2xl font-bold text-white"
                                style={{
                                  textShadow: "0 0 10px rgba(0, 0, 0, 0.5)",
                                }}
                              >
                                Matchups
                              </h2>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-col items-center gap-3 md:mt-0 md:items-end">
                            <RefreshStatus
                              refreshing={isRefreshing}
                              countdown={countdown}
                              lastUpdated={lastUpdated}
                              centered={false}
                            />
                            <HardRefreshButton
                              onRefresh={handleHardRefresh}
                              disabled={isRefreshing}
                            />
                          </div>
                        </div>
                      </div>

                      <MatchupExplorer
                        players={players}
                        isRefreshing={isRefreshing}
                        onPlayerClick={handlePlayerClick}
                        refreshToken={lastUpdated?.getTime() || 0}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Matches Tab */}
              {activeTab === "matches" && (
                <div>
                  {matches.length === 0 && !showFilters && !hasActiveMatchSearch ? (
                    <div className="text-gray-400 text-center py-16 bg-gray-900 bg-opacity-50 rounded-2xl">
                      <p className="text-2xl font-bold">
                        No battles have been fought yet!
                      </p>
                      <p className="mt-2 text-lg">
                        Start playing some matches to see the battle history
                      </p>
                    </div>
                  ) : (
                    <div className="bg-gradient-to-b from-gray-900 to-gray-800 rounded-2xl border border-gray-700 shadow-lg relative">
                      {/* Loading overlay when refreshing - removed to prevent blackout */}

                      <div className="px-6 py-5 bg-gradient-to-r from-red-600 to-red-700 flex items-center justify-between relative overflow-hidden rounded-t-2xl">
                        {/* Glare effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white to-transparent opacity-10 skew-x-12 transform -translate-x-full"></div>

                        <div className="flex flex-col md:flex-row items-center relative z-10 justify-between w-full">
                          <div className="flex items-center space-x-2">
                            <Swords
                              className="mr-3 text-yellow-500"
                              size={24}
                              style={{
                                filter:
                                  "drop-shadow(0 0 5px rgba(255, 215, 0, 0.5))",
                              }}
                            />
                            <div>
                              <h2
                                className="text-2xl font-bold text-white"
                                style={{
                                  textShadow: "0 0 10px rgba(0, 0, 0, 0.5)",
                                }}
                              >
                                Match History
                              </h2>
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={`p-2 rounded-lg transition-colors duration-200 ${
                                  showFilters
                                    ? "bg-blue-600 text-white"
                                    : "bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white"
                                }`}
                                title="Toggle Filters"
                              >
                                <Filter size={20} />
                              </button>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-col items-center gap-3 md:mt-0 md:items-end">
                            <RefreshStatus
                              refreshing={isRefreshing}
                              countdown={countdown}
                              lastUpdated={lastUpdated}
                              centered={false}
                              autoRefreshDisabled={autoRefreshDisabled}
                            />
                            <HardRefreshButton
                              onRefresh={handleHardRefresh}
                              disabled={isRefreshing}
                            />
                          </div>
                        </div>
                      </div>

                      <div
                        className={`p-6 transition-opacity duration-300 ${
                          isRefreshing ? "opacity-50" : "opacity-100"
                        }`}
                      >
                        {shouldShowMatchIdSearchBar && (
                          <div className="mb-6 rounded-xl border border-gray-700 bg-gray-800/90 p-4">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                              <div className="flex-1">
                                <label className="mb-2 block text-sm font-medium text-gray-300">
                                  Jump to Match ID
                                </label>
                                <div className="flex flex-col gap-3 sm:flex-row">
                                  <div className="relative flex-1">
                                    <Search
                                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                                      size={16}
                                    />
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      value={matchIdSearchInput}
                                      onChange={(event) => {
                                        setMatchIdSearchInput(
                                          event.target.value.replace(/\D/g, "")
                                        );
                                        if (matchSearchError) {
                                          setMatchSearchError(null);
                                        }
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          void handleMatchIdSearch();
                                        }
                                      }}
                                      placeholder="Search a specific match_id"
                                      className="w-full rounded-lg border border-gray-600 bg-gray-700 py-2 pl-10 pr-3 text-white transition-colors duration-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                  <button
                                    onClick={handleMatchIdSearch}
                                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white transition-colors duration-200 hover:bg-blue-700"
                                  >
                                    <Search size={16} />
                                    Search Match
                                  </button>
                                  {(trimmedMatchIdSearchInput ||
                                    isMatchContextActive) && (
                                    <button
                                      onClick={clearMatchIdSearch}
                                      className="inline-flex items-center justify-center rounded-lg bg-gray-600 px-5 py-2 font-semibold text-white transition-colors duration-200 hover:bg-gray-500"
                                    >
                                      Clear Search
                                    </button>
                                  )}
                                </div>
                                <p className="mt-2 text-sm text-gray-400">
                                  Shows the requested match with 2 matches above
                                  it and 2 below it. Use the load buttons to keep
                                  expanding in either direction.
                                </p>
                                {matchSearchError && (
                                  <p className="mt-2 text-sm font-medium text-red-400">
                                    {matchSearchError}
                                  </p>
                                )}
                              </div>
                              {isMatchContextActive && (
                                <div className="rounded-lg border border-blue-500/40 bg-blue-950/40 px-4 py-3 text-sm text-blue-100">
                                  Showing context around Match #{matchContextId}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Filter Section */}
                        {showFilters && (
                          <>
                            <div className="mb-6 bg-gray-800 rounded-lg p-4 border border-gray-700">
                              <h3 className="text-lg font-semibold text-white mb-4">
                                Filter Matches
                              </h3>
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
                                {/* Player Filter */}
                                <div>
                                  <PlayerDropdown
                                    players={players}
                                    selectedIds={selectedPlayerFilter}
                                    onChange={setSelectedPlayerFilter}
                                    placeholder="All players"
                                    label="Players"
                                    multiple
                                  />
                                </div>

                                {/* Character Filter */}
                                <div>
                                  <CharacterDropdown
                                    characters={Array.from(
                                      new Set(
                                        matches.flatMap((match) =>
                                          match.participants.map(
                                            (participant) =>
                                              participant.smash_character
                                          )
                                        )
                                      )
                                    ).sort()}
                                    selectedValues={selectedCharacterFilter}
                                    onChange={setSelectedCharacterFilter}
                                    placeholder="Any character"
                                    label="Characters"
                                    multiple
                                  />
                                </div>
                              </div>

                              {/* Additional Filters */}
                              <div className="lg:col-span-2 space-y-4">
                                {/* 1v1 Filter */}
                                <label className="flex items-center space-x-2 p-3 bg-gray-700 border border-gray-600 rounded-lg cursor-pointer hover:bg-gray-600">
                                  <input
                                    type="checkbox"
                                    checked={only1v1}
                                    onChange={(e) =>
                                      setOnly1v1(e.target.checked)
                                    }
                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                  />
                                  <span className="text-white font-medium">
                                    Show only 1v1 matches (2 players)
                                  </span>
                                </label>
                              </div>

                              {/* Search and Clear Buttons */}
                              <div className="flex justify-center gap-4 mt-6">
                                <button
                                  onClick={handleSearch}
                                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors duration-200 flex items-center gap-2"
                                >
                                  <Swords size={16} />
                                  Search
                                </button>
                                <button
                                  onClick={async () => {
                                    setSelectedPlayerFilter([]);
                                    setSelectedCharacterFilter([]);
                                    setOnly1v1(false);
                                    setMatchIdSearchInput("");
                                    setMatchContextId(null);
                                    setMatchSearchError(null);
                                    setMatchesPage(1);
                                    setHasMoreMatchesAbove(false);
                                    setHasMoreMatchesBelow(false);
                                    setAutoRefreshDisabled(false);
                                    updateMatchesURL([], [], false);
                                    await fetchMatches(1, false, [], [], false);
                                  }}
                                  className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors duration-200"
                                >
                                  Clear All
                                </button>
                              </div>
                            </div>
                          </>
                        )}

                        {matches.length === 0 ? (
                          <div className="text-gray-400 text-center py-16">
                            <p className="text-xl font-bold">
                              {matchSearchError
                                ? "Match lookup failed"
                                : "No matches found with current filters"}
                            </p>
                            <p className="mt-2">
                              {matchSearchError
                                ? "Try a different match ID or clear the match search to return to the full list."
                                : "Try adjusting your filters or clear them to see all matches"}
                            </p>
                          </div>
                        ) : (
                          <>
                            {isMatchContextActive &&
                              (loadingMatchesAbove || hasMoreMatchesAbove) && (
                              <div className="mb-4 flex justify-center">
                                <button
                                  onClick={() =>
                                    loadMoreMatchContext("above")
                                  }
                                  disabled={
                                    loadingMatchesAbove || !hasMoreMatchesAbove
                                  }
                                  className="inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-5 py-2 font-semibold text-white transition-colors duration-200 hover:bg-gray-700 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800/60 disabled:text-gray-400"
                                >
                                  {loadingMatchesAbove ? (
                                    <>
                                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                      <span>Loading newer matches...</span>
                                    </>
                                  ) : (
                                    <span>Load More Above</span>
                                  )}
                                </button>
                              </div>
                            )}

                            <div className="space-y-4">
                              {matches.map((match) => {
                                const playerIds = match.participants.map((participant) =>
                                  participant.player.toString()
                                );

                                return (
                                  <MatchCard
                                    key={match.id}
                                    match={match}
                                    players={players}
                                    showUtcTime={showUtcTime}
                                    onToggleTime={() => setShowUtcTime(!showUtcTime)}
                                    onPlayerClick={handlePlayerClick}
                                    headerActions={
                                      <>
                                        {(() => {
                                          const isExactMatch =
                                            selectedPlayerFilter.length ===
                                              playerIds.length &&
                                            playerIds.every((id) =>
                                              selectedPlayerFilter.includes(id)
                                            ) &&
                                            selectedPlayerFilter.every((id) =>
                                              playerIds.includes(id)
                                            );

                                          if (isExactMatch) return null;

                                          return (
                                            <button
                                              onClick={() => {
                                                const is1v1 =
                                                  playerIds.length === 2;
                                                const nextMatchId =
                                                  isMatchContextActive
                                                    ? match.id.toString()
                                                    : "";
                                                setSelectedPlayerFilter(playerIds);
                                                setSelectedCharacterFilter([]);
                                                setOnly1v1(is1v1);
                                                setMatchIdSearchInput(nextMatchId);
                                                setShowFilters(true);
                                                setTimeout(async () => {
                                                  setMatchesPage(1);
                                                  if (nextMatchId) {
                                                    updateMatchesURL(
                                                      playerIds,
                                                      [],
                                                      is1v1,
                                                      nextMatchId
                                                    );
                                                    await fetchMatchContext(
                                                      nextMatchId,
                                                      playerIds,
                                                      [],
                                                      is1v1
                                                    );
                                                    return;
                                                  }

                                                  updateMatchesURL(
                                                    playerIds,
                                                    [],
                                                    is1v1
                                                  );
                                                  await fetchMatches(
                                                    1,
                                                    false,
                                                    playerIds,
                                                    [],
                                                    is1v1
                                                  );
                                                }, 100);
                                              }}
                                              className="hidden rounded bg-gray-600 px-2 py-1 text-xs font-medium text-white transition-colors duration-200 hover:bg-gray-500 sm:block"
                                            >
                                              Filter for this matchup
                                            </button>
                                          );
                                        })()}

                                        <button
                                          onClick={() => refreshSingleMatch(match.id)}
                                          disabled={refreshingMatches.has(match.id)}
                                          className="flex items-center gap-1 rounded bg-gray-600 px-2 py-1 text-xs font-medium text-white transition-colors duration-200 hover:bg-gray-500 disabled:cursor-not-allowed disabled:bg-gray-500"
                                          title="Refresh this match"
                                        >
                                          {refreshingMatches.has(match.id) ? (
                                            <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent"></div>
                                          ) : (
                                            <svg
                                              className="h-3 w-3"
                                              fill="none"
                                              stroke="currentColor"
                                              viewBox="0 0 24 24"
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                              />
                                            </svg>
                                          )}
                                        </button>
                                      </>
                                    }
                                  />
                                );
                              })}
                            </div>

                            {isMatchContextActive ? (
                              <div className="mt-6 flex justify-center">
                                {(loadingMatchesBelow || hasMoreMatchesBelow) && (
                                  <button
                                    onClick={() =>
                                      loadMoreMatchContext("below")
                                    }
                                    disabled={
                                      loadingMatchesBelow || !hasMoreMatchesBelow
                                    }
                                    className="inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-5 py-2 font-semibold text-white transition-colors duration-200 hover:bg-gray-700 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800/60 disabled:text-gray-400"
                                  >
                                    {loadingMatchesBelow ? (
                                      <>
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                        <span>Loading older matches...</span>
                                      </>
                                    ) : (
                                      <span>Load More Below</span>
                                    )}
                                  </button>
                                )}
                              </div>
                            ) : (
                              hasMoreMatches && (
                                <div className="flex justify-center mt-6">
                                  <button
                                    onClick={loadMoreMatches}
                                    disabled={loadingMoreMatches}
                                    className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 flex items-center space-x-2 shadow-lg"
                                  >
                                    {loadingMoreMatches ? (
                                      <>
                                        <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                                        <span>Loading more matches...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Swords size={20} />
                                        <span>Load More Matches</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              )
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Players Tab */}
              {activeTab === "players" && (
                <div>
                  {sortedPlayers.length === 0 ? (
                    <div className="text-gray-400 text-center py-16 bg-gray-900 bg-opacity-50 rounded-2xl">
                      <p className="text-2xl font-bold">
                        No fighters have joined the roster yet!
                      </p>
                      <p className="mt-2 text-lg">
                        Add some players to see their detailed profiles
                      </p>
                    </div>
                  ) : (
                    <div className="bg-gradient-to-b from-gray-900 to-gray-800 rounded-2xl border border-gray-700 shadow-lg relative">
                      {/* Loading overlay when refreshing */}
                      {refreshing && (
                        <div className="absolute inset-0 bg-black bg-opacity-20 z-10 flex items-center justify-center backdrop-blur-sm rounded-2xl">
                          <div className="bg-gray-800 bg-opacity-90 px-6 py-3 rounded-full flex items-center space-x-3 border border-gray-600">
                            <div className="animate-spin h-5 w-5 border-2 border-yellow-500 border-t-transparent rounded-full"></div>
                            <span className="text-white font-medium">
                              Updating player profiles...
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="px-6 py-5 bg-gradient-to-r from-red-600 to-red-700 flex items-center justify-between relative overflow-hidden rounded-t-2xl">
                        {/* Glare effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white to-transparent opacity-10 skew-x-12 transform -translate-x-full"></div>

                        <div className="flex flex-col md:flex-row items-center relative z-10 justify-between w-full">
                          <div className="flex items-center space-x-2">
                            <Users
                              className="mr-3 text-yellow-500"
                              size={24}
                              style={{
                                filter:
                                  "drop-shadow(0 0 5px rgba(255, 215, 0, 0.5))",
                              }}
                            />
                            <div>
                              <h2
                                className="text-2xl font-bold text-white"
                                style={{
                                  textShadow: "0 0 10px rgba(0, 0, 0, 0.5)",
                                }}
                              >
                                Fighter Profiles
                              </h2>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-col items-center gap-3 md:mt-0 md:items-end">
                            <RefreshStatus
                              refreshing={isRefreshing}
                              countdown={countdown}
                              lastUpdated={lastUpdated}
                              centered={false}
                            />
                            <HardRefreshButton
                              onRefresh={handleHardRefresh}
                              disabled={isRefreshing}
                            />
                          </div>
                        </div>
                      </div>

                      <div
                        className={`p-6 transition-opacity duration-300 ${
                          isRefreshing ? "opacity-75" : "opacity-100"
                        }`}
                      >
                        {/* Ranked Players Section */}
                        {playersTabRankedPlayers.length > 0 && (
                          <div className="mb-8">
                            <h3 className="text-xl font-bold text-white mb-4 px-2">
                              Ranked Players ({playersTabRankedPlayers.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {playersTabRankedPlayers.map((player, index) => {
                                const winRate =
                                  player.total_wins &&
                                  player.total_wins +
                                    (player.total_losses || 0) >
                                    0
                                    ? (
                                        (player.total_wins /
                                          (player.total_wins +
                                            (player.total_losses || 0))) *
                                        100
                                      ).toFixed(1)
                                    : "0.0";

                                return (
                                  <div
                                    key={player.id}
                                    id={`player-${player.id}`}
                                    className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:transform hover:scale-105 shadow-lg relative overflow-hidden"
                                  >
                                    {/* Rank badge */}
                                    <div className="absolute top-4 right-4">
                                      <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-black px-3 py-1 rounded-full text-sm font-bold shadow-lg">
                                        #{index + 1}
                                      </div>
                                    </div>

                                    {/* Player Avatar and Info */}
                                    <div className="flex flex-col items-center mb-6">
                                      <div className="relative mb-4">
                                        <ProfilePicture
                                          player={player}
                                          size="xl"
                                          borderWidth="border-4"
                                          additionalClasses="shadow-xl bg-gradient-to-br from-gray-600 to-gray-700"
                                        />
                                      </div>

                                      <div className="flex items-center justify-center mb-1">
                                        <h3 className="text-xl font-bold text-white text-center">
                                          {player.display_name || player.name}
                                        </h3>
                                        {player.country &&
                                          isValidCountryCode(
                                            player.country
                                          ) && (
                                            <ReactCountryFlag
                                              countryCode={player.country.toUpperCase()}
                                              svg
                                              style={{
                                                width: "2rem",
                                                height: "1.5rem",
                                                marginLeft: "0.5rem",
                                              }}
                                            />
                                          )}
                                        <FireStreak
                                          streak={
                                            player.current_win_streak || 0
                                          }
                                        />
                                      </div>

                                      {/* ELO Display - only for ranked players */}
                                      {player.is_ranked && (
                                        <div className="bg-gray-700 px-4 py-2 rounded-full mb-2">
                                          <span className="text-yellow-500 font-bold text-lg">
                                            {player.elo} ELO
                                          </span>
                                        </div>
                                      )}

                                      {/* Main Character */}
                                      {player.main_character && (
                                        <div className="bg-blue-900 bg-opacity-50 px-3 py-1 rounded-full border border-blue-500 flex items-center gap-2">
                                          <span className="text-blue-300 text-sm font-medium">
                                            Main: {player.main_character}
                                          </span>
                                          <CharacterIcon
                                            characterName={
                                              player.main_character
                                            }
                                            size="sm"
                                            className="flex-shrink-0"
                                          />
                                        </div>
                                      )}

                                      {/* Ranking Status */}
                                      <div
                                        className={`px-3 py-1 rounded-full border mt-2 ${
                                          player.is_ranked
                                            ? "bg-green-900 bg-opacity-50 border-green-500"
                                            : "bg-orange-900 bg-opacity-50 border-orange-500"
                                        }`}
                                      >
                                        <span
                                          className={`text-sm font-medium ${
                                            player.is_ranked
                                              ? "text-green-300"
                                              : "text-orange-300"
                                          }`}
                                        >
                                          {player.is_ranked
                                            ? "Ranked Player"
                                            : `${player.top_ten_played}/3 vs Top 10`}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Stats Section */}
                                    <div className="space-y-4">
                                      {/* Win/Loss Record */}
                                      <div className="bg-gray-700 bg-opacity-50 rounded-lg p-4">
                                        <h4 className="text-gray-300 text-sm font-semibold mb-3 uppercase tracking-wide">
                                          Match Record
                                        </h4>
                                        <div className="flex justify-between items-center mb-2">
                                          <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                            <span className="text-green-400 font-bold">
                                              Wins
                                            </span>
                                          </div>
                                          <span className="text-white font-bold text-lg">
                                            {player.total_wins || 0}
                                          </span>
                                        </div>
                                        <div className="flex justify-between items-center mb-3">
                                          <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                            <span className="text-red-400 font-bold">
                                              Losses
                                            </span>
                                          </div>
                                          <span className="text-white font-bold text-lg">
                                            {player.total_losses || 0}
                                          </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                          <span className="text-gray-400 font-medium">
                                            Win Rate
                                          </span>
                                          <span className="text-yellow-400 font-bold">
                                            {winRate}%
                                          </span>
                                        </div>
                                      </div>

                                      {/* Combat Stats */}
                                      <div className="bg-gray-700 bg-opacity-50 rounded-lg p-4">
                                        <h4 className="text-gray-300 text-sm font-semibold mb-3 uppercase tracking-wide">
                                          Combat Stats
                                        </h4>
                                        <div className="grid grid-cols-3 gap-4 text-center">
                                          <div>
                                            <div className="text-orange-400 font-bold text-lg">
                                              {player.total_kos || 0}
                                            </div>
                                            <div className="text-gray-400 text-xs uppercase">
                                              KOs
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-purple-400 font-bold text-lg">
                                              {player.total_falls || 0}
                                            </div>
                                            <div className="text-gray-400 text-xs uppercase">
                                              Falls
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-red-400 font-bold text-lg">
                                              {player.total_sds || 0}
                                            </div>
                                            <div className="text-gray-400 text-xs uppercase">
                                              SDs
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Additional Stats */}
                                      <div className="grid grid-cols-2 gap-2 text-center">
                                        <div className="bg-gray-700 bg-opacity-30 rounded-lg p-2">
                                          <div className="text-blue-400 font-bold">
                                            {player.matches}
                                          </div>
                                          <div className="text-gray-400 text-xs">
                                            Matches
                                          </div>
                                        </div>
                                        <div className="bg-gray-700 bg-opacity-30 rounded-lg p-2">
                                          <div className="text-cyan-400 font-bold">
                                            {(player.total_kos || 0) > 0 &&
                                            (player.total_falls || 0) +
                                              (player.total_sds || 0) >
                                              0
                                              ? (
                                                  (player.total_kos || 0) /
                                                  ((player.total_falls || 0) +
                                                    (player.total_sds || 0))
                                                ).toFixed(2)
                                              : "0.00"}
                                          </div>
                                          <div className="text-gray-400 text-xs">
                                            K/D Ratio
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Card Actions */}
                                    <div className="mt-4 space-y-2 border-t border-gray-600 pt-4">
                                      <button
                                        onClick={() =>
                                          handleViewTopCharacters(player.id)
                                        }
                                        className="w-full rounded-lg border border-indigo-400/40 bg-indigo-500/20 px-4 py-2 text-sm font-semibold text-indigo-100 transition-colors duration-200 hover:bg-indigo-500/30 hover:text-white"
                                      >
                                        View Top Characters
                                      </button>
                                      <button
                                        onClick={() => {
                                          setSelectedPlayerFilter([
                                            player.id.toString(),
                                          ]);
                                          setSelectedCharacterFilter([]);
                                          setShowFilters(true);
                                          const params = new URLSearchParams();
                                          params.append(
                                            "player",
                                            serializePlayerIdToQueryValue(
                                              player.id,
                                              players
                                            )
                                          );
                                          router.push(
                                            `/matches?${params.toString()}`
                                          );
                                        }}
                                        className="w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors duration-200 hover:bg-blue-700"
                                      >
                                        View Match History
                                      </button>
                                    </div>

                                    {/* Decorative elements */}
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-yellow-500 to-transparent opacity-50"></div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Unranked Players Section */}
                        {sortedUnrankedPlayers.length > 0 && (
                          <div>
                            <h3 className="text-xl font-bold text-white mb-4 px-2">
                              Unranked Players ({sortedUnrankedPlayers.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {sortedUnrankedPlayers.map((player) => {
                                const winRate =
                                  player.total_wins &&
                                  player.total_wins +
                                    (player.total_losses || 0) >
                                    0
                                    ? (
                                        (player.total_wins /
                                          (player.total_wins +
                                            (player.total_losses || 0))) *
                                        100
                                      ).toFixed(1)
                                    : "0.0";

                                return (
                                  <div
                                    key={player.id}
                                    id={`player-${player.id}`}
                                    className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:transform hover:scale-105 shadow-lg relative overflow-hidden"
                                  >
                                    {/* No rank badge for unranked players */}

                                    {/* Player Avatar and Info */}
                                    <div className="flex flex-col items-center mb-6">
                                      <div className="relative mb-4">
                                        <ProfilePicture
                                          player={player}
                                          size="xl"
                                          borderWidth="border-4"
                                          additionalClasses="shadow-xl bg-gradient-to-br from-gray-600 to-gray-700"
                                        />
                                      </div>

                                      <div className="flex items-center justify-center mb-1">
                                        <h3 className="text-xl font-bold text-white text-center">
                                          {player.display_name || player.name}
                                        </h3>
                                        {player.country &&
                                          isValidCountryCode(
                                            player.country
                                          ) && (
                                            <ReactCountryFlag
                                              countryCode={player.country.toUpperCase()}
                                              svg
                                              style={{
                                                width: "2rem",
                                                height: "1.5rem",
                                                marginLeft: "0.5rem",
                                              }}
                                            />
                                          )}
                                        <FireStreak
                                          streak={
                                            player.current_win_streak || 0
                                          }
                                        />
                                      </div>

                                      {/* No ELO for unranked players */}

                                      {/* Main Character */}
                                      {player.main_character && (
                                        <div className="bg-blue-900 bg-opacity-50 px-3 py-1 rounded-full border border-blue-500 flex items-center gap-2">
                                          <span className="text-blue-300 text-sm font-medium">
                                            Main: {player.main_character}
                                          </span>
                                          <CharacterIcon
                                            characterName={
                                              player.main_character
                                            }
                                            size="sm"
                                            className="flex-shrink-0"
                                          />
                                        </div>
                                      )}

                                      {/* Ranking Status */}
                                      <div className="bg-orange-900 bg-opacity-50 px-3 py-1 rounded-full border border-orange-500 mt-2">
                                        <span className="text-orange-300 text-sm font-medium">
                                          {player.top_ten_played}/3 vs Top 10
                                        </span>
                                      </div>
                                    </div>

                                    {/* Stats Section */}
                                    <div className="space-y-4">
                                      {/* Win/Loss Record */}
                                      <div className="bg-gray-700 bg-opacity-50 rounded-lg p-4">
                                        <h4 className="text-gray-300 text-sm font-semibold mb-3 uppercase tracking-wide">
                                          Match Record
                                        </h4>
                                        <div className="flex justify-between items-center mb-2">
                                          <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                            <span className="text-green-400 font-bold">
                                              Wins
                                            </span>
                                          </div>
                                          <span className="text-white font-bold text-lg">
                                            {player.total_wins || 0}
                                          </span>
                                        </div>
                                        <div className="flex justify-between items-center mb-3">
                                          <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                            <span className="text-red-400 font-bold">
                                              Losses
                                            </span>
                                          </div>
                                          <span className="text-white font-bold text-lg">
                                            {player.total_losses || 0}
                                          </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                          <span className="text-gray-400 font-medium">
                                            Win Rate
                                          </span>
                                          <span className="text-yellow-400 font-bold">
                                            {winRate}%
                                          </span>
                                        </div>
                                      </div>

                                      {/* Combat Stats */}
                                      <div className="bg-gray-700 bg-opacity-50 rounded-lg p-4">
                                        <h4 className="text-gray-300 text-sm font-semibold mb-3 uppercase tracking-wide">
                                          Combat Stats
                                        </h4>
                                        <div className="grid grid-cols-3 gap-4 text-center">
                                          <div>
                                            <div className="text-orange-400 font-bold text-lg">
                                              {player.total_kos || 0}
                                            </div>
                                            <div className="text-gray-400 text-xs uppercase">
                                              KOs
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-purple-400 font-bold text-lg">
                                              {player.total_falls || 0}
                                            </div>
                                            <div className="text-gray-400 text-xs uppercase">
                                              Falls
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-red-400 font-bold text-lg">
                                              {player.total_sds || 0}
                                            </div>
                                            <div className="text-gray-400 text-xs uppercase">
                                              SDs
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Additional Stats */}
                                      <div className="grid grid-cols-2 gap-2 text-center">
                                        <div className="bg-gray-700 bg-opacity-30 rounded-lg p-2">
                                          <div className="text-blue-400 font-bold">
                                            {player.matches}
                                          </div>
                                          <div className="text-gray-400 text-xs">
                                            Matches
                                          </div>
                                        </div>
                                        <div className="bg-gray-700 bg-opacity-30 rounded-lg p-2">
                                          <div className="text-cyan-400 font-bold">
                                            {(player.total_kos || 0) > 0 &&
                                            (player.total_falls || 0) +
                                              (player.total_sds || 0) >
                                              0
                                              ? (
                                                  (player.total_kos || 0) /
                                                  ((player.total_falls || 0) +
                                                    (player.total_sds || 0))
                                                ).toFixed(2)
                                              : "0.00"}
                                          </div>
                                          <div className="text-gray-400 text-xs">
                                            K/D Ratio
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Card Actions */}
                                    <div className="mt-4 space-y-2 border-t border-gray-600 pt-4">
                                      <button
                                        onClick={() =>
                                          handleViewTopCharacters(player.id)
                                        }
                                        className="w-full rounded-lg border border-indigo-400/40 bg-indigo-500/20 px-4 py-2 text-sm font-semibold text-indigo-100 transition-colors duration-200 hover:bg-indigo-500/30 hover:text-white"
                                      >
                                        View Top Characters
                                      </button>
                                      <button
                                        onClick={() => {
                                          setSelectedPlayerFilter([
                                            player.id.toString(),
                                          ]);
                                          setSelectedCharacterFilter([]);
                                          setShowFilters(true);
                                          const params = new URLSearchParams();
                                          params.append(
                                            "player",
                                            serializePlayerIdToQueryValue(
                                              player.id,
                                              players
                                            )
                                          );
                                          router.push(
                                            `/matches?${params.toString()}`
                                          );
                                        }}
                                        className="w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors duration-200 hover:bg-blue-700"
                                      >
                                        View Match History
                                      </button>
                                    </div>

                                    {/* Decorative elements */}
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent opacity-50"></div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>

        {/* Footer */}
        <footer className="mt-12 mb-6 text-center">
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl px-6 py-4 border border-gray-700 shadow-lg max-w-md mx-auto">
            <p className="text-gray-300 text-sm">
              Made with{" "}
              <span className="text-red-500 animate-pulse text-lg">❤️</span> by{" "}
              <a
                href="https://twitter.com/haseab_"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 font-semibold transition-colors duration-200 hover:underline"
              >
                haseab
              </a>
              ,{" "}
              <a
                href="https://twitter.com/subby_tech"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 font-semibold transition-colors duration-200 hover:underline"
              >
                subby
              </a>
              , and{" "}
              <a
                href="https://twitter.com/thiteanish"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 font-semibold transition-colors duration-200 hover:underline"
              >
                anish
              </a>
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
