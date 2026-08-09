// ── Cutover de l'indice de saillance (aws-refiners#224, #287, tag `spec-v1`) ──
//
// Ce module ne contient QUE l'interrupteur et les grilles du NOUVEL indice.
// Il est isolé pour qu'au jour J la bascule tienne en UNE ligne à changer, sans
// relire les 2 200 lignes du loader.
//
// ┌ CE QUI BASCULE ────────────────────────────────────────────────────────────┐
// │ AVANT : `score_qc` / `score_roc` — l'indice historique (temps en Une ×      │
// │         pondération média), échelle libre ≈ 1 → 200.                        │
// │ APRÈS : `salience_index_qc` / `salience_index_roc` — l'indice formatif à    │
// │         trois facettes (Visibilité × Intensité × Durée, moyenne géométrique │
// │         non compensatoire), plafond de 3 articles par média et durée        │
// │         pondérée par le rythme du média. Stocké dans [0,1].                 │
// └────────────────────────────────────────────────────────────────────────────┘
//
// ÉCHELLE D'AFFICHAGE (décision Adrien + Yannick, 2026-08-07, vitrine#258) :
// le stockage reste [0,1], la vitrine multiplie par 100 et montre UNE décimale
// (68,5 — jamais 68). Le ×100 est appliqué À LA LECTURE de chaque bloc, donc
// TOUT ce qui en découle (cumuls, sommets, seuils, figure du ⓘ) vit sur la même
// échelle sans conversion supplémentaire. Ce n'est pas cosmétique : la figure de
// distribution du ⓘ trace un axe logarithmique planché à 1 (`Math.max(v, 1)`) —
// en unités brutes [0,1], tous les repères s'écraseraient sur la même abscisse.
export const SALIENCE_CUTOVER = false;

/** Facteur d'affichage du nouvel indice. Voir la note d'échelle ci-dessus. */
export const NEW_INDEX_SCALE = 100;

// ── Grilles de repli ─────────────────────────────────────────────────────────
//
// MÊME rôle que SAL_QC_THRESHOLDS / SUM_QC_THRESHOLDS pour l'ancien indice : la
// calibration glissante publiée (`salience_calibration.json`) prime dès qu'elle
// a assez de points ; ces valeurs servent d'ici là. Pour le nouvel indice, le
// repli n'est PAS un détail transitoire — au moment d'écrire, la fenêtre
// homogène compte n = 52 storylines QC, sous CAL_MIN_N = 60. Ce sont donc ces
// nombres-ci qui classeront les Unes le jour de la bascule.
//
// MESURE (script `_chantiers-vitrine/banc-235/cutover_grilles_specv1.R`,
// 2026-08-08, scan Athena 4 Mo) :
//   · valeurs RECOMPOSÉES depuis le JSON `articles` à la spec v1, jamais lues
//     dans la colonne publiée : depuis le bloc 15-19 du 2026-08-08 celle-ci
//     mélange ancienne et nouvelle formule (#224), et calibrer sur un mélange
//     est précisément le piège que #224 documente ;
//   · fenêtre = régime regroupement-LLM (≥ 2026-07-23), 101 blocs ;
//   · population = celle du frontend (dédup event_id préf-QC, exclusion des
//     Unes américaines, titre requis), donc plus étroite que celle de #224 ;
//   · conventions de calibration IDENTIQUES à scripts/fetch_data.R, grille par
//     grille (voir chaque constante).
//
// CONTRÔLE de la mesure : rejouée sur la convention de #224 (pic par storyline),
// elle rend 19,9 / 22,2 / 38,5 / 56,2 / 64,5 contre 19,8 / 22,2 / 38,6 / 55,4 /
// 64,6 postés le 08-08 — l'écart tient à une storyline de plus et aux filtres
// frontend. La reconstruction est donc la bonne.

type Thresholds = { faible: number; moyenne: number; eleve: number; tresEleve: number; extreme: number };

