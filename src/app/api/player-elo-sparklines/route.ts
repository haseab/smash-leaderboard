import {
  getBatchedPlayerEloHistories,
  parseEloHistoryRange,
} from "@/lib/eloHistory";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsedRange = parseEloHistoryRange(searchParams.get("range"), "30d");
    const range = parsedRange === "7d" ? "7d" : "30d";
    const histories = await getBatchedPlayerEloHistories(range);

    return NextResponse.json({
      range,
      histories,
    });
  } catch (error) {
    console.error(
      "[GET /api/player-elo-sparklines] Error fetching Elo sparklines:",
      error
    );
    return NextResponse.json(
      { error: "Failed to fetch Elo sparklines" },
      { status: 500 }
    );
  }
}
