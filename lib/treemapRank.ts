import type { TreemapHistoryPoint } from "@/lib/data/headlineEvents";

export type RankPeriod = "day" | "week" | "month";

export function rankPointsForPeriod(
  history: TreemapHistoryPoint[],
  period: RankPeriod,
): TreemapHistoryPoint[] {
  const points = [...history];
  // JOUR : les passes de la journée en cours, soit jusqu'à six points. La table
  // journalière porte tout l'historique, d'où le filtre sur la dernière date
  // plutôt qu'un `slice`. Un seul point ne trace rien : on élargit alors aux
  // six dernières passes, quitte à déborder sur la veille.
  if (period === "day") {
    const dernierJour = points.at(-1)?.date ?? "";
    const duJour = points.filter((point) => point.date === dernierJour);
    return duJour.length > 1 ? duJour : points.slice(-6);
  }
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
