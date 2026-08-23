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

// ── Les points : l'attention sur 24 h, SUR 100 (vitrine#566) ─────────────────
//
// Le classement, le badge, la courbe et la figure du ⓘ tournent sur le cumul
// des six derniers blocs pondéré par récence (demi-vie HALF_LIFE_H, vitrine#274
// puis #314). Jusqu'au 2026-08-22 ce cumul s'affichait tel quel : les six
// poids sommant à 3,347, une histoire pouvait afficher « 207,5 pts » alors que
// la métho disait « un indice sur 100 » — deux échelles, aucun pont entre les
// deux, et le mot « points » n'était défini nulle part.
//
// Décision d'Adrien (2026-08-22, issue #566) : les poids sont NORMALISÉS pour
// sommer à 1 sur une fenêtre pleine. Le cumul devient la MOYENNE pondérée des
// six derniers blocs, donc vit sur la même échelle 0–100 que l'indice d'un
// bloc. Un bloc absent compte 0 (la normalisation se fait toujours sur la
// fenêtre PLEINE, jamais sur les blocs présents — sinon une histoire qui
// apparaît à 68,8 dans un seul bloc afficherait 68,8 et sauterait en tête).
// Le classement, les centiles et les bandes ne bougent pas : tout est divisé
// par la même constante, seuils compris (voir `enPoints`).
export const HALF_LIFE_H = 10;
const BLOCK_H = 4;
const WINDOW_BLOCKS = 6;
/** Somme des six poids de récence d'une fenêtre pleine : 1 + 2^(−0,4) + … +
 *  2^(−2) = 3,347. C'est le diviseur qui ramène le cumul sur 100. */
export const RECENCY_WEIGHT_TOTAL = Array.from({ length: WINDOW_BLOCKS }, (_, k) =>
  Math.pow(2, -(k * BLOCK_H) / HALF_LIFE_H)).reduce((a, b) => a + b, 0);
/** Poids de récence NORMALISÉ d'un bloc vieux de `ageH` heures (0 = le plus
 *  frais). Une Une d'il y a 10 h pèse moitié moins qu'une Une en cours. */
export const recencyWeight = (ageH: number) =>
  Math.pow(2, -ageH / HALF_LIFE_H) / RECENCY_WEIGHT_TOTAL;

