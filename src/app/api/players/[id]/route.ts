import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const playerId = Number.parseInt(id, 10);

    if (!Number.isInteger(playerId) || playerId <= 0) {
      return NextResponse.json({ error: "Invalid player ID" }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as
      | { banned?: boolean }
      | null;

    if (!body || typeof body.banned !== "boolean") {
      return NextResponse.json(
        { error: "A boolean banned value is required" },
        { status: 400 }
      );
    }

    const result = await prisma.players.updateMany({
      where: {
        id: BigInt(playerId),
      },
      data: {
        banned: body.banned,
      },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    revalidateTag("players", "max");
    revalidateTag("matches", "max");

    return NextResponse.json({
      id: playerId,
      banned: body.banned,
    });
  } catch (error) {
    console.error("[PATCH /api/players/[id]] Error updating player:", error);
    return NextResponse.json(
      { error: "Failed to update player" },
      { status: 500 }
    );
  }
}
