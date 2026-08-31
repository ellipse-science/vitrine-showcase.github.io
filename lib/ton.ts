// L'écriture du TON — module NEUTRE, sans dépendance système, pour la même
// raison que `lib/duree.ts` : le composant client s'en sert, et il ne doit rien
// importer qui traîne `node:fs/promises` dans le paquet du navigateur.
//
// POURQUOI RIEN D'ABSOLU N'EST PUBLIÉ ICI.
//
// La mesure brute est une proportion nette de mots favorables, dans [-1, 1].
// Le palmarès l'a affichée telle quelle une heure durant, le 2026-08-31 :
// « +24,3 % ». Ça ne dit rien à un lecteur — il n'a aucun repère pour juger si
// 24 % de mots favorables c'est beaucoup, et la décimale donne au chiffre une
// autorité qu'il n'a pas.
//
// Ce qui se lit, c'est un ÉCART. « On parle de QS en bien » suppose un « par
// rapport à », et ce point de comparaison existe : les AUTRES partis, au même
// instant. Un écart n'exige aucun repère préalable, il en fournit un.
//
// EN POINTS, JAMAIS EN POUR CENT. Règle du module, énoncée dans
// `chiffresParlants` : « +12 points » est sans ambiguïté, « +34 % » ne dit pas
// si l'on parle de points ou d'un rapport, et c'est le genre d'ambiguïté qui
// finit mal citée. Un écart entre deux proportions se compte en points.

/** L'écart, arrondi au point, avec son signe. Rendu tel quel dans l'étiquette
 *  de bout de ligne, où il partage la place avec un rang et un sigle.
 *
 *  `ecart` est une différence de tons bruts (donc dans [-2, 2]), pas un
 *  pourcentage : la conversion en points se fait ici, une seule fois. */
export function formatEcartTon(ecart: number | null): string {
  // `null` = aucune couverture, donc aucun ton. Distinct d'un ton nul, qui veut
  // dire « on en a parlé, et de façon équilibrée ».
  if (ecart === null || !Number.isFinite(ecart)) return "n. d.";
  const pts = Math.round(ecart * 100);
  if (pts === 0) return "0 pt";
  // Le vrai signe moins, et non le trait d'union : il s'aligne sur le plus et
  // se lit à la même hauteur, ce qu'un tiret ne fait pas dans une colonne.
  return `${pts > 0 ? "+" : "−"}${Math.abs(pts)} pt${Math.abs(pts) > 1 ? "s" : ""}`;
}

/** La phrase de l'infobulle : ce que l'écart veut dire, et par rapport à quoi.
 *
 *  « Couverture 42 points plus négative que celle des autres partis. » Le point
 *  de comparaison est nommé à chaque fois : sans lui, le nombre redeviendrait le
 *  score qui ne voulait rien dire. */
export function phraseEcartTon(ecart: number | null): string {
  if (ecart === null || !Number.isFinite(ecart)) {
    // Dire POURQUOI il n'y a pas de valeur. « Non disponible » laisserait croire
    // à une panne de mesure, alors que c'est un fait sur la couverture : les
    // médias n'ont pas parlé de ce parti, il n'y a donc aucune phrase à classer.
    return "aucune couverture sur cette période, donc aucun ton à mesurer";
  }

  const pts = Math.round(Math.abs(ecart * 100));
  if (pts === 0) {
    return "couverture ni plus positive ni plus négative que celle des autres partis";
  }
  const sens = ecart > 0 ? "positive" : "négative";
  return (
    `couverture ${pts} point${pts > 1 ? "s" : ""} plus ${sens} ` +
    `que celle des autres partis`
  );
}
