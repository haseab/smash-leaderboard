"use client";

import CharacterProfilePicture from "@/components/CharacterProfilePicture";
import React from "react";

export interface MatchCardParticipant {
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

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((segment) => segment[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

function MatchPlayerAvatar({
  participant,
  picture,
}: {
  participant: MatchCardParticipant;
  picture?: string | null;
}) {
  const displayName = participant.player_display_name || participant.player_name;
  const accentClasses = participant.has_won
    ? "border-green-400 bg-green-600"
    : "border-red-400 bg-red-600";

  if (picture) {
    return (
      <div
        className={`h-10 w-10 overflow-hidden rounded-full border-2 ${accentClasses}`}
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
      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-bold text-white ${accentClasses}`}
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

  const getParticipantCardClasses = (hasWon: boolean) =>
    hasWon
      ? "border-green-400 bg-green-800/60 shadow-lg shadow-green-500/20"
      : "border-red-500 bg-red-800/60";

  const getCharacterTextClasses = (hasWon: boolean) =>
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
              title={showUtcTime ? "Click to show local time" : "Click to show UTC time"}
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
              players.find((player) => player.id === participant.player)?.picture ||
              null;

            return (
              <div
                key={participant.id}
                className={`flex w-full flex-col space-y-3 rounded-lg border px-4 py-3 transition-all ${getParticipantCardClasses(
                  participant.has_won
                )}`}
              >
                <div className="flex items-center justify-between space-x-9">
                  <div className="flex items-center">
                    <div className="relative">
                      <MatchPlayerAvatar
                        participant={participant}
                        picture={picture}
                      />
                      <div className="absolute bottom-0 -right-6">
                        <CharacterProfilePicture
                          characterName={participant.smash_character}
                          size="sm"
                          className={`h-6 w-6 border-2 ${
                            participant.has_won
                              ? "border-green-400"
                              : "border-red-400"
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onPlayerClick(participant.player)}
                      className="truncate text-left font-semibold text-white transition-colors hover:text-yellow-400"
                    >
                      {participant.player_display_name || participant.player_name}
                    </button>
                    <div
                      className={`flex items-center gap-2 text-sm font-medium ${getCharacterTextClasses(
                        participant.has_won
                      )}`}
                    >
                      {participant.smash_character}
                    </div>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center">
                    <img
                      src={participant.has_won ? "/images/no1.png" : "/images/no2.png"}
                      alt={participant.has_won ? "Winner" : "Loser"}
                      className="h-8 w-8 object-contain"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded bg-black px-2 py-1">
                    <div className="text-lg font-bold text-orange-400">
                      {participant.total_kos || 0}
                    </div>
                    <div className="text-gray-400">KOs</div>
                  </div>
                  <div className="rounded bg-black px-2 py-1">
                    <div className="text-lg font-bold text-purple-400">
                      {participant.total_falls || 0}
                    </div>
                    <div className="text-gray-400">Falls</div>
                  </div>
                  <div className="rounded bg-black px-2 py-1">
                    <div className="text-lg font-bold text-red-400">
                      {participant.total_sds || 0}
                    </div>
                    <div className="text-gray-400">SDs</div>
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
