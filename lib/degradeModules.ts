// DÉGRADÉ DE FOND AU DÉFILEMENT, d'un module à l'autre.
//
// Le fond de la page glisse du papier d'un module au papier du suivant à mesure
// qu'on descend. Le calcul ne dépend PAS de l'ordre des modules dans le code :
// il trie les repères par leur position réelle sur la page. Réordonner les
// sections dans `app/page.tsx` ne casse donc rien (demande de Jules Piral,
// 2026-09-17). Fonction pure, testée dans `tests/degradeModules.test.ts`.

/** Un module tel qu'il se trouve sur la page : le milieu de sa section (en px
 *  depuis le haut du document), son papier et son accent. */
export type Repere = { id: string; centre: number; fond: string; accent: string };

/** Mélange deux couleurs #RRGGBB : `f` = 0 donne `a`, 1 donne `b`. */
export function melange(a: string, b: string, f: number): string {
  const lire = (x: string) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
  const [p, q] = [lire(a), lire(b)];
  const k = Math.max(0, Math.min(1, f));
  return "#" + p.map((v, i) => Math.round(v + (q[i] - v) * k).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Le fond et l'accent à afficher quand le milieu de l'écran est à `centre`.
 *  Avant le premier module ou après le dernier : leur couleur, sans mélange.
 *  L'accent (titres) change franchement à mi-chemin : un titre ne se lit pas
 *  dans une couleur intermédiaire. */
export function fondAuDefilement(reperes: Repere[], centre: number): { fond: string; accent: string; id: string } | null {
  const pts = [...reperes].sort((a, b) => a.centre - b.centre);
  if (!pts.length) return null;
  const premier = pts[0], dernier = pts[pts.length - 1];
  if (centre <= premier.centre) return { fond: premier.fond, accent: premier.accent, id: premier.id };
  if (centre >= dernier.centre) return { fond: dernier.fond, accent: dernier.accent, id: dernier.id };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (centre >= a.centre && centre < b.centre) {
      const t = b.centre === a.centre ? 1 : (centre - a.centre) / (b.centre - a.centre);
      const proche = t < 0.5 ? a : b;
      return { fond: melange(a.fond, b.fond, t), accent: proche.accent, id: proche.id };
    }
  }
  return { fond: dernier.fond, accent: dernier.accent, id: dernier.id };
}
