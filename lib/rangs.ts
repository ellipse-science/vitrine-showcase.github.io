// La course aux RANGS — module NEUTRE, sans dépendance système, pour la même
// raison que `lib/duree.ts` : le composant client s'en sert, et il ne doit rien
// importer qui traîne `node:fs/promises` dans le paquet du navigateur.
//
// POURQUOI DES RANGS ET PLUS DES MINUTES. Le palmarès traçait cinq courbes de
// durées cumulées sur une bande large et courte. Trois défauts s'y cumulaient et
// aucun réglage n'en venait à bout :
//
//   1. six blocs de 4 h par jour, au mieux — des zigzags, pas des courbes ;
//   2. une donnée très asymétrique, un parti devant et quatre écrasés au fond ;
//   3. un format large et bas, le pire pour des lignes, qui ont besoin de
//      hauteur.
//
// Le rang est DISCRET, et c'est tout ce qui change. À chaque instant les cinq
// partis occupent cinq lignes distinctes — une permutation. Plus de paquet
// écrasé, plus d'étiquettes à écarter, plus de lissage à borner pour l'empêcher
// de passer sous zéro : ces trois rustines disparaissent avec la forme qui les
// exigeait. Et les croisements deviennent l'information : on voit qui double
// qui, et à quelle heure.
//
// CE QUE ÇA COÛTE, et il faut le savoir : l'ÉCART entre deux rangs ne se voit
// plus. Premier de dix minutes ou de six heures, c'est le même trait. C'est
// pourquoi l'étiquette de bout de ligne porte la durée : la courbe raconte la
// course, l'étiquette donne le chiffre.

/** Deux décimales, sans zéros inutiles. */
const f = (n: number): string => Number(n.toFixed(2)).toString();

type Point = [number, number];

function lirePoints(points: string): Point[] {
  return points
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((paire) => paire.split(",").map(Number))
    .filter((p): p is Point => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([x, y]) => [x, y] as Point);
}

export type SerieTracee = {
  /** La clé du parti — elle sert aussi à départager les ex æquo. */
  cle: string;
  /** L'attribut `points` de la polyligne des MINUTES, tel que le chargeur
   *  l'écrit : « x,y x,y … », où `y` est l'ordonnée SVG, donc INVERSE de la
   *  durée (plus le parti a de minutes, plus `y` est petit). */
  points: string;
};

/**
 * Le rang de chaque série à chaque instant, à partir des tracés en minutes.
 *
 * Rend, par clé, la suite des couples `[x, rang]` — le rang commence à 1.
 *
 * LES EX ÆQUO SONT DÉPARTAGÉS PAR LA CLÉ, et ce n'est pas un détail : quatre
 * partis à zéro minute, c'est le cas ordinaire au premier bloc de la journée.
 * Sans départage stable, leur ordre aurait sauté d'un rendu à l'autre et les
 * lignes se seraient croisées sans qu'il ne se passe rien. Le rang reste donc
 * une PERMUTATION à chaque instant : cinq partis, cinq lignes, jamais deux au
 * même endroit.
 */
export function rangsParInstant(series: SerieTracee[]): Map<string, [number, number][]> {
  const lus = series.map((s) => ({ cle: s.cle, pts: new Map(lirePoints(s.points)) }));

  // L'union des abscisses, et non celles de la première série : une série qui
  // n'aurait pas tous ses blocs ne doit pas décider de l'axe des autres.
  const abscisses = [...new Set(lus.flatMap((s) => [...s.pts.keys()]))].sort((a, b) => a - b);

  const sortie = new Map<string, [number, number][]>(series.map((s) => [s.cle, []]));

  for (const x of abscisses) {
    const presents = lus
      .filter((s) => s.pts.has(x))
      .sort((a, b) => a.pts.get(x)! - b.pts.get(x)! || a.cle.localeCompare(b.cle));
    presents.forEach((s, i) => {
      sortie.get(s.cle)!.push([x, i + 1]);
    });
  }

  return sortie;
}

/** L'ordonnée du centre d'une ligne de rang, dans un cadre de `hauteur`.
 *  Les rangs sont centrés dans leur bande — d'où le demi : le premier ne colle
 *  pas au bord haut du cadre, ni le dernier au bord bas. */
export function hauteurDuRang(rang: number, total: number, hauteur: number): number {
  if (total <= 0) return hauteur / 2;
  return ((rang - 0.5) / total) * hauteur;
}

/**
 * Le chemin d'une ligne de rang : des paliers reliés par des S.
 *
 * Chaque segment est une Bézier cubique dont les DEUX tangentes sont
 * horizontales — les points de contrôle partagent l'ordonnée de leur extrémité,
 * au milieu du segment. Trois conséquences, toutes voulues :
 *
 *   · la ligne quitte et rejoint chaque rang À PLAT, donc un parti qui garde sa
 *     place dessine un vrai palier et non une pente molle ;
 *   · le changement de rang se lit comme un S franc, au milieu de l'intervalle,
 *     là où il a eu lieu ;
 *   · la courbe ne peut pas déborder — ses points de contrôle n'ont que deux
 *     ordonnées, celles des deux rangs — donc elle ne passe jamais par une
 *     ligne qu'elle n'occupe pas.
 */
export function cheminDeRang(points: Point[]): string {
  const n = points.length;
  if (n === 0) return "";
  const depart = `M ${f(points[0][0])} ${f(points[0][1])}`;
  if (n === 1) return depart;

  let d = depart;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const milieu = (x0 + x1) / 2;
    d += ` C ${f(milieu)} ${f(y0)} ${f(milieu)} ${f(y1)} ${f(x1)} ${f(y1)}`;
  }
  return d;
}

/**
 * La ligne part de l'ORIGINE de l'axe, même sans donnée avant le premier point.
 *
 * POURQUOI. Le raffineur ne publie ses blocs qu'à mesure que la journée avance :
 * à 16h, les deux seuls relevés du jour sont ceux de 12h et de 16h, et la ligne
 * ne couvrait donc que le dernier tiers du cadre. Les deux premiers tiers
 * restaient vides — non pas « il ne s'est rien passé », mais « nous n'avons pas
 * regardé », ce qu'un blanc ne dit pas.
 *
 * CE QU'ON DESSINE, ET CE QUE ÇA AFFIRME. Un palier plat, du bord gauche
 * jusqu'au premier relevé, à la place que ce relevé constate. On n'invente pas
 * un classement pour les heures non couvertes : on prolonge en arrière celui
 * qu'on a trouvé en ouvrant les yeux. L'alternative — poser tout le monde à zéro
 * minute à 00h — les rendrait tous EX ÆQUO, donc classés par ordre alphabétique,
 * et la ligne s'ouvrirait sur un éventail qui n'est le reflet de rien.
 */
export function depuisLOrigine(points: Point[], origine = 0): Point[] {
  const premier = points[0];
  if (!premier || premier[0] <= origine) return points;
  return [[origine, premier[1]], ...points];
}
