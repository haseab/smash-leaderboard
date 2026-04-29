import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type EloHistoryRange = "7d" | "30d" | "1y" | "all";
export type BatchedEloHistoryRange = Extract<EloHistoryRange, "7d" | "30d">;

export interface EloHistoryPoint {
  t: string;
  elo: number;
  matchId?: number;
}

interface PlayerEloBaseline {
  id: bigint;
  elo: bigint;
}

interface EloDeltaRow {
  player_id: bigint;
  match_id: bigint;
  created_at: Date;
  elo_delta: number;
}

interface InternalEloPoint {
  t: Date;
  elo: number;
  matchId?: number;
}

interface ReconstructedPlayerHistory {
  currentElo: number;
  startElo: number;
  rawPoints: InternalEloPoint[];
}

interface Bucket {
  t: Date;
  end: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const parseEloHistoryRange = (
  value: string | null,
  fallback: EloHistoryRange = "30d"
): EloHistoryRange => {
  switch (value) {
    case "7d":
    case "30d":
    case "1y":
    case "all":
      return value;
    default:
      return fallback;
  }
};

const startOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const startOfUtcMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const addUtcDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * MS_PER_DAY);

const addUtcMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
};

const getRangeStart = (range: EloHistoryRange, now: Date) => {
  if (range === "7d") {
    return new Date(now.getTime() - 7 * MS_PER_DAY);
  }

  if (range === "30d") {
    return addUtcDays(startOfUtcDay(now), -29);
  }

  if (range === "1y") {
    return addUtcMonths(startOfUtcMonth(now), -11);
  }

  return null;
};

const serializePoint = (point: InternalEloPoint): EloHistoryPoint => ({
  t: point.t.toISOString(),
  elo: point.elo,
  ...(point.matchId ? { matchId: point.matchId } : {}),
});

const buildFlatSeries = (
  start: Date | null,
  now: Date,
  elo: number
): EloHistoryPoint[] => {
  if (!start) {
    return [{ t: now.toISOString(), elo }];
  }

  return [
    { t: start.toISOString(), elo },
    { t: now.toISOString(), elo },
  ];
};

const getDailyBuckets = (now: Date): Bucket[] => {
  const today = startOfUtcDay(now);

  return Array.from({ length: 30 }, (_, index) => {
    const dayStart = addUtcDays(today, index - 29);
    const nextDayStart = addUtcDays(dayStart, 1);

    return {
      t: dayStart,
      end: nextDayStart > now ? now : nextDayStart,
    };
  });
};

const getHalfMonthBuckets = (now: Date): Bucket[] => {
  const firstMonth = addUtcMonths(startOfUtcMonth(now), -11);
  const buckets: Bucket[] = [];

  for (let monthOffset = 0; monthOffset < 12; monthOffset += 1) {
    const monthStart = addUtcMonths(firstMonth, monthOffset);
    const monthMiddle = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 16)
    );
    const nextMonthStart = addUtcMonths(monthStart, 1);

    buckets.push({
      t: monthStart,
      end: monthMiddle > now ? now : monthMiddle,
    });

    if (monthMiddle <= now) {
      buckets.push({
        t: monthMiddle,
        end: nextMonthStart > now ? now : nextMonthStart,
      });
    }
  }

  return buckets.filter((bucket) => bucket.t <= now);
};

const getMonthlyBuckets = (history: ReconstructedPlayerHistory, now: Date) => {
  const firstPointDate = history.rawPoints[0]?.t || now;
  const firstMonth = startOfUtcMonth(firstPointDate);
  const currentMonth = startOfUtcMonth(now);
  const buckets: Bucket[] = [];

  for (
    let monthStart = firstMonth;
    monthStart <= currentMonth;
    monthStart = addUtcMonths(monthStart, 1)
  ) {
    const nextMonthStart = addUtcMonths(monthStart, 1);
    buckets.push({
      t: monthStart,
      end: nextMonthStart > now ? now : nextMonthStart,
    });
  }

  return buckets;
};

