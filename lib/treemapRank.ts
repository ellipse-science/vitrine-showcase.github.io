import type { TreemapHistoryPoint } from "@/lib/data/headlineEvents";

export type RankPeriod = "week" | "month";

export function rankPointsForPeriod(
  history: TreemapHistoryPoint[],
  period: RankPeriod,
): TreemapHistoryPoint[] {
  const points = [...history];
  if (period === "week") return points.slice(-7);

  const latestMonth = points.at(-1)?.date.slice(0, 7) ?? "";
  const inMonth = points.filter((point) => point.date.slice(0, 7) === latestMonth);
  return inMonth.length > 1 ? inMonth : points.slice(-30);
}

export function rankMovement(points: TreemapHistoryPoint[], issueKey: string) {
  const startRank = points[0]?.ranks[issueKey] ?? 12;
  const endRank = points.at(-1)?.ranks[issueKey] ?? 12;
  return {
    startRank,
    endRank,
    delta: startRank - endRank,
  };
}
