import type { TreemapHistoryPoint } from "@/lib/data/headlineEvents";
import { momentMontreal } from "@/lib/dates";

export type RankPeriod = "day" | "week" | "month";

/** La fenêtre « Semaine » : les SEPT derniers jours, le jour de l'édition
 *  compris. Une fenêtre qui glisse, pas une semaine du calendrier. */
export const JOURS_DE_LA_SEMAINE = 7;

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
  // SEMAINE : les sept derniers jours, comptés en jours de Montréal depuis le
  // dernier point. Sans point datable, les sept derniers points, faute de mieux.
  if (period === "week") {
    const debut = debutDeLaSemaine(points);
    if (!debut) return points.slice(-JOURS_DE_LA_SEMAINE);
    return points.filter((point) => jourMontreal(point) >= debut);
  }

  // 30 JOURS (hors campagne, 2026-11) : les trente derniers jours, comptés
  // depuis le dernier point, comme la semaine. La vue « Campagne » partait du
  // déclenchement du scrutin (27 août) ; une fois l'élection passée, elle ne
  // montrait plus que les 45 jours d'articles que garde fetch_data.R, tout en
  // se disant « depuis le début de la campagne ».
  const debut = debutDeLaFenetre(points, JOURS_DU_MOIS);
  if (!debut) return points.slice(-JOURS_DU_MOIS);
  return points.filter((point) => jourMontreal(point) >= debut);
}

/** La fenêtre longue : les TRENTE derniers jours, le jour de l'édition compris.
 *  Remplace la fenêtre « Campagne » depuis la fin de la période électorale. */
export const JOURS_DU_MOIS = 30;

/** Le premier jour d'une fenêtre glissante de `n` jours finissant au dernier point. */
export function debutDeLaFenetre(points: TreemapHistoryPoint[], n: number): string | null {
  const dernier = points.at(-1);
  if (!dernier) return null;
  const m = momentMontreal(dernier.tag);
  if (!m) return null;
  return jourMoins(m.date, n - 1);
}

/** Le JOUR d'une observation, en heure de Montréal, tiré du `tag` de la passe.
 *  Le `tag` est déjà en heure de Montréal (écrit ainsi par le raffineur) ;
 *  `momentMontreal` le lit tel quel, ramène les instants ISO (`Z`, décalage) à
 *  la même horloge, et prend une date seule (le point quotidien des frises
 *  Semaine et Campagne) pour le jour qu'elle nomme.
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

/** Le premier jour de la fenêtre « Semaine » : le jour du DERNIER point (en
 *  heure de Montréal) et les six qui le précèdent — du 31 août au 6 septembre
 *  pour une édition du 6. La semaine GLISSE : elle ne repart jamais de zéro.
 *
 *  Du 31-08 au 06-09, elle partait du vendredi 20h le plus récent, et le samedi
 *  elle ne montrait qu'un jour. Laurence-Olivier, le 05-09 : « Semaine, ça
 *  devrait être 7 derniers jours. » Adrien a tranché dans ce sens.
 *
 *  Calculé à partir du DERNIER point plutôt que de l'horloge : la frise doit
 *  décrire la période que les données couvrent, pas l'instant du build. Rend un
 *  jour ISO (« 2026-08-31 »), comparable au `jour` des articles. */
export function debutDeLaSemaine(points: TreemapHistoryPoint[]): string | null {
  const dernier = points.at(-1);
  if (!dernier) return null;
  const m = momentMontreal(dernier.tag);
  if (!m) return null;
  return jourMoins(m.date, JOURS_DE_LA_SEMAINE - 1);
}

/** Le jour ISO situé `n` jours avant `jourIso`. Arithmétique en UTC sur une
 *  date nue : le fuseau de la machine n'y entre pas. */
export function jourMoins(jourIso: string, n: number): string {
  const [y, mo, d] = jourIso.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d) - n * 86_400_000).toISOString().slice(0, 10);
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
