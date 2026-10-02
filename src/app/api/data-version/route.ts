import { randomUUID } from "node:crypto";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Use the same persistent cache and invalidation tags as the data, rather than
// process memory. Cache eviction/restarts may cause a harmless extra refresh.
const getDataVersion = unstable_cache(
  async () => randomUUID(),
  ["leaderboard-data-version-v1"],
  { tags: ["players", "matches"] }
);

export async function GET() {
  return NextResponse.json(
    { version: await getDataVersion() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