const sampleBuckets = (
  history: ReconstructedPlayerHistory,
  buckets: Bucket[]
): EloHistoryPoint[] => {
  const points: EloHistoryPoint[] = [];
  let pointIndex = 0;
  let bucketElo = history.startElo;

  for (const bucket of buckets) {
    while (
      pointIndex < history.rawPoints.length &&
      history.rawPoints[pointIndex].t <= bucket.end
    ) {
      bucketElo = history.rawPoints[pointIndex].elo;
      pointIndex += 1;
    }

    points.push({
      t: bucket.t.toISOString(),
      elo: bucketElo,
    });
  }

  return points;
};

const reconstructHistories = (
  baselines: PlayerEloBaseline[],
  rows: EloDeltaRow[]
) => {
  const histories: Record<string, ReconstructedPlayerHistory> = {};

  for (const baseline of baselines) {
    const playerId = baseline.id.toString();
    histories[playerId] = {
      currentElo: Number(baseline.elo),
      startElo: Number(baseline.elo),
      rawPoints: [],
    };
  }

  for (const row of rows) {
    const playerId = row.player_id.toString();
    const history = histories[playerId];

    if (!history) {
      continue;
    }

    history.rawPoints.unshift({
      t: row.created_at,
      elo: history.startElo,
      matchId: Number(row.match_id),
    });
    history.startElo -= row.elo_delta;
  }

  return histories;
};

const fetchPlayerBaselines = async (playerIds?: bigint[]) =>
  prisma.players.findMany({
    where: {
      banned: false,
      ...(playerIds ? { id: { in: playerIds } } : {}),
    },
    select: {
      id: true,
      elo: true,
    },
  });

const fetchEloDeltaRows = async (playerIds: bigint[], rangeStart: Date | null) => {
  if (playerIds.length === 0) {
    return [];
  }

  const rangeFilter = rangeStart
    ? Prisma.sql`AND m.created_at >= ${rangeStart}`
    : Prisma.empty;

  return prisma.$queryRaw<EloDeltaRow[]>(Prisma.sql`
    SELECT
      mp.player AS player_id,
      m.id AS match_id,
      m.created_at,
      mp.elo_diff::int AS elo_delta
    FROM match_participants mp
    JOIN matches m ON m.id = mp.match_id
    JOIN players p ON p.id = mp.player
    WHERE mp.player IN (${Prisma.join(playerIds)})
      AND mp.is_cpu = false
      AND mp.elo_diff IS NOT NULL
      AND m.archived = false
      AND p.banned = false
      ${rangeFilter}
    ORDER BY mp.player ASC, m.created_at DESC, m.id DESC
  `);
};

export const getBatchedPlayerEloHistories = async (
  range: BatchedEloHistoryRange
) => {
  const now = new Date();
  const rangeStart = getRangeStart(range, now);
  const baselines = await fetchPlayerBaselines();
  const playerIds = baselines.map((player) => player.id);
  const rows = await fetchEloDeltaRows(playerIds, rangeStart);
  const histories = reconstructHistories(baselines, rows);
  const responseHistories: Record<string, EloHistoryPoint[]> = {};

  for (const [playerId, history] of Object.entries(histories)) {
    if (range === "7d") {
      responseHistories[playerId] =
        history.rawPoints.length > 0
          ? history.rawPoints.map(serializePoint)
          : buildFlatSeries(rangeStart, now, history.currentElo);
      continue;
    }

    responseHistories[playerId] = sampleBuckets(history, getDailyBuckets(now));
  }

  return responseHistories;
};

export const getPlayerEloHistory = async (
  playerId: bigint,
  range: EloHistoryRange
) => {
  const now = new Date();
  const rangeStart = getRangeStart(range, now);
  const baselines = await fetchPlayerBaselines([playerId]);

  if (baselines.length === 0) {
    return null;
  }

  const rows = await fetchEloDeltaRows([playerId], rangeStart);
  const history = reconstructHistories(baselines, rows)[playerId.toString()];

  if (!history) {
    return null;
  }

  if (range === "7d") {
    return history.rawPoints.length > 0
      ? history.rawPoints.map(serializePoint)
      : buildFlatSeries(rangeStart, now, history.currentElo);
  }

  if (range === "30d") {
    return sampleBuckets(history, getDailyBuckets(now));
  }

  if (range === "1y") {
    return sampleBuckets(history, getHalfMonthBuckets(now));
  }

  return sampleBuckets(history, getMonthlyBuckets(history, now));
};
