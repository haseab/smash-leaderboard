import {
  type EloHistoryRange,
  getPlayerEloHistory,
  parseEloHistoryRange,
} from "@/lib/eloHistory";
import { jsonWithApiDebug } from "@/lib/server/apiDebug";
import { unstable_cache } from "next/cache";

const PLAYER_ELO_HISTORY_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=30, stale-while-revalidate=300",
};

const getCachedPlayerEloHistory = unstable_cache(
  (playerId: string, range: EloHistoryRange) =>
    getPlayerEloHistory(BigInt(playerId), range),
  ["player-elo-history-v1"],
  {
    tags: ["players", "matches"],
  }
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = performance.now();

  try {
    const { id } = await params;
    const playerId = Number.parseInt(id, 10);

    if (!Number.isInteger(playerId) || playerId <= 0) {
      return jsonWithApiDebug(
        "/api/players/[id]/elo-history",
        request,
        startedAt,
        { error: "Invalid player ID" },
        { status: 400 },
        { reason: "invalid-player-id" }
      );
    }

    const { searchParams } = new URL(request.url);
    const range = parseEloHistoryRange(searchParams.get("range"));
    const points = await getCachedPlayerEloHistory(String(playerId), range);

    if (!points) {
      return jsonWithApiDebug(
        "/api/players/[id]/elo-history",
        request,
        startedAt,
        { error: "Player not found" },
        { status: 404 },
        { playerId, range, reason: "player-not-found" }
      );
    }

    return jsonWithApiDebug(
      "/api/players/[id]/elo-history",
      request,
      startedAt,
      {
        playerId,
        range,
        points,
      },
      { headers: PLAYER_ELO_HISTORY_CACHE_HEADERS },
      {
        playerId,
        range,
        pointCount: points.length,
        source: "unstable_cache",
      }
    );
  } catch (error) {
    console.error(
      "[GET /api/players/[id]/elo-history] Error fetching Elo history:",
      error
    );
    return jsonWithApiDebug(
      "/api/players/[id]/elo-history",
      request,
      startedAt,
      { error: "Failed to fetch Elo history" },
      { status: 500 },
      { reason: "exception" }
    );
  }
}
