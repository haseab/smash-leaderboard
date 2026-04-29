"use client";

export interface DateRangePreset<T extends string = string> {
  value: T;
  label: string;
}

interface DateRangeFilterBarProps<T extends string = string> {
  label?: string;
  presets?: Array<DateRangePreset<T>>;
  selectedPreset?: T;
  onPresetSelect?: (preset: T) => void;
  rangeLabel: string;
  startDate: string;
  endDate: string;
  onStartDateChange: (nextDate: string) => void;
  onEndDateChange: (nextDate: string) => void;
  error?: string | null;
  loading?: boolean;
  loadingLabel?: string;
  showClear?: boolean;
  clearLabel?: string;
  onClear?: () => void;
  className?: string;
}

export default function DateRangeFilterBar<T extends string = string>({
  label = "Date",
  presets = [],
  selectedPreset,
  onPresetSelect,
  rangeLabel,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  error,
  loading = false,
  loadingLabel = "Refreshing",
  showClear = false,
  clearLabel = "Clear Dates",
  onClear,
  className = "",
}: DateRangeFilterBarProps<T>) {
  return (
    <div
      className={`rounded-2xl border border-gray-700 bg-gray-900/80 px-4 py-3 shadow-lg ${className}`}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
            {label}
          </span>
          {presets.length > 0 && onPresetSelect && (
            <div className="flex flex-wrap rounded-full border border-gray-700 bg-black/20 p-1">
              {presets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => onPresetSelect(preset.value)}
                  className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors ${
                    selectedPreset === preset.value
                      ? "bg-blue-600 text-white"
                      : "text-gray-300 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
          <div className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200">
            {rangeLabel}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span>Start</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => onStartDateChange(event.target.value)}
              className="h-9 w-36 rounded-full border border-gray-600 bg-gray-950 px-3 text-sm font-medium normal-case tracking-normal text-white outline-none transition-colors [color-scheme:dark] focus:border-blue-500"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span>End</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => onEndDateChange(event.target.value)}
              className="h-9 w-36 rounded-full border border-gray-600 bg-gray-950 px-3 text-sm font-medium normal-case tracking-normal text-white outline-none transition-colors [color-scheme:dark] focus:border-blue-500"
            />
          </label>
          {showClear && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-9 items-center justify-center rounded-full border border-gray-600 bg-gray-800 px-4 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
            >
              {clearLabel}
            </button>
          )}
          {loading && (
            <div className="rounded-full border border-blue-500/30 bg-blue-950/30 px-3 py-1.5 text-xs font-medium text-blue-100">
              {loadingLabel}
            </div>
          )}
        </div>
      </div>

      {error && <div className="mt-2 text-sm font-medium text-red-400">{error}</div>}
    </div>
  );
}
