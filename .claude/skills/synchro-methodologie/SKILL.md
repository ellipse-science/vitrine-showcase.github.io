---
name: synchro-methodologie
description: >
  Garder la page Méthodologie (public/methodologie/index.html) TOUJOURS
  synchronisée avec le comportement réel du pipeline. À utiliser pour toute PR
  (vitrine, aws-refiners, aws-infra) qui touche un calcul, un seuil, un
  horaire, la collecte, une représentation graphique ou un raffineur — le
  réflexe est de déterminer les sections impactées et de proposer la mise à
  jour du texte. Aussi : remplir la section « Impact méthodologie » du
  template de PR.
---

# Synchro méthodologie

La page Méthodologie est le contrat public du projet : elle décrit comment les
chiffres affichés sont produits. **Elle ne doit jamais être périmée.** Toute PR
qui change le comportement décrit doit être accompagnée de la mise à jour du
texte — c'est une obligation d'équipe (section « Impact méthodologie » du
template de PR, vérifiée par le workflow `garde-metho` dans les 3 repos).

**Copie canonique unique** : `public/methodologie/index.html` de ce repo
(11 sections avec des `id` stables). Ne jamais créer de copie ailleurs.

## Quand une PR a un impact métho

Impact = le TEXTE actuel de la page deviendrait faux ou incomplet après le
déploiement de la PR. Cas typiques :

- changement de **calcul** (score, indice, agrégation, pondération, dédup)
- changement de **seuil** (étiquettes de saillance, percentiles, Jaccard…)
- changement d'**horaire** ou de **fréquence** (crons, grille de blocs 4h)
- changement de **collecte** (liste des médias, scraping, filtres, langues)
- changement de **représentation** (nouveau graphique, nouvelle étiquette,
  nouvelle métrique affichée, retrait d'un élément décrit)
- nouveau **modèle/LLM** ou changement de modèle dans un raffineur

Pas d'impact = refactor sans changement de comportement, correctifs de bugs
qui RAMÈNENT le comportement à ce que la métho décrit déjà, CI/outillage,
style/layout sans changement de sens.

## Mapping sections ↔ sources de vérité (audité 2026-07-10)

| Section (`id`) | Décrit | Sources de vérité (code) |
|---|---|---|
| § 01 `cadre-conceptuel` | Cadre théorique | (rarement impacté par le code) |
| § 02 `collecte-medias` | Quels médias, quand, comment | aws-infra `src/utils/medias.ts`, `src/pipelines/` (crons Glue/refiners), glue `r-media-headlines` |
| § 03 `indice-saillance` | Indice de saillance des objets | aws-refiners `radar-data-preparation`, `radar-salient-objects`, `radar-salient-index` (`absolute_normalized_index`) |
| § 04 `une-des-unes` | Une des Unes : clustering, scores, étiquettes | aws-refiners `radar-event-salience` (clustering, storyline, agrégats 24h) ; vitrine `lib/data/headlineEvents.ts` (seuils `SAL_QC_THRESHOLDS`, bandes d'étiquettes) ; `public/methodologie/saillance-niveaux.png` |
| § 05 `treemap-enjeux` | Enjeux (12 catégories CAP) | aws-refiners `radar-headlines-issues`, `radar-issues-score` + dictionnaire des enjeux |
| § 06 `couverture-partis` | Mentions/ton des partis | aws-refiners `radar-party-score` + dictionnaires partis/sentiments |
| § 07 `parole-en-chambre` | Données parlementaires | (à compléter par l'équipe — vérifier le raffineur source avant d'éditer) |
| § 08 `fenetres-temporelles` | Blocs 4h, fenêtres day/week/month | aws-refiners grille de blocs (data-preparation, event-salience), fenêtres des scores ; aws-infra crons |
| § 09 `limites` | Limites connues | tout changement qui lève OU introduit une limite |
| § 10 `ethique` | Éthique | (rarement impacté par le code) |
| § 11 `citation` | Comment citer | version du site |

Un changement dans un fichier de droite ⇒ relire la section de gauche et se
demander : « ce texte reste-t-il vrai ? »

## Procédure

1. **Analyser le diff** de la PR et identifier les sections impactées via le
   mapping ci-dessus.
2. **Lire le texte actuel** des sections candidates dans
   `public/methodologie/index.html` — ne jamais conclure depuis le mapping
   seul.
3. **Rédiger la mise à jour** :
   - décrire ce qui EST déployé, jamais ce qui est prévu (règle FAIT vs
     VISION — pas d'intention au présent de l'indicatif) ;
   - même niveau de vulgarisation que le reste de la page (public non
     technique, chiffres concrets) ;
   - si un chiffre/seuil est cité, le recopier depuis le code, pas de mémoire.
4. **Synchroniser le MOMENT de publication** — crucial :
   - PR vitrine : métho mise à jour **dans la même PR** (déploiement atomique).
   - PR aws-refiners/aws-infra : ouvrir la PR vitrine de métho tout de suite,
     mais ne la merger **qu'une fois le changement effectivement déployé**
     (merge develop → ECR/CDK). Sinon la page décrirait du futur.
5. **Remplir la section « Impact méthodologie »** du template de PR (une des
   3 cases cochée ; le workflow `garde-metho` la vérifie quand des fichiers
   sensibles sont touchés).
6. Si l'illustration `saillance-niveaux.png` cite des seuils modifiés, la
   régénérer via `scripts/generate_saillance_levels.py` (CSV Athena requis).

## Pièges connus

- La métho est du **HTML statique** (pas de React) — éditer `index.html`
  directement, vérifier le rendu en preview.
- Les seuils d'étiquettes de saillance vivent côté **vitrine**
  (`SAL_QC_THRESHOLDS`) mais le score vient du **refiner** : un changement
  d'un côté OU de l'autre peut fausser § 04.
- Ne pas confondre « la doc interne » (README des refiners, docs/) et la page
  métho publique : les deux doivent être à jour, mais seule la métho est le
  contrat public.