// ── Les grilles qui classent ─────────────────────────────────────────────────
//
// ⚓ CE NE SONT PAS DES GRILLES DE REPLI. Elles classent, tout le temps.
//
// C'est la décision A0 de vitrine#430, redite par Adrien le 2026-08-13 : la
// référence des bandes est **ANCRÉE, pas glissante**. Le chargeur ne consulte
// donc PLUS `salience_calibration.json` pour les quatre métriques du nouvel
// indice — il lit ces constantes, et elles seules.
//
// POURQUOI. Un indice absolu mérite une lentille stable. La calibration
// glissante recalcule ses percentiles à chaque refresh sur l'historique
// disponible : une même valeur peut donc changer d'étiquette parce que la
// distribution a bougé SOUS elle, sans que l'histoire ait bougé d'un point.
// Pour une mesure qu'on publie et qu'on cite, c'est le défaut à ne pas avoir.
//
// ET CE N'EST PAS THÉORIQUE. La fenêtre glissante est repartie de zéro au
// plancher spec-v1 du 2026-08-09 : elle publiera donc une grille de VINGT
// JOURS dès qu'elle atteindra CAL_MIN_N = 60 storylines distinctes (n = 16 au
// QC et 14 au ROC le 13-08). Sans ce débranchement, le classement du site
// aurait changé de grille tout seul, à un refresh quelconque, sans qu'une
// ligne de code bouge et sans que personne l'ait demandé. Et il aurait troqué
// une grille d'ANNÉE contre une grille de vingt jours — le défaut exact mesuré
// et rejeté au cutover : la fenêtre courte sur-émet « Exceptionnelle » de 68 %.
//
// CE QUI RESTE GLISSANT POUR L'INSTANT : le repère « habituel » de la jauge de
// convergence (Deux solitudes). C'est désormais le SEUL repère mobile du site —
// tous les autres sont soit ancrés, soit des seuils absolus (2 % de part de
// voix pour l'ombre médiatique, ±0,002 pour le ton). ⚠️ Ce n'est PAS ratifié :
// la question « pourquoi un régime pour l'un et pas pour l'autre » est ouverte
// et documentée, mesure à l'appui, dans vitrine#477. Ne pas invoquer cette
// exception comme un choix arrêté tant qu'elle n'est pas tranchée.
//
// ⏳ CES VALEURS SONT PROVISOIRES, et le plan est arrêté : elles cèdent la place
// à `ref-2025`, une année CIVILE complète, figée et versionnée, APRÈS le
// recompute (ordre imposé : réparer → rejouer → geler). Quand 2026 sera
// complète à son tour, les deux années pourront être comparées et la référence
// rediscutée. Jusque-là, on ne change pas de plan.
//
// MESURE (script `_chantiers-vitrine/banc-235/grilles_annee_specv1.R`, roulé le
// 2026-08-12, AUCUN appel AWS — le rejeu local `out/year_llm.rds`) :
//   · valeurs RECOMPOSÉES depuis le JSON `articles` à la spec v1, jamais lues
//     dans la colonne publiée : depuis le bloc 15-19 du 2026-08-08 celle-ci
//     mélange ancienne et nouvelle formule (#224), et calibrer sur un mélange
//     est précisément le piège que #224 documente ;
//   · fenêtre = 2025-05-17 → 2026-08-07, soit 448 jours et 2 683 blocs,
//     `storyline_id` peuplé à 100 % (régime de regroupement LLM partout, donc
//     comparable au régime courant) ;
//   · population = celle du frontend (dédup event_id préf-QC, exclusion des
//     Unes américaines, titre requis), donc plus étroite que celle de #224 ;
//   · conventions de calibration IDENTIQUES à scripts/fetch_data.R, grille par
//     grille (voir chaque constante).
//
// ⚠️ POURQUOI L'ANNÉE ET PAS LES 20 DERNIERS JOURS. La première version de cette
// PR calibrait sur la seule fenêtre qu'Athena permet (≥ 2026-07-23, 122 blocs,
// n = 63) parce que `headline_events_4h` ne commence qu'au 2026-05-14. Mesuré :
// cette fenêtre courte émet **68 % d'« Exceptionnelle » de trop** (111 contre 66
// sur l'année) et 15,5 % des storylines y changent de bande. C'est la bande la
// plus visible du site. La grille d'année ne peut venir que du rejeu local, ou
// d'aws-refiners#280 une fois la table peuplée.
//
// ⛔ CE N'EST TOUJOURS PAS `ref-AAAA`, la référence figée de vitrine#430 A0.
// 95,5 % des jours de ce rejeu tournent à panel QC = 5 (TVA exclu) ; après le
// recompute, TVA est partout et le seul changement de dénominateur ferait
// passer le p95 de 157,1 à ~147,2. Geler ici, ce serait figer une année qui a
// changé d'instrument en cours de route. L'ordre reste : réparer → rejouer →
// geler, et la cible arrêtée avec Adrien le 2026-08-12 est `ref-2025`, une
// année CIVILE complète, après le recompute.
//
// CONTRÔLE de la mesure : rejouée sur la convention de #224 (pic par storyline),
// elle rend 19,6 / 22,1 / 38,5 / 56,2 / 65,3 contre 19,8 / 22,2 / 38,6 / 55,4 /
// 64,6 postés le 08-08 — l'écart tient aux quatre jours de plus et aux filtres
// frontend. La reconstruction est donc la bonne.

type Thresholds = { faible: number; moyenne: number; eleve: number; tresEleve: number; extreme: number };

/** Passe une grille mesurée en unités de CUMUL (poids sommant à 3,347) aux
 *  points affichés (poids sommant à 1). Sans arrondi : une valeur arrondie à
 *  une décimale déplacerait chaque frontière de ± 0,05 point, et une Une posée
 *  pile dessus changerait de bande pour une raison de présentation. */
