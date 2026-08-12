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
export const SALIENCE_CUTOVER = true;

/** Facteur d'affichage du nouvel indice. Voir la note d'échelle ci-dessus. */
export const NEW_INDEX_SCALE = 100;

// ── Grilles de repli ─────────────────────────────────────────────────────────
//
// MÊME rôle que SAL_QC_THRESHOLDS / SUM_QC_THRESHOLDS pour l'ancien indice : la
// calibration glissante publiée (`salience_calibration.json`) prime dès qu'elle
// a assez de points ; ces valeurs servent d'ici là.
//
// ⚠️ ÉTAT AU JOUR DE LA BASCULE (2026-08-12, relevé dans le JSON publié) — les
// quatre grilles ne sont PAS logées à la même enseigne, et c'est ce qui décide
// lesquelles de ces constantes comptent vraiment :
//   · `salience_index_qc_sum_24h` / `_roc_sum_24h` : ABSENTES du JSON (la
//     fenêtre glissante part du plancher spec-v1 du 2026-08-09, trop courte
//     pour réunir CAL_MIN_N = 60 storylines DISTINCTES). Ce sont donc bien
//     NEW_SUM_QC/ROC_THRESHOLDS ci-dessous qui CLASSENT les Unes et pilotent
//     le badge au jour J. Ce sont les deux constantes qui portent le poids.
//   · `salience_index_qc` (n = 83) et `_roc` (n = 71) : PUBLIÉES et déjà
//     au-dessus du seuil, donc la calibration glissante PRIME et les grilles
//     par bloc ci-dessous ne servent plus que de filet. Le basculement
//     automatique annoncé s'est fait tout seul entre le 09 et le 12 août.
// Conséquence pratique : au prochain refresh qui publiera les deux `_sum_24h`,
// le classement changera de grille sans qu'une ligne de code bouge. C'est le
// mécanisme voulu, mais il vaut d'être su — vérifier la concordance ce jour-là.
//
// MESURE (script `_chantiers-vitrine/banc-235/cutover_grilles_specv1.R`,
// re-roulé le 2026-08-12 au matin de la bascule, scan Athena 4,3 Mo) :
//   · valeurs RECOMPOSÉES depuis le JSON `articles` à la spec v1, jamais lues
//     dans la colonne publiée : depuis le bloc 15-19 du 2026-08-08 celle-ci
//     mélange ancienne et nouvelle formule (#224), et calibrer sur un mélange
//     est précisément le piège que #224 documente ;
//   · fenêtre = régime regroupement-LLM (≥ 2026-07-23), 122 blocs ;
//   · population = celle du frontend (dédup event_id préf-QC, exclusion des
//     Unes américaines, titre requis), donc plus étroite que celle de #224 ;
//   · conventions de calibration IDENTIQUES à scripts/fetch_data.R, grille par
//     grille (voir chaque constante).
//
// CONTRÔLE de la mesure : rejouée sur la convention de #224 (pic par storyline),
// elle rend 19,6 / 22,1 / 38,5 / 56,2 / 65,3 contre 19,8 / 22,2 / 38,6 / 55,4 /
// 64,6 postés le 08-08 — l'écart tient aux quatre jours de plus et aux filtres
// frontend. La reconstruction est donc la bonne.

type Thresholds = { faible: number; moyenne: number; eleve: number; tresEleve: number; extreme: number };

