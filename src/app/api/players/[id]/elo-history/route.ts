import { getPlayerEloHistory, parseEloHistoryRange } from "@/lib/eloHistory";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const playerId = Number.parseInt(id, 10);

    if (!Number.isInteger(playerId) || playerId <= 0) {
      return NextResponse.json({ error: "Invalid player ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const range = parseEloHistoryRange(searchParams.get("range"));
    const points = await getPlayerEloHistory(BigInt(playerId), range);

    if (!points) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    return NextResponse.json({
      playerId,
      range,
      points,
    });
  } catch (error) {
    console.error(
      "[GET /api/players/[id]/elo-history] Error fetching Elo history:",
      error
    );
    return NextResponse.json(
      { error: "Failed to fetch Elo history" },
      { status: 500 }
    );
  }
}
