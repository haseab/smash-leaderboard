"use client";

import CharacterProfilePicture from "@/components/CharacterProfilePicture";
import { getMatchWinnerStocksRemaining } from "@/lib/matchOutcomeFilters";
import React from "react";

export interface MatchCardParticipant {
  id: number;
  player: number;
  player_name: string | null;
  player_display_name: string | null;
  smash_character: string;
  elo_diff?: number | null;
  is_cpu: boolean;
  total_kos: number;
  total_falls: number;
  total_sds: number;
  has_won: boolean;
}

export interface MatchCardMatch {
  id: number;
  created_at: string;
  participants: MatchCardParticipant[];
}

export interface MatchCardPlayerRecord {
  id: number;
  picture?: string | null;
}

interface MatchCardProps {
  match: MatchCardMatch;
  players: MatchCardPlayerRecord[];
  showUtcTime: boolean;
  onToggleTime: () => void;
  onPlayerClick: (playerId: number) => void;
  headerActions?: React.ReactNode;
  className?: string;
}

type WinnerStockBadge = {
  playerId: number;
  label: "3-stock" | "2-stock";
  variant: "gold" | "silver";
};

const getParticipantDisplayName = (participant: MatchCardParticipant) =>
  participant.player_display_name?.trim() ||
  participant.player_name?.trim() ||
  `Player ${participant.player}`;

