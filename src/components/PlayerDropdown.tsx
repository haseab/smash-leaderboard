"use client";

import { getPlayerQueryLabel } from "@/lib/playerQuery";
import { Check, ChevronDown, Search, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

export interface PlayerDropdownPlayer {
  id: number | string;
  name: string | null;
  display_name: string | null;
  picture?: string | null;
}

interface PlayerDropdownProps {
  players: PlayerDropdownPlayer[];
  selectedIds: string[];
  onChange: (nextSelectedIds: string[]) => void;
  label: string;
  placeholder: string;
  multiple?: boolean;
  disabled?: boolean;
  hideLabel?: boolean;
}

const getInitials = (player: PlayerDropdownPlayer) =>
  getPlayerQueryLabel(player)
    .split(" ")
    .map((segment) => segment[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

export default function PlayerDropdown({
  players,
  selectedIds,
  onChange,
  label,
  placeholder,
  multiple = false,
  disabled = false,
  hideLabel = false,
}: PlayerDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredPlayers = players.filter((player) => {
    if (!normalizedQuery) {
      return true;
    }

    const labelValue = getPlayerQueryLabel(player).toLowerCase();
    return (
      labelValue.includes(normalizedQuery) ||
      String(player.id).toLowerCase().includes(normalizedQuery)
    );
  });

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1);
      return;
    }

    if (filteredPlayers.length === 0) {
      setActiveIndex(-1);
      return;
    }

    if (normalizedQuery) {
      setActiveIndex(0);
      return;
    }

    const selectedIndex =
      selectedIds.length > 0
        ? filteredPlayers.findIndex(
            (player) => String(player.id) === selectedIds[0]
          )
        : -1;

    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [filteredPlayers, isOpen, normalizedQuery, selectedIds]);

  const selectedPlayers = selectedIds
    .map((selectedId) =>
      players.find((player) => String(player.id) === selectedId)
    )
    .filter((player): player is PlayerDropdownPlayer => Boolean(player));

  const handleTogglePlayer = (playerId: string) => {
    if (disabled) {
      return;
    }

    if (!multiple) {
      onChange(selectedIds[0] === playerId ? [] : [playerId]);
      setIsOpen(false);
      setQuery("");
      return;
    }

    if (selectedIds.includes(playerId)) {
      onChange(selectedIds.filter((selectedId) => selectedId !== playerId));
      return;
    }

    onChange([...selectedIds, playerId]);
  };

  const clearSelection = () => {
    onChange([]);
    setQuery("");
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (filteredPlayers.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        current < filteredPlayers.length - 1 ? current + 1 : 0
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        current > 0 ? current - 1 : filteredPlayers.length - 1
      );
      return;
    }

    if (event.key === "Enter") {
      if (activeIndex < 0) {
        return;
      }

      event.preventDefault();
      const activePlayer = filteredPlayers[activeIndex];
      if (activePlayer) {
        handleTogglePlayer(String(activePlayer.id));
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${isOpen ? "z-[180]" : "z-20"}`}
    >
      {!hideLabel && (
        <label className="mb-3 block text-sm font-medium text-gray-300">
          {label}
          {multiple ? ` (${selectedIds.length} selected)` : ""}
        </label>
      )}

      <button
        type="button"
        onClick={() => !disabled && setIsOpen((current) => !current)}
        disabled={disabled}
        className="flex min-h-[3.5rem] w-full items-center justify-between rounded-xl border border-gray-600 bg-gray-700/95 px-4 py-3 text-left text-white transition-colors duration-200 hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <div className="min-w-0 flex-1">
          {selectedPlayers.length === 0 ? (
            <span className="text-gray-400">{placeholder}</span>
          ) : multiple ? (
            <div className="flex flex-wrap gap-1.5">
              {selectedPlayers.slice(0, 2).map((player) => (
                <span
                  key={player.id}
                  className="inline-flex items-center rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white"
                >
                  {getPlayerQueryLabel(player)}
                </span>
              ))}
              {selectedPlayers.length > 2 && (
                <span className="inline-flex items-center rounded-md bg-gray-600 px-2 py-1 text-xs font-medium text-white">
                  +{selectedPlayers.length - 2} more
                </span>
              )}
            </div>
          ) : (
            <span className="truncate">{getPlayerQueryLabel(selectedPlayers[0])}</span>
          )}
        </div>
        <ChevronDown className="ml-3 h-4 w-4 flex-shrink-0 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[160] overflow-hidden rounded-2xl border border-gray-700 bg-gray-800 shadow-2xl">
          <div className="border-b border-gray-700 p-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                size={16}
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search players"
                autoFocus
                className="w-full rounded-xl border border-gray-600 bg-gray-900 py-2.5 pl-10 pr-3 text-sm text-white outline-none transition-colors focus:border-blue-500"
              />
            </div>

            {selectedIds.length > 0 && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs font-medium text-gray-400">
                  {selectedIds.length} selected
                </div>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-gray-300 transition-colors hover:text-white"
                >
                  <X size={12} />
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {filteredPlayers.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-gray-400">
                No players found.
              </div>
            ) : (
              filteredPlayers.map((player, index) => {
                const playerId = String(player.id);
                const isSelected = selectedIds.includes(playerId);
                const isActive = index === activeIndex;

                return (
                  <button
                    key={playerId}
                    type="button"
                    onClick={() => handleTogglePlayer(playerId)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "bg-blue-600/20 text-white"
                        : isActive
                        ? "bg-gray-700 text-white"
                        : "text-gray-200 hover:bg-gray-700"
                    }`}
                  >
                    {player.picture ? (
                      <img
                        src={player.picture}
                        alt={getPlayerQueryLabel(player)}
                        className="h-9 w-9 rounded-full border border-gray-500 object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-500 bg-gray-700 text-xs font-bold text-white">
                        {getInitials(player)}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {getPlayerQueryLabel(player)}
                      </div>
                      <div className="text-xs text-gray-400">
                        Player #{playerId}
                      </div>
                    </div>

                    {isSelected && <Check className="h-4 w-4 text-blue-300" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