/** Grille du BADGE et du CLASSEMENT (Une des Unes) : cumul 24 h pondéré par
 *  récence, un point par storyline (son sommet cumulé), population = les Unes
 *  AFFICHÉES. Réplique de `calibration_sum_24h(score_col = salience_index_qc,
 *  media_col = media_ids_qc, min_media_secondary = 2)`. n = 63.
 *
 *  PERCENTILES BRUTS, sans relèvement — et c'est une décision, pas un oubli.
 *
 *  Le garde ε du 19-07 disait : « un sujet porté par un seul média n'atteint
 *  jamais Modérée ». Il fallait le poser à la main parce que l'ANCIEN indice
 *  comptait du temps en Une sans regarder combien de médias couvraient
 *  l'histoire — un média obstiné pouvait donc monter seul, et rien dans le
 *  calcul ne l'en empêchait.
 *
 *  La spec v1 multiplie trois jambes (Visibilité × Intensité × Durée) en
 *  moyenne géométrique NON compensatoire : une jambe presque nulle écrase le
 *  reste. Un mono-média a une visibilité nulle, ramenée au plancher EV_EPS =
 *  0,05, ce qui PLAFONNE son indice par construction — mesuré sur la fenêtre
 *  régime-LLM (vitrine#430, 2026-08-09) :
 *
 *    · par bloc  : mono-média ≤ 27,2 (plafond théorique 33,9) vs médiane 38,5
 *    · au cumul  : mono-média ≤ 44,7                          vs médiane 60,6
 *
 *  L'invariant vrai sous la spec v1 n'est donc plus « jamais Modérée » mais
 *  **« un mono-média ne dépasse pas la médiane »**, et il ne demande aucune
 *  règle ajoutée. Décision d'Adrien du 2026-08-09 : réénoncer l'invariant et
 *  retirer la béquille. Une constante arbitraire de moins à recalculer à chaque
 *  recalibration, et une asymétrie QC/ROC de moins à justifier publiquement.
 *
 *  ⚠️ C'est un constat EMPIRIQUE, pas une garantie de construction — la nuance
 *  a failli se perdre (relevée en review sur #431). La forme de l'indice plafonne
 *  un mono-média PAR BLOC à 0,05^(1/3) = 36,8 ; mais le badge tourne sur le
 *  CUMUL 24 h, et les six poids de récence somment à 3,347. Le plafond théorique
 *  du cumul est donc 36,8 × 3,347 = **123,3**, largement au-dessus d'« Élevée »
 *  (60,6). Un média qui garderait seul une histoire en Une pendant 24 h d'affilée
 *  franchirait le seuil.
 *
 *  Ce que le corpus dit : ce cas ne se produit pas. Le plus fort mono-média
 *  RÉELLEMENT AFFICHÉ vaut 44,7, soit 15,9 points sous « Élevée ». L'invariant
 *  tient donc sur les données observées, avec une marge confortable — et c'est
 *  à ce titre qu'il justifie le retrait de la béquille, pas au titre d'une
 *  impossibilité mathématique. À revérifier à chaque recalibration.
 *
 *  ✅ REVÉRIFIÉ le 2026-08-12, au matin de la bascule, et la consigne ci-dessus
 *  est désormais OUTILLÉE : `cutover_grilles_specv1.R` mesure lui-même le plus
 *  fort mono-média AU CUMUL (il ne donnait que celui des pics) et refuse la
 *  bascule si l'invariant tombe. Sur 122 blocs : max = 44,7 sur 2 storylines
 *  mono, médiane 60,6 → tenu, marge 15,9. Le maximum n'a pas bougé d'un dixième
 *  en quatre jours, ce qui est en soi rassurant sur sa stabilité.
 *
 *  Conséquence assumée : une histoire portée par un seul média peut désormais
 *  afficher « Modérée », dont l'infobulle dit « environ 65 % des Unes sont plus
 *  saillantes que celle-ci ». Pour un sujet à un seul média, la phrase est
 *  juste.
 *
 *  NB : #224 avait posé la règle du relèvement sur la grille des PICS ; c'est la
 *  grille des CUMULS qui pilote le badge depuis vitrine#314 (27-07). Les deux
 *  ne sont pas la même distribution — d'où cette mesure dédiée. */
export const NEW_SUM_QC_THRESHOLDS: Thresholds =
  { faible: 32.9, moyenne: 40.6, eleve: 60.6, tresEleve: 87.8, extreme: 147.7 };

/** Grille du niveau PAR BLOC (lecture au survol de la trajectoire) : réplique de
 *  `calibration_metric("salience_index_qc")`, toutes les valeurs > 0. n = 403.
 *  Percentiles bruts, sans relèvement : le garde ε porte sur l'étiquette d'une
 *  Une, pas sur la lecture d'un bloc isolé — l'étendre ici serait une décision
 *  neuve, qui n'appartient pas à cette PR. */
export const NEW_BLOCK_QC_THRESHOLDS: Thresholds =
  { faible: 11.7, moyenne: 17.4, eleve: 21.0, tresEleve: 37.1, extreme: 54.9 };

/** Côté ROC (bout de ligne du radar Deux solitudes) : mêmes conventions, avec
 *  `min_media_secondary = 1` comme fetch_data.R. n = 75.
 *  Percentiles bruts, comme le QC depuis le 2026-08-09 — les deux côtés
 *  suivent désormais la même règle, ce qui était l'un des arguments de la
 *  décision. 36 des 75 storylines ROC sont mono-média (contre 2 sur 63 au QC) :
 *  le mono-média est l'exception au Québec et la norme au Canada, parce que le
 *  radar n'a pas de seuil éditorial équivalent.
 *
 *  ⚠️ C'est pourquoi l'invariant mono-média N'EST PAS revendiqué de ce côté-ci,
 *  et ce n'est pas un oubli : mesuré le 2026-08-12, le plus fort mono-média
 *  canadien au cumul vaut 56,1 pour une médiane à 40,4 — il la dépasse. Un
 *  invariant qui porterait sur la moitié de sa population ne dirait rien. Le
 *  script de calibration encode cette asymétrie explicitement, pour qu'une
 *  future recalibration ne la lise pas comme une régression.
 *
 *  Hypothèse TESTÉE ET RÉFUTÉE (vitrine#430) : aligner les populations —
 *  exiger ≥ 2 médias côté ROC aussi — ne ferait PAS tenir l'ancien garde ε.
 *  Après alignement, le plus fort mono-média canadien vaut encore 53,0 contre
 *  une borne Modérée à 37,2, parce que le héros de chaque édition est gardé
 *  quel que soit son nombre de médias, des deux côtés. L'asymétrie des seuils
 *  n'était pas la cause. */
export const NEW_SUM_ROC_THRESHOLDS: Thresholds =
  { faible: 19.5, moyenne: 27.7, eleve: 40.4, tresEleve: 64.1, extreme: 149.9 };

/** Repli transitoire du côté ROC (scores par bloc), utilisé seulement si la
 *  grille cumulée ROC manque. n = 381. */
export const NEW_BLOCK_ROC_THRESHOLDS: Thresholds =
  { faible: 11.5, moyenne: 15.9, eleve: 19.8, tresEleve: 41.2, extreme: 61.4 };

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
