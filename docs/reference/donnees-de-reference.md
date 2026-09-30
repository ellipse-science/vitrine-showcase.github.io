# Données de référence CAPP — registre anti-duplication

**Copie canonique unique** (même règle que les diagrammes vivants et
l'ONBOARDING) — `aws-refiners` et `aws-infra` pointent ici, ne dupliquent pas
ce contenu. **Dernier audit contre le code des 3 repos : 2026-09-22.**
Source de vérité = le code (`vitrine-showcase.github.io`, `aws-refiners`,
`aws-infra`) et les dépendances externes (`ellipse-science/tube`,
`ellipse-science/pplmatch`) — pas ce document. Les statuts ci-dessous
pourrissent avec le temps ; revalider avant de s'y fier au-delà de la date
d'audit.

## Principe

La plupart des données de référence CAPP (député·e·s, partis, médias,
enjeux, promesses) sont **produites par un raffineur ou tirées d'Ellipse**
(`ellipse-science/tube`, `ellipse-science/pplmatch`) — ce ne sont pas des
inventions locales. Un module qui a un besoin légèrement différent d'une
donnée déjà définie ailleurs peut en **dériver un sous-ensemble ou l'adapter**
— ça, c'est normal. Ce qui ne l'est pas, c'est de **redéfinir tout le concept
en parallèle, indépendamment**, sans le faire dériver de sa source : c'est
ce qui produit des copies qui se ressemblent mais ne se mettent pas à jour
ensemble (le problème qu'on avait avec les dossiers partagés Dropbox).

Ce registre ne juge pas rétroactivement le code existant — plusieurs
duplications ci-dessous sont anciennes, assumées et même verrouillées par des
tests. Il sert à ce que la **prochaine** copie soit un choix conscient, pas
une redécouverte.

## Avant de créer une nouvelle donnée de référence

1. Chercher le concept dans le tableau ci-dessous.
2. S'il y a déjà une source déclarée : dériver/adapter à partir d'elle plutôt
   que retaper une liste indépendante — même si le format final diffère.
3. S'il n'y a **aucune source** (ex. candidat·e·s par élection, actuellement
   inexistant) : avant de le disperser dans plusieurs modules, ajouter une
   ligne à ce tableau qui déclare où la source doit vivre.
4. Si le concept existe mais que le format en amont est justement le
   problème (ex. `dim-medias` vide en PROD, voir plus bas) : dériver d'un
   instantané figé documenté plutôt que retaper à la main, et le signaler ici
   si ce n'est pas déjà fait.

## Tableau des types de données

### Personnes / institutions politiques

| Type | Source(s) actuelle(s) | Statut | Note |
|---|---|---|---|
| Député·e·s (attributs, par institution/législature) | package externe **`pplmatch`** (`ellipse-science/pplmatch`, `qc_mandates()`, `qc_persons()`, `members_historic_qc.csv`) — consommé par `aws-refiners/refiners/agora-decideurs-qc-phrases` ; en parallèle `aws-infra` modélise `dim_qc_parliament_members`, `dim_ca_parliament_members`, `dim_eu_parliament_members` (+ `-staging`), schéma copié-collé 3×, dérive déjà visible | DUPLIQUÉ | `pplmatch` est hors des 3 repos couverts par ce registre mais reste la source d'identité la plus fiable ; les 3 tables aws-infra devraient être un seul schéma paramétré par institution |
| Candidat·e·s par élection | — | **INEXISTANT (VISION)** | rien à dériver ; voir règle 3 ci-dessus avant d'en créer une copie éparpillée |
| Institutions parlementaires | `enum InstitutionAcronym` (`aws-infra/src/utils/institutions.ts`) | LIVRÉ, source unique | |
| Législatures | `enum LegislaturesAcronym` (`aws-infra/src/utils/legislatures.ts`) | LIVRÉ, source unique | |
| Couleurs de partis | `vitrine/lib/data/parties.ts` (`PARTY_COLORS`) ; recopiées dans `app/globals.css` (×2, dont un bloc qui s'auto-décrit en commentaire comme « TROISIÈME copie ») ; `dim_parties.color` (`aws-infra`, jamais consommée par vitrine) ; norme graphique CAPP externe non versionnée (« Elxn_qc22 »), valeurs différentes | DUPLIQUÉ, documenté comme problème non résolu dans le code (`var()` ne se résout pas dans les attributs SVG `stroke`) | candidat pour une refonte en tokens CSS — la cause du blocage est déjà identifiée, pas à refaire ici |
| Codes/clés de partis | 6+ listes indépendantes dans `aws-refiners` (`radar-party-score`, `radar-party-score-salient-shadow`, `polimetre-promesses-neuves`, `vitrine-art/generate_partis.py`, `agora-decideurs-qc`), casse/ordre différents ; `enum PartyAcronym` (`aws-infra`) ; clés de `PARTY_COLORS` (vitrine) | DUPLIQUÉ | |
| Attributs de partis (logo, sigle, `nb_elected`) | `dim_parties` (`aws-infra`, CSV S3) | source unique définie, non consommée ailleurs | vérifier avant d'ajouter un attribut de parti ailleurs |

### Médias

| Type | Source(s) actuelle(s) | Statut | Note |
|---|---|---|---|
| Clés/identifiants des médias intégrés | `aws-refiners` : `MEDIAS_FR` codé en dur dans 10+ raffineurs ; `aws-infra` : `dim-medias` (schéma riche) **vs** `utils/medias.ts` (`MediaAcronym`) avec **codes incohérents** (RCI≠RADIOCANADA, GDN≠G, UKS≠S, UKT≠T) ; vitrine : 3 listes indépendantes (`lib/medias.ts`, `lib/data/headlineEvents.ts`, duo `polimetre.ts`/`promessesNeuves.ts`) | DUPLIQUÉ — pire cas du registre, divergence de valeurs pas seulement de forme | cause connue : `dim-medias` est **vide en PROD**, contournement documenté dans `tools/refresh_reference_dim_medias.py` (aws-refiners) — pas une violation de ce garde-fou tant que ça dure, mais toute NOUVELLE liste doit dériver du snapshot `radar-salient-objects/tests/reference-dim-medias.csv`, pas être retapée |
| Info sur les Unes médiatiques (frontpages) | `aws-infra` : schéma `r-media-frontpages`/`r-media-headlines` + extracteurs `media-frontpages-{code}.ts` (important `utils/medias.ts`) ; vitrine : `headlineEvents.ts` + `public/data/headline-events.json` | plutôt sain (source cohérente par repo) | dépend des clés de médias ci-dessus en amont |

### Promesses / Polimètre

| Type | Source(s) actuelle(s) | Statut | Note |
|---|---|---|---|
| Liste maîtresse des promesses | `mastersheet_Promesses` (`fetch_promise_mastersheet()`, `aws-refiners/refiners/polimetre-plus/runtime.R`) | LIVRÉ, source unique — bon exemple | |
| Médias du module Polimètre / libellés de catégories | vitrine `lib/data/polimetre.ts` (`MEDIA_BY_ID`) vs `lib/data/promessesNeuves.ts` (commentaire du code : « MÊME table ») ; `lib/data/polimetre-meta.ts` (`CATEGORY_ORDER`) recopie les 12 libellés déjà dans `lib/enjeux.ts` | DUPLIQUÉ, assumé en commentaire mais non factorisé | |

### Saillance médiatique

| Type | Source(s) actuelle(s) | Statut | Note |
|---|---|---|---|
| Formules/seuils de saillance (promesses / nouvelles / objets) | `aws-refiners` : 2 implémentations parallèles gardées synchronisées par test (`facette_visibilite()` dans `radar-salient-index`, `region_salience_index()` dans `radar-event-salience`, comparées par `tests/test-coherence-inter-raffineurs.R`) — **mais** le même nom `salience_index` désigne une 3ᵉ formule différente (`n() * sum(pond_time_norm)`) dans `polimetre-plus` et `polimetre-promesses-neuves` ; vitrine : `salienceCutover.ts` et une grille indépendante dans `headlineEvents.ts` (`SAL_QC_THRESHOLDS`) recalculent des seuils au lieu de ne lire que `public/data/salience_calibration.json` | DUPLIQUÉ, en partie non documenté | collision de nom entre 3 formules distinctes — au minimum un renommage clarifierait, hors scope de ce registre mais signalé ici |

### Entités géographiques

| Type | Source(s) actuelle(s) | Statut | Note |
|---|---|---|---|
| Québec / Canada / international | `aws-refiners` : `COUNTRY_TO_REGION_LABEL` (source unique propre, `radar-event-salience/runtime.R`) ; `aws-infra` : `countries.ts` (ISO-3) + `provinces-or-states.ts` + codes pays 2 lettres incohérents dans `dim-medias` ; vitrine : couleurs régionales et libellés dupliqués (`globals.css` `--bleu`/`--red`, `lib/modules.ts`, composants) | DUPLIQUÉ, avec incohérence de format (ISO-2 vs ISO-3) en plus du contenu | |

### Enjeux

| Type | Source(s) actuelle(s) | Statut | Note |
|---|---|---|---|
| Catégories d'enjeux (12 CAPP / 21+ CAP-Lexicoder) | `aws-refiners` : 5 copies conscientes (`radar-data-preparation`, `radar-issues-score`, `agora-decideurs-qc`, `agora-decideurs-qc-phrases`, vitrine `lib/enjeux.ts`), verrouillées par tests ; `aws-infra` : `dict-issues`, `dict-issues-categories-capp-cap-lexicoder` (12 `capp_category` + 26 `lexicoder_category`), `dict-issues-two-categories` (CSV de test apparemment identique au précédent — doublon interne probable, à vérifier séparément) ; vitrine : `lib/enjeux.ts` se déclare « SOURCE DE VÉRITÉ » mais `polimetre-meta.ts` recopie quand même les libellés | DUPLIQUÉ, en grande partie assumé et verrouillé par tests | le risque est une 6ᵉ copie non testée, pas les 5 déjà connues |
| Dictionnaires de mots-clés par enjeu | `dict-issues-two-categories` (Athena, `aws-infra`), chargé seulement par `radar-headlines-issues` (**DÉPRÉCIÉ**, `active:false`) | MOURANT — plus aucune dépendance vivante | pas de remplaçant actif identifié pour un futur classifieur par mots-clés |

## Dette déjà identifiée

Le catalogue des duplications qui échappaient déjà à ce garde-fou au moment de
sa création, avec un avis sur la version à privilégier pour chacune, vit dans
[l'issue #850](https://github.com/ellipse-science/vitrine-showcase.github.io/issues/850) —
pas ici, pour ne pas dupliquer un inventaire qui vieillit vite dans deux
fichiers à la fois.

## Mise à jour de ce registre

Ce tableau vieillit vite (comme tout audit de code). Si tu corriges une
duplication listée ici, mets à jour la ligne (statut, source) dans la même
PR — sinon le registre devient lui-même une donnée qui a dérivé de la vérité,
exactement le problème qu'il essaie de prévenir.