export function enPoints(t: Thresholds): Thresholds {
  return {
    faible: t.faible / RECENCY_WEIGHT_TOTAL,
    moyenne: t.moyenne / RECENCY_WEIGHT_TOTAL,
    eleve: t.eleve / RECENCY_WEIGHT_TOTAL,
    tresEleve: t.tresEleve / RECENCY_WEIGHT_TOTAL,
    extreme: t.extreme / RECENCY_WEIGHT_TOTAL,
  };
}

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
 *  ✅ REVÉRIFIÉ le 2026-08-12, et la consigne ci-dessus est désormais OUTILLÉE :
 *  `cutover_grilles_specv1.R` mesure lui-même le plus fort mono-média AU CUMUL
 *  (il ne donnait que celui des pics) et pèse l'ampleur d'un éventuel
 *  dépassement.
 *
 *  🔎 ET LE CAS THÉORIQUE CI-DESSUS S'EST PRODUIT — une fois en 448 jours.
 *  Sur la fenêtre courte (122 blocs) le plus fort mono-média vaut 44,7 contre
 *  une médiane de 60,6. Sur l'ANNÉE (n = 1 306), il vaut 63,2 contre une médiane
 *  de 59,2 : il franchit donc la médiane, de 4,0 points sur une bande large de
 *  37,3, et atterrit dans le premier dixième d'« Élevée ».
 *
 *  Le cas est `story-hiroshima-0dc148fc` : Le Devoir, du samedi 2 août 2025 16 h
 *  au dimanche 3 août 12 h, cinq blocs d'affilée, `outlets_qc = 1` tout du long
 *  — le dossier de fin de semaine sur les 80 ans d'Hiroshima et Nagasaki. Une
 *  commémoration datée d'avance, tenue en Une pendant que l'actualité chaude du
 *  samedi soir se tarit, qu'aucun autre média n'avait de raison de suivre.
 *
 *  Ça ne remet PAS l'invariant en cause, et c'est même sa démonstration : la
 *  Visibilité de ce dossier est au plancher (1 média sur 6), et le mécanisme
 *  non-compensatoire a écrasé vingt heures de Une continue jusqu'à le ramener
 *  au niveau d'une histoire médiane — 63,2 quand le p95 est à 157,1. L'ancien
 *  indice, qui comptait le temps en Une, en aurait fait une nouvelle majeure.
 *  Décision d'Adrien (2026-08-12) : 1 cas sur 37 mono, c'est une exception, pas
 *  une rupture ; la béquille reste retirée. Le script ne parle de rupture que
 *  si le dépassement devient courant (> 10 % des mono) ou franchement haut
 *  (au-delà du p80) — un test binaire `max > médiane` escaladait un signal
 *  faible.
 *
 *  Conséquence assumée : une histoire portée par un seul média peut désormais
 *  afficher « Modérée », dont l'infobulle dit « environ 65 % des Unes sont plus
 *  saillantes que celle-ci ». Pour un sujet à un seul média, la phrase est
 *  juste.
 *
 *  NB : #224 avait posé la règle du relèvement sur la grille des PICS ; c'est la
 *  grille des CUMULS qui pilote le badge depuis vitrine#314 (27-07). Les deux
 *  ne sont pas la même distribution — d'où cette mesure dédiée.
 *
 *  ⚠️ UNITÉS. Tous les chiffres de ce commentaire (44,7 · 60,6 · 123,3 · 63,2 ·
 *  157,1…) sont en unités de CUMUL, telles que le banc les mesure — c'est la
 *  constante ci-dessous, la source de vérité, et c'est elle que le script de
 *  la figure (`scripts/generate_saillance_levels.py`) relit. Le SITE, lui,
 *  affiche des points sur 100 depuis vitrine#566 : la grille exportée
 *  `NEW_SUM_QC_THRESHOLDS` est la même divisée par RECENCY_WEIGHT_TOTAL
 *  (33,8 → 10,1 · 41,8 → 12,5 · 59,2 → 17,7 · 96,5 → 28,8 · 157,1 → 46,9). */
export const SUM_QC_CUMUL_MESURE: Thresholds =
  { faible: 33.8, moyenne: 41.8, eleve: 59.2, tresEleve: 96.5, extreme: 157.1 };
export const NEW_SUM_QC_THRESHOLDS: Thresholds = enPoints(SUM_QC_CUMUL_MESURE);

/** Grille du niveau PAR BLOC (lecture au survol de la trajectoire) : réplique de
 *  `calibration_metric("salience_index_qc")`, toutes les valeurs > 0. n = 403.
 *  Percentiles bruts, sans relèvement : le garde ε porte sur l'étiquette d'une
 *  Une, pas sur la lecture d'un bloc isolé — l'étendre ici serait une décision
 *  neuve, qui n'appartient pas à cette PR. */
export const NEW_BLOCK_QC_THRESHOLDS: Thresholds =
  { faible: 12.1, moyenne: 17.4, eleve: 21.5, tresEleve: 41.9, extreme: 63.6 };

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
export const SUM_ROC_CUMUL_MESURE: Thresholds =
  { faible: 20.0, moyenne: 30.4, eleve: 45.4, tresEleve: 85.0, extreme: 150.6 };
/** En points sur 100 (÷ RECENCY_WEIGHT_TOTAL), comme le côté québécois. */
export const NEW_SUM_ROC_THRESHOLDS: Thresholds = enPoints(SUM_ROC_CUMUL_MESURE);

/** Repli transitoire du côté ROC (scores par bloc), utilisé seulement si la
 *  grille cumulée ROC manque. n = 381. */
export const NEW_BLOCK_ROC_THRESHOLDS: Thresholds =
  { faible: 11.3, moyenne: 15.9, eleve: 20.0, tresEleve: 37.2, extreme: 59.6 };

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
