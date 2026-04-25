"use client";

import CharacterProfilePicture from "@/components/CharacterProfilePicture";
import { Check, ChevronDown, Search, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

interface CharacterDropdownProps {
  characters: string[];
  selectedValues: string[];
  onChange: (nextSelectedValues: string[]) => void;
  label?: string;
  placeholder: string;
  multiple?: boolean;
  disabled?: boolean;
}

const normalizeCharacters = (characters: string[]) =>
  Array.from(new Set(characters.map((character) => character.trim()).filter(Boolean))).sort();

export default function CharacterDropdown({
  characters,
  selectedValues,
  onChange,
  label,
  placeholder,
  multiple = false,
  disabled = false,
}: CharacterDropdownProps) {
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

  const normalizedOptions = normalizeCharacters([...characters, ...selectedValues]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredCharacters = normalizedOptions.filter((character) =>
    normalizedQuery ? character.toLowerCase().includes(normalizedQuery) : true
  );

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1);
      return;
    }

    if (filteredCharacters.length === 0) {
      setActiveIndex(-1);
      return;
    }

    if (normalizedQuery) {
      setActiveIndex(0);
      return;
    }

    const selectedIndex =
      selectedValues.length > 0
        ? filteredCharacters.findIndex(
            (character) => character === selectedValues[0]
          )
        : -1;

    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [filteredCharacters, isOpen, normalizedQuery, selectedValues]);

  const handleToggleCharacter = (character: string) => {
    if (disabled) {
      return;
    }

    if (!multiple) {
      onChange(selectedValues[0] === character ? [] : [character]);
      setIsOpen(false);
      setQuery("");
      return;
    }

    if (selectedValues.includes(character)) {
      onChange(selectedValues.filter((value) => value !== character));
      return;
    }

    onChange([...selectedValues, character]);
  };

  const clearSelection = () => {
    onChange([]);
    setQuery("");
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (filteredCharacters.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        current < filteredCharacters.length - 1 ? current + 1 : 0
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        current > 0 ? current - 1 : filteredCharacters.length - 1
      );
      return;
    }

    if (event.key === "Enter") {
      if (activeIndex < 0) {
        return;
      }

      event.preventDefault();
      const activeCharacter = filteredCharacters[activeIndex];
      if (activeCharacter) {
        handleToggleCharacter(activeCharacter);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${isOpen ? "z-[180]" : "z-20"}`}
    >
      {label ? (
        <label className="mb-3 block text-sm font-medium text-gray-300">
          {label}
          {multiple ? ` (${selectedValues.length} selected)` : ""}
        </label>
      ) : null}

      <button
        type="button"
        onClick={() => !disabled && setIsOpen((current) => !current)}
        disabled={disabled}
        className="flex min-h-[3.5rem] w-full items-center justify-between rounded-xl border border-gray-600 bg-gray-700/95 px-4 py-3 text-left text-white transition-colors duration-200 hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <div className="min-w-0 flex-1">
          {selectedValues.length === 0 ? (
            <span className="text-gray-400">{placeholder}</span>
          ) : multiple ? (
            <div className="flex flex-wrap gap-1.5">
              {selectedValues.slice(0, 2).map((character) => (
                <span
                  key={character}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white"
                >
                  <CharacterProfilePicture
                    characterName={character}
                    size="sm"
                    className="h-5 w-5 border-white/30"
                    alt={character}
                  />
                  <span>{character}</span>
                </span>
              ))}
              {selectedValues.length > 2 && (
                <span className="inline-flex items-center rounded-md bg-gray-600 px-2 py-1 text-xs font-medium text-white">
                  +{selectedValues.length - 2} more
                </span>
              )}
            </div>
          ) : (
            <span className="flex items-center gap-2 truncate">
              <CharacterProfilePicture
                characterName={selectedValues[0]}
                size="sm"
                className="h-6 w-6 border-gray-400"
                alt={selectedValues[0]}
              />
              <span className="truncate">{selectedValues[0]}</span>
            </span>
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
                placeholder="Search characters"
                autoFocus
                className="w-full rounded-xl border border-gray-600 bg-gray-900 py-2.5 pl-10 pr-3 text-sm text-white outline-none transition-colors focus:border-blue-500"
              />
            </div>

            {selectedValues.length > 0 && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs font-medium text-gray-400">
                  {selectedValues.length} selected
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
            {filteredCharacters.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-gray-400">
                No characters found.
              </div>
            ) : (
              filteredCharacters.map((character, index) => {
                const isSelected = selectedValues.includes(character);
                const isActive = index === activeIndex;

                return (
                  <button
                    key={character}
                    type="button"
                    onClick={() => handleToggleCharacter(character)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "bg-blue-600/20 text-white"
                        : isActive
                        ? "bg-gray-700 text-white"
                        : "text-gray-200 hover:bg-gray-700"
                    }`}
                  >
                    <CharacterProfilePicture
                      characterName={character}
                      size="sm"
                      className="h-9 w-9 border-gray-500"
                      alt={character}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{character}</div>
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
