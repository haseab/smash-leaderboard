"use client";

import { type MouseEvent, useId, useState } from "react";

export interface EloHistoryPoint {
  t: string;
  elo: number;
  matchId?: number;
}

interface EloHistoryChartProps {
  points: EloHistoryPoint[];
  fallbackElo: number;
  height?: number;
  compact?: boolean;
  framed?: boolean;
  showTooltip?: boolean;
}

const CHART_WIDTH = 320;
const CHART_HEIGHT = 120;
const CHART_PADDING = 12;
const FALLBACK_TIME = "1970-01-01T00:00:00.000Z";

const getPointTime = (point: EloHistoryPoint) => {
  const parsed = new Date(point.t).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildChartPoints = (
  points: EloHistoryPoint[],
  fallbackElo: number,
  fallbackTime: string
) => {
  if (points.length > 1) {
    return points;
  }

  if (points.length === 1) {
    const pointTime = getPointTime(points[0]) || Date.now();
    return [
      { t: new Date(pointTime - 1).toISOString(), elo: points[0].elo },
      { t: new Date(pointTime + 1).toISOString(), elo: points[0].elo },
    ];
  }

  return [
    {
      t: new Date(getPointTime({ t: fallbackTime, elo: fallbackElo }) - 1)
        .toISOString(),
      elo: fallbackElo,
    },
    { t: fallbackTime, elo: fallbackElo },
  ];
};

const buildPath = (coordinates: Array<{ x: number; y: number }>) =>
  coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

const getNearestPointIndex = (
  x: number,
  coordinates: Array<{ x: number }>
) => {
  if (coordinates.length === 0) {
    return null;
  }

  return coordinates.reduce((nearestIndex, point, index) => {
    const nearestDistance = Math.abs(coordinates[nearestIndex].x - x);
    const currentDistance = Math.abs(point.x - x);

    return currentDistance < nearestDistance ? index : nearestIndex;
  }, 0);
};

const formatTooltipDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

export default function EloHistoryChart({
  points,
  fallbackElo,
  height = 90,
  compact = false,
  framed = true,
  showTooltip = true,
}: EloHistoryChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(
    null
  );
  const chartPoints = buildChartPoints(points, fallbackElo, FALLBACK_TIME);
  const tooltipPoints = points;
  const elos = chartPoints.map((point) => point.elo);
  const times = chartPoints.map(getPointTime);
  const minElo = Math.min(...elos, fallbackElo);
  const maxElo = Math.max(...elos, fallbackElo);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const eloRange = maxElo - minElo || 1;
  const timeRange = maxTime - minTime || 1;
  const yPadding = Math.max(8, eloRange * 0.12);
  const lineColor =
    chartPoints[chartPoints.length - 1].elo >= chartPoints[0].elo
      ? "#22c55e"
      : "#ef4444";

  const getCoordinate = (
    point: EloHistoryPoint,
    index: number,
    pointCount: number
  ) => {
    const x =
      maxTime === minTime
        ? CHART_PADDING +
          ((CHART_WIDTH - CHART_PADDING * 2) *
            (pointCount === 1 ? 0.5 : index)) /
            Math.max(pointCount - 1, 1)
        : CHART_PADDING +
          ((getPointTime(point) - minTime) / timeRange) *
            (CHART_WIDTH - CHART_PADDING * 2);
    const y =
      CHART_HEIGHT -
      CHART_PADDING -
      ((point.elo - (minElo - yPadding)) / (eloRange + yPadding * 2)) *
        (CHART_HEIGHT - CHART_PADDING * 2);

    return { x, y };
  };

  const coordinates = chartPoints.map((point, index) =>
    getCoordinate(point, index, chartPoints.length)
  );
  const tooltipCoordinates = tooltipPoints.map((point, index) => ({
    ...getCoordinate(point, index, tooltipPoints.length),
    point,
  }));
  const hoveredPoint =
    hoveredPointIndex === null
      ? null
      : tooltipCoordinates[hoveredPointIndex] || null;
  const showVisiblePoints = !compact && tooltipCoordinates.length <= 48;
  const handleChartMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    if (!showTooltip || tooltipCoordinates.length === 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const cursorX =
      ((event.clientX - rect.left) / Math.max(rect.width, 1)) * CHART_WIDTH;
    const clampedX = Math.min(
      CHART_WIDTH - CHART_PADDING,
      Math.max(CHART_PADDING, cursorX)
    );
    const nearestIndex = getNearestPointIndex(clampedX, tooltipCoordinates);

    setHoveredPointIndex(nearestIndex);
  };

  const linePath = buildPath(coordinates);
  const areaPath =
    coordinates.length > 0
      ? `${linePath} L ${coordinates[coordinates.length - 1].x} ${
          CHART_HEIGHT - CHART_PADDING
        } L ${coordinates[0].x} ${CHART_HEIGHT - CHART_PADDING} Z`
      : "";

  return (
    <div
      className={`relative w-full overflow-visible ${
        framed
          ? "rounded-lg border border-gray-700 bg-gray-950/50"
          : "rounded-md"
      }`}
      onMouseLeave={() => setHoveredPointIndex(null)}
    >
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        style={{ height }}
        className="block w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="ELO history chart"
        onMouseMove={handleChartMouseMove}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.34" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line
          x1={CHART_PADDING}
          x2={CHART_WIDTH - CHART_PADDING}
          y1={CHART_HEIGHT - CHART_PADDING}
          y2={CHART_HEIGHT - CHART_PADDING}
          stroke="#334155"
          strokeWidth="1"
        />
        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={lineColor}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={compact ? 3 : 2.5}
          />
        )}
        {showVisiblePoints &&
          tooltipCoordinates.map((point, index) => (
            <circle
              key={`${point.x}-${point.y}-${index}`}
              cx={point.x}
              cy={point.y}
              r={compact ? 1.7 : 2.6}
              fill={framed ? "#0f172a" : "#111827"}
              stroke={lineColor}
              strokeWidth={compact ? 1.2 : 1.5}
              opacity={compact ? 0.78 : 1}
            />
          ))}
        {showTooltip &&
          hoveredPoint && (
            <>
              <line
                x1={hoveredPoint.x}
                x2={hoveredPoint.x}
                y1={CHART_PADDING}
                y2={CHART_HEIGHT - CHART_PADDING}
                stroke="#94a3b8"
                strokeDasharray="3 4"
                strokeOpacity="0.42"
                strokeWidth="1"
                pointerEvents="none"
              />
            </>
          )}
        {showTooltip && tooltipCoordinates.length > 0 && (
          <rect
            x={CHART_PADDING}
            y="0"
            width={CHART_WIDTH - CHART_PADDING * 2}
            height={CHART_HEIGHT}
            fill="transparent"
            className="cursor-crosshair"
            pointerEvents="all"
            aria-hidden="true"
          />
        )}
      </svg>
      {showTooltip && hoveredPoint && (
        <div
          className="pointer-events-none absolute z-10 h-3 w-3 rounded-full border-2 bg-gray-950 shadow-[0_0_0_5px_rgba(34,197,94,0.14)]"
          style={{
            borderColor: lineColor,
            left: `${(hoveredPoint.x / CHART_WIDTH) * 100}%`,
            top: `${(hoveredPoint.y / CHART_HEIGHT) * 100}%`,
            transform: "translate(-50%, -50%)",
          }}
        />
      )}
      {showTooltip && hoveredPoint && (
        <div
          className="pointer-events-none absolute z-20 min-w-max rounded-md border border-gray-600 bg-gray-950 px-2.5 py-1.5 text-xs shadow-xl shadow-black/40"
          style={{
            left: `${Math.min(
              96,
              Math.max(4, (hoveredPoint.x / CHART_WIDTH) * 100)
            )}%`,
            top: `${Math.min(
              88,
              Math.max(8, (hoveredPoint.y / CHART_HEIGHT) * 100)
            )}%`,
            transform: "translate(-50%, calc(-100% - 10px))",
          }}
        >
          <div className="font-semibold text-white">
            {hoveredPoint.point.elo} ELO
          </div>
          <div className="text-gray-400">
            {formatTooltipDate(hoveredPoint.point.t)}
          </div>
        </div>
      )}
    </div>
  );
}