/** Grille du BADGE et du CLASSEMENT (Une des Unes) : cumul 24 h pondéré par
 *  récence, un point par storyline (son sommet cumulé), population = les Unes
 *  AFFICHÉES. Réplique de `calibration_sum_24h(score_col = salience_index_qc,
 *  media_col = media_ids_qc, min_media_secondary = 2)`. n = 52.
 *
 *  ⚠️ Bornes brutes p5/p20/p50/p80/p95 = 32,5 / 40,4 / 62,3 / 89,4 / 133,3.
 *  La borne « Modérée » est RELEVÉE à 45,0 par la règle pérenne d'Adrien
 *  (#224, 2026-08-08) : `borne_Modérée = max(p20, mono_max + 0,3)`, parce que
 *  le garde ε du 19-07 — « un sujet porté par un seul média n'atteint jamais
 *  Modérée » — est l'INVARIANT, et les percentiles la convention. Mesuré sur la
 *  grandeur du badge : le plus haut cumul mono-média vaut 44,7 (2 storylines
 *  sur 52), au-dessus du p20. Sans ce relèvement, la bascule ferait entrer un
 *  mono-média dans Modérée dès le premier jour.
 *
 *  NB : #224 avait posé cette même règle sur la grille des PICS ; c'est la
 *  grille des CUMULS qui pilote le badge depuis vitrine#314 (27-07). Les deux
 *  ne sont pas la même distribution — d'où cette mesure dédiée. */
export const NEW_SUM_QC_THRESHOLDS: Thresholds =
  { faible: 32.5, moyenne: 45.0, eleve: 62.3, tresEleve: 89.4, extreme: 133.3 };

/** Grille du niveau PAR BLOC (lecture au survol de la trajectoire) : réplique de
 *  `calibration_metric("salience_index_qc")`, toutes les valeurs > 0. n = 332.
 *  Percentiles bruts, sans relèvement : le garde ε porte sur l'étiquette d'une
 *  Une, pas sur la lecture d'un bloc isolé — l'étendre ici serait une décision
 *  neuve, qui n'appartient pas à cette PR. */
export const NEW_BLOCK_QC_THRESHOLDS: Thresholds =
  { faible: 11.6, moyenne: 17.8, eleve: 21.2, tresEleve: 36.7, extreme: 54.8 };

/** Côté ROC (bout de ligne du radar Deux solitudes) : mêmes conventions, avec
 *  `min_media_secondary = 1` comme fetch_data.R. n = 63.
 *  Percentiles bruts : le plus haut cumul mono-média canadien vaut 56,1, mais
 *  26 des 63 storylines ROC sont mono-média (contre 2 sur 52 au QC) — relever
 *  la borne à 56,4 pousserait « Modérée » au-dessus de la médiane et casserait
 *  l'échelle. La décision ε visait le badge québécois ; à trancher pour le ROC. */
export const NEW_SUM_ROC_THRESHOLDS: Thresholds =
  { faible: 24.1, moyenne: 30.8, eleve: 41.1, tresEleve: 73.4, extreme: 149.1 };

/** Repli transitoire du côté ROC (scores par bloc), utilisé seulement si la
 *  grille cumulée ROC manque. n = 317. */
export const NEW_BLOCK_ROC_THRESHOLDS: Thresholds =
  { faible: 11.5, moyenne: 15.9, eleve: 19.8, tresEleve: 36.0, extreme: 61.8 };

/** Passe une grille publiée en unités brutes [0,1] à l'échelle d'affichage.
 *  `null` reste `null` : c'est le signal « pas de calibration → prends le repli ». */
export function scaleThresholds<T extends Thresholds | null>(t: T): T {
  if (!t) return t;
  return {
    faible: t.faible * NEW_INDEX_SCALE,
    moyenne: t.moyenne * NEW_INDEX_SCALE,
    eleve: t.eleve * NEW_INDEX_SCALE,
    tresEleve: t.tresEleve * NEW_INDEX_SCALE,
    extreme: t.extreme * NEW_INDEX_SCALE,
  } as T;
}