const getInitials = (name: string | null | undefined) => {
  const normalizedName = name?.trim();

  if (!normalizedName) {
    return "?";
  }

  return normalizedName
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

const formatEloDiff = (eloDiff: number) =>
  `${eloDiff > 0 ? "+" : ""}${eloDiff} ELO`;

const getWinnerStockBadge = (
  participants: MatchCardParticipant[],
): WinnerStockBadge | null => {
  if (participants.length !== 2) {
    return null;
  }

  const winner = participants.find((participant) => participant.has_won);

  if (!winner) {
    return null;
  }

  const winnerStocksRemaining = getMatchWinnerStocksRemaining(participants);

  if (winnerStocksRemaining === null) {
    return null;
  }

  if (winnerStocksRemaining === 3) {
    return { playerId: winner.player, label: "3-stock", variant: "gold" };
  }

  if (winnerStocksRemaining === 2) {
    return { playerId: winner.player, label: "2-stock", variant: "silver" };
  }

  return null;
};

const getWinnerStockBadgeClasses = (variant: WinnerStockBadge["variant"]) =>
  variant === "gold"
    ? "border-yellow-300 bg-yellow-500/20 text-yellow-100 shadow-yellow-500/20"
    : "border-slate-300 bg-slate-200/20 text-slate-100 shadow-slate-400/20";

const getEloDiffBadgeClasses = (eloDiff: number) =>
  eloDiff > 0
    ? "border-green-300 bg-green-500/15 text-green-200"
    : eloDiff < 0
      ? "border-red-300 bg-red-500/15 text-red-200"
      : "border-gray-500 bg-gray-700/60 text-gray-200";

function MatchStatChip({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number;
  valueClassName: string;
}) {
  return (
    <div className="inline-flex h-7 w-full items-center justify-between gap-1.5 rounded-full border border-white/10 bg-black/20 px-2 text-xs text-gray-300 shadow-sm">
      <span className="text-[9px] font-semibold uppercase leading-none tracking-[0.12em] text-gray-300/70">
        {label}
      </span>
      <span className={`text-sm font-bold leading-none ${valueClassName}`}>
        {value}
      </span>
    </div>
  );
}

function MatchPlayerAvatar({
  participant,
  picture,
}: {
  participant: MatchCardParticipant;
  picture?: string | null;
}) {
  const displayName = getParticipantDisplayName(participant);
  const accentClasses = participant.has_won
    ? "border-green-400 bg-green-600"
    : "border-red-400 bg-red-600";

  if (picture) {
    return (
      <div
        className={`h-14 w-14 overflow-hidden rounded-full border-2 ${accentClasses}`}
      >
        <img
          src={picture}
          alt={displayName}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex h-14 w-14 items-center justify-center rounded-full border-2 text-sm font-bold text-white ${accentClasses}`}
    >
      {getInitials(displayName)}
    </div>
  );
}

export default function MatchCard({
  match,
  players,
  showUtcTime,
  onToggleTime,
  onPlayerClick,
  headerActions,
  className = "",
}: MatchCardProps) {
  const participants = [...match.participants].sort((a, b) => {
    if (a.has_won && !b.has_won) return -1;
    if (!a.has_won && b.has_won) return 1;
    return 0;
  });
  const winnerStockBadge = getWinnerStockBadge(participants);

  const getParticipantCardClasses = (hasWon: boolean) =>
    hasWon
      ? "border-green-400/70 bg-gray-900/80 shadow-lg shadow-black/20 ring-1 ring-green-400/10"
      : "border-red-500/70 bg-gray-900/80 shadow-lg shadow-black/20 ring-1 ring-red-500/10";

  const getPlayerNameTextClasses = (hasWon: boolean) =>
    hasWon ? "text-green-400" : "text-red-300";

  return (
    <div
      className={`rounded-xl border border-gray-700 bg-gray-800 p-4 transition-colors hover:border-gray-600 ${className}`}
    >
      <div className="flex flex-col space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-400">
            <span className="font-medium text-gray-300">Match #{match.id}</span>
            {" • "}
            <button
              type="button"
              onClick={onToggleTime}
              className="transition-colors duration-200 hover:text-gray-200 hover:underline hover:underline-offset-2"
              title={
                showUtcTime
                  ? "Click to show local time"
                  : "Click to show UTC time"
              }
            >
              {showUtcTime
                ? new Date(match.created_at).toLocaleDateString("en-US", {
                    timeZone: "UTC",
                  })
                : new Date(match.created_at).toLocaleDateString()}{" "}
              •{" "}
              {showUtcTime
                ? `${new Date(match.created_at).toLocaleTimeString("en-US", {
                    timeZone: "UTC",
                  })} UTC`
                : new Date(match.created_at).toLocaleTimeString()}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="font-medium text-gray-500">
              {participants.length} Player{participants.length > 1 ? "s" : ""}
            </div>
            {headerActions}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {participants.map((participant) => {
            const picture =
              players.find((player) => player.id === participant.player)
                ?.picture || null;
            const participantWinnerStockBadge =
              winnerStockBadge?.playerId === participant.player
                ? winnerStockBadge
                : null;

            return (
              <div
                key={participant.id}
                className={`flex w-full rounded-lg border px-4 py-4 transition-all ${getParticipantCardClasses(
                  participant.has_won,
                )}`}
              >
                <div className="flex min-w-0 flex-1 items-stretch justify-between gap-4">
                  <div className="flex min-w-0 flex-1 items-center gap-8">
                    <div className="relative shrink-0">
                      <MatchPlayerAvatar
                        participant={participant}
                        picture={picture}
                      />
                      <div className="absolute -bottom-1 -right-5">
                        <CharacterProfilePicture
                          characterName={participant.smash_character}
                          size="sm"
                          className={`h-9 w-9 border-2 ${
                            participant.has_won
                              ? "border-green-400"
                              : "border-red-400"
                          }`}
                        />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onPlayerClick(participant.player)}
                          className={`min-w-0 truncate text-left text-xl font-extrabold leading-none transition-colors hover:text-yellow-400 ${getPlayerNameTextClasses(
                            participant.has_won,
                          )}`}
                        >
                          {getParticipantDisplayName(participant)}
                        </button>
                      </div>

                      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <div className="min-w-0 max-w-full truncate text-base font-extrabold uppercase leading-tight tracking-[0.08em] text-gray-200">
                          {participant.smash_character}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {participant.elo_diff !== null &&
                        participant.elo_diff !== undefined ? (
                          <span
                            className={`inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-sm font-bold leading-none whitespace-nowrap ${getEloDiffBadgeClasses(
                              participant.elo_diff,
                            )}`}
                          >
                            {formatEloDiff(participant.elo_diff)}
                          </span>
                        ) : null}

                        {participantWinnerStockBadge ? (
                          <span
                            className={`inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-sm font-bold leading-none whitespace-nowrap shadow-md ${getWinnerStockBadgeClasses(
                              participantWinnerStockBadge.variant,
                            )}`}
                          >
                            {participantWinnerStockBadge.label}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-stretch gap-3">
                    <div className="flex w-[4.5rem] flex-col justify-center gap-1.5">
                      <MatchStatChip
                        label="KOs"
                        value={participant.total_kos || 0}
                        valueClassName="text-orange-300"
                      />
                      <MatchStatChip
                        label="Falls"
                        value={participant.total_falls || 0}
                        valueClassName="text-purple-300"
                      />
                      <MatchStatChip
                        label="SDs"
                        value={participant.total_sds || 0}
                        valueClassName="text-red-300"
                      />
                    </div>

                    <div className="flex h-full w-12 items-start justify-center pt-1">
                      <img
                        src={
                          participant.has_won
                            ? "/images/no1.png"
                            : "/images/no2.png"
                        }
                        alt={participant.has_won ? "Winner" : "Loser"}
                        className="h-11 w-11 object-contain"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
