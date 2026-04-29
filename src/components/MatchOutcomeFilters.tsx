"use client";

import {
  DEFAULT_MATCH_OUTCOME_FILTERS,
  type MatchOutcomeFilterState,
  type MatchResultFilter,
  type MatchStockFilter,
} from "@/lib/matchOutcomeFilters";
import { Check } from "lucide-react";

interface MatchOutcomeFiltersProps {
  value: MatchOutcomeFilterState;
  onChange: (nextValue: MatchOutcomeFilterState) => void;
  className?: string;
  resultLabel?: string;
  stockLabel?: string;
  winLabel?: string;
  lossLabel?: string;
  resultDisabled?: boolean;
  resultDisabledMessage?: string;
  compact?: boolean;
}

const resultOptions: Array<{ value: MatchResultFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "wins", label: "Wins" },
  { value: "losses", label: "Losses" },
];

const stockOptions: Array<{ value: MatchStockFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "3", label: "3" },
  { value: "2", label: "2" },
  { value: "1", label: "1" },
];

const getButtonClasses = (active: boolean, disabled = false) =>
  [
    "inline-flex h-9 min-w-12 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors",
    active
      ? "bg-blue-600 text-white shadow-sm"
      : "text-gray-300 hover:bg-gray-700 hover:text-white",
    disabled ? "cursor-not-allowed opacity-45 hover:bg-transparent" : "",
  ]
    .filter(Boolean)
    .join(" ");

export default function MatchOutcomeFilters({
  value,
  onChange,
  className = "",
  resultLabel = "Result",
  stockLabel = "Winner stocks left",
  winLabel = "Wins",
  lossLabel = "Losses",
  resultDisabled = false,
  resultDisabledMessage,
  compact = false,
}: MatchOutcomeFiltersProps) {
  const setResult = (result: MatchResultFilter) => {
    onChange({ ...value, result });
  };

  const setStock = (stock: MatchStockFilter) => {
    onChange({ ...value, stock });
  };

  const clearFilters = () => {
    onChange(DEFAULT_MATCH_OUTCOME_FILTERS);
  };

  const hasActiveFilters =
    value.result !== DEFAULT_MATCH_OUTCOME_FILTERS.result ||
    value.stock !== DEFAULT_MATCH_OUTCOME_FILTERS.stock;

  return (
    <div
      className={`flex flex-col gap-4 ${
        compact ? "lg:flex-row lg:items-start lg:justify-between" : ""
      } ${className}`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold text-gray-400">
            {resultLabel}
          </div>
          <div className="inline-flex rounded-xl border border-gray-700 bg-gray-900/75 p-1">
            {resultOptions.map((option) => {
              const isActive = value.result === option.value;
              const isDisabled =
                resultDisabled && option.value !== DEFAULT_MATCH_OUTCOME_FILTERS.result;
              const label =
                option.value === "wins"
                  ? winLabel
                  : option.value === "losses"
                    ? lossLabel
                    : option.label;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setResult(option.value)}
                  disabled={isDisabled}
                  aria-pressed={isActive}
                  className={getButtonClasses(isActive, isDisabled)}
                >
                  {isActive && <Check size={14} />}
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
          {resultDisabled && resultDisabledMessage && (
            <div className="mt-2 text-xs text-gray-500">
              {resultDisabledMessage}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold text-gray-400">
            {stockLabel}
          </div>
          <div className="inline-flex rounded-xl border border-gray-700 bg-gray-900/75 p-1">
            {stockOptions.map((option) => {
              const isActive = value.stock === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStock(option.value)}
                  aria-pressed={isActive}
                  className={getButtonClasses(isActive)}
                >
                  {isActive && <Check size={14} />}
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Applies to completed 1v1 matches.
          </div>
        </div>
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex h-9 w-fit items-center justify-center rounded-lg border border-gray-600 bg-gray-800 px-3 text-sm font-semibold text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
        >
          Clear result filters
        </button>
      )}
    </div>
  );
}
