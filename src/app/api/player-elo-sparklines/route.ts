import {
  type BatchedEloHistoryRange,
  getBatchedPlayerEloHistories,
  parseEloHistoryRange,
} from "@/lib/eloHistory";
import { jsonWithApiDebug } from "@/lib/server/apiDebug";
import { unstable_cache } from "next/cache";

const SPARKLINE_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=30, stale-while-revalidate=300",
};

const getCachedSevenDayPlayerEloHistories = unstable_cache(
  () => getBatchedPlayerEloHistories("7d"),
  ["player-elo-sparklines-7d-v1"],
  {
    tags: ["players", "matches"],
  }
);

const getCachedThirtyDayPlayerEloHistories = unstable_cache(
  () => getBatchedPlayerEloHistories("30d"),
  ["player-elo-sparklines-30d-v1"],
  {
    tags: ["players", "matches"],
  }
);

const getCachedPlayerEloHistories = (range: BatchedEloHistoryRange) =>
  range === "7d"
    ? getCachedSevenDayPlayerEloHistories()
    : getCachedThirtyDayPlayerEloHistories();

export async function GET(request: Request) {
  const startedAt = performance.now();

  try {
    const { searchParams } = new URL(request.url);
    const parsedRange = parseEloHistoryRange(searchParams.get("range"), "30d");
    const range = parsedRange === "7d" ? "7d" : "30d";
    const histories = await getCachedPlayerEloHistories(range);
    const playerCount = Object.keys(histories).length;
    const pointCount = Object.values(histories).reduce(
      (total, points) => total + points.length,
      0
    );

    return jsonWithApiDebug(
      "/api/player-elo-sparklines",
      request,
      startedAt,
      {
        range,
        histories,
      },
      { headers: SPARKLINE_CACHE_HEADERS },
      { range, playerCount, pointCount, source: "unstable_cache" }
    );
  } catch (error) {
    console.error(
      "[GET /api/player-elo-sparklines] Error fetching Elo sparklines:",
      error
    );
    return jsonWithApiDebug(
      "/api/player-elo-sparklines",
      request,
      startedAt,
      { error: "Failed to fetch Elo sparklines" },
      { status: 500 },
      { reason: "exception" }
    );
  }
}
