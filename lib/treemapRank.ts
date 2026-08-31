import type { TreemapHistoryPoint } from "@/lib/data/headlineEvents";
import { momentMontreal } from "@/lib/dates";
import { ELECTION_CALL_DATE } from "@/lib/election";

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
  if (period === "week") {
    const debut = debutDeLaSemaine(points);
    if (!debut) return points.slice(-7);
    return points.filter((point) => instantMontreal(point) >= debut);
  }

  // CAMPAGNE : depuis le déclenchement du scrutin, jamais depuis le début du
  // suivi. Tant que la date n'est pas connue (`null` hors période électorale),
  // on retombe sur le mois courant, le comportement d'avant.
  const bref = ELECTION_CALL_DATE;
  if (bref) {
    const depuisLeBref = points.filter((point) => jourMontreal(point) >= bref);
    if (depuisLeBref.length > 1) return depuisLeBref;
  }
  const latestMonth = points.at(-1) ? jourMontreal(points.at(-1)!).slice(0, 7) : "";
  const inMonth = points.filter((point) => jourMontreal(point).slice(0, 7) === latestMonth);
  return inMonth.length > 1 ? inMonth : points.slice(-30);
}

/** L'instant d'un point, en heure de Montréal, sous une forme comparable
 *  lexicographiquement : « 2026-08-29T04 ». Le `tag` est en UTC, d'où la
 *  conversion — comparer les tags bruts décalerait la frontière de 4 ou 5h
 *  selon la saison. */
/** Le JOUR d'une observation, en heure de Montréal, tiré du `tag` de la passe.
 *
 *  ⚠️ Surtout pas `point.date` : sur les tables hebdomadaire et mensuelle, un
 *  tag couvre PLUSIEURS jours (trois pour le dernier tag du 30-08) et `date`
 *  retient celle de la PREMIÈRE ligne du groupe — une date arbitraire prise au
 *  milieu de la fenêtre, pas le jour où la passe a tourné. L'axe des frises
 *  l'utilisait déjà, ce qui décalait ses étiquettes; filtrer dessus aurait
 *  découpé les fenêtres n'importe où. */
export function jourMontreal(point: TreemapHistoryPoint): string {
  return momentMontreal(point.tag)?.date ?? point.date;
}

function instantMontreal(point: TreemapHistoryPoint): string {
  const m = momentMontreal(point.tag);
  if (!m) return `${point.date}T00`;
  return `${m.date}T${String(m.heure).padStart(2, "0")}`;
}

/** Le début de la semaine en cours : le VENDREDI 20h le plus récent, à l'heure
 *  de Montréal (règle d'Adrien, 30-08). Une semaine du site ne suit donc ni le
 *  calendrier ni une fenêtre glissante de sept jours : elle commence quand la
 *  dernière édition du vendredi est publiée.
 *
 *  Calculé à partir du DERNIER point plutôt que de l'horloge : la frise doit
 *  décrire la période que les données couvrent, pas l'instant du build. */
export function debutDeLaSemaine(points: TreemapHistoryPoint[]): string | null {
  const dernier = points.at(-1);
  if (!dernier) return null;
  const m = momentMontreal(dernier.tag);
  if (!m) return null;
  const [y, mo, d] = m.date.split("-").map(Number);
  const jour = new Date(Date.UTC(y, mo - 1, d));
  // 5 = vendredi. On recule jusqu'au vendredi ; si le dernier point EST un
  // vendredi mais avant 20h, la semaine en cours a commencé le vendredi d'avant.
  let recul = (jour.getUTCDay() - 5 + 7) % 7;
  if (recul === 0 && m.heure < 20) recul = 7;
  jour.setUTCDate(jour.getUTCDate() - recul);
  return `${jour.toISOString().slice(0, 10)}T20`;
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
