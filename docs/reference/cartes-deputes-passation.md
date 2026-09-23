# Cartes de député : passation et chemin vers des cartes parfaites

Écrit le 23 septembre 2026 pour l'agent (ou la personne) qui reprend le
chantier. À lire avec [`cartes-deputes.md`](./cartes-deputes.md), qui documente
chaque choix méthodologique déjà fait.

## Le principe qui passe avant tout

**Toutes les données des cartes doivent vivre dans l'infra, être produites par
les raffineurs ou la dimension, et être bonnes à la source.** Le site et les
cartes ne font que lire. Aujourd'hui, le script des cartes corrige et complète
beaucoup de choses localement (voir « Rustines à faire disparaître ») : chacune
est une dette. Une correction faite seulement dans `scripts/social/` laisse le
site faux. Avant toute correction, demander : où cette donnée doit-elle vivre ?

- Faits de référence sur les élus (fonctions, mandats, résultats électoraux,
  indemnités, graphie des noms) : dimension `dim_qc_parliament`, dépôt
  **pplmatch** (`inst/extdata/`, générateurs `inst/python/`, publication
  `inst/scripts/publier_dimension.R`).
- Parole à l'Assemblée (mots, interventions, ton, enjeux, mot signature) :
  raffineurs **aws-refiners** `agora-decideurs-qc-phrases` puis
  `agora-decideurs-qc`, tables `agora_datamart-*` en DEV.
- Horaires et déploiement des raffineurs : **aws-infra**.
- Le site lit les tables au build via `scripts/fetch_data.R` vers
  `public/data/` (jamais modifié à la main). Une table nouvelle doit être
  ajoutée à `scripts/tables.json` **et** à `workers/api/src/tables.ts`, sinon
  ses colonnes sortent nulles en mode api, sans erreur.

## État au 23 septembre

- Branche `feat/cartes-deputes` (ce dépôt), poussée, pas de PR. 129 cartes
  rendues sans débordement : 2 légendaires, 13 rares, 44 peu communes, 70
  communes. Galerie de travail : https://claude.ai/artifact/5KVCNpdBB7bF8Eictg2Pzr
- pplmatch : branche `feat/fonctions-resultats-43e`, PR
  ellipse-science/pplmatch#6 assignée à Étienne (tables `functions`,
  `election_results`, `indemnities`, `indemnity_scale`). Pas fusionnée, pas
  publiée.
- Issues ouvertes :
  - aws-refiners#546 : têtes INFER `public_lands` et `defense` qui se
    déclenchent sur la procédure ;
  - aws-refiners#547 : interventions en double dans la source, parole de la
    présidente non attribuée, « Mme Roy » non attribuée.
- Document des bloquants en PDF (même contenu, en plus court) :
  `~/Desktop/Travail/CLESSN/Vitrine/bloquants-cartes-deputes.pdf`.

## Règles à respecter (non négociables)

- Ne jamais modifier `public/data/` à la main.
- Ne jamais écrire dans un datamart, ni lancer `--go`, `--apply` ou une
  republication sans demande explicite de Jules. Lire Athena est libre.
- Pousser une branche : oui. Ouvrir une PR : la proposer d'abord à Jules.
  Jamais approuver ni fusionner.
- Commits : trailer `Assisté par : Claude Code (<modèle>)`, jamais
  `Co-Authored-By`. aws-refiners exige une section « Impact méthodologie ».
- Texte d'équipe ou public : pas de tiret cadratin, typographie OQLF (skill
  `redaction-editoriale`).
- Ne pas redessiner les tracés de Jules (vague du coin de l'écusson) : proposer
  plutôt que changer.

## Ce qu'il faut absolument faire

Ordre conseillé : les données d'abord (A), parce que tout le reste en dépend.
Chaque tâche indique où elle se fait et ce qui prouve qu'elle est finie.

### A. Données à la source (infra et raffineurs)

**A1. Retirer les interventions en double (aws-refiners#547).**
Dans PROD `datawarehouse."a-qc-parliament-debates"`, chaque intervention de
2022 et 2023 est chargée deux fois (même `id`, même `metadata_lake_item_key`),
2024 en partie. Les mots publiés sont gonflés d'environ 30 % en médiane,
jusqu'au double (Fitzgibbon : 75 382 affichés, 37 691 réels).
- Où : à la source (le chargement de la table, voir ingestion et aws-infra), ou
  à défaut dédoublonner sur `id` dans `agora-decideurs-qc-phrases` avant la
  segmentation. Traiter aussi le surplus propre à la table des phrases en 2026
  (`intervention_id` réutilisés lors d'une reprise).
- Fini quand : pour chaque année de la législature, les mots de
  `agora_decideurs_qc_phrases` égalent ceux des `id` uniques de la source (écart
  sous 1 %), et `agora_decideurs_qc_deputes` est republiée. Requêtes de mesure
  dans l'issue.

**A2. Attribuer la parole de la présidence (aws-refiners#547).**
« La Présidente » (13 891 interventions, environ 160 000 mots sans doublons)
n'est attribuée à personne ; les vice-présidents le sont, par leur nom.
- Décision à faire prendre par Jules : compter la parole au fauteuil pour tout
  le monde (recommandé : la carte mesure la présence dans les débats) ou pour
  personne.
- Où : pplmatch (relier « La Présidente », « Le Président » et leurs variantes
  bruitées à la personne qui préside à la date, grâce à la table `functions` de
  pplmatch#6), puis republier les phrases.
- Fini quand : Nathalie Roy a ses interventions au fauteuil dans
  `agora_decideurs_qc_deputes`, et le script des cartes n'a plus de cas
  particulier pour elle (`presidente`, commune d'office).

**A3. Lever l'ambiguïté de « Mme Roy » (aws-refiners#547).**
153 interventions, 28 470 mots, surtout Nathalie Roy d'après un échantillon.
- Où : pplmatch, avec l'`intervention_header` ou le contexte de séance.
- Fini quand : aucune intervention de la législature n'a un locuteur sans
  personne, hors étiquettes collectives (« Des voix »).

**A4. Une ligne par élu sur la législature.**
Agora publie une ligne par élu et par parti. Neuf élus ont changé d'allégeance
(Dubé, Marissal, Rizqy, Lakhoyan Olivier, Nichols, Blanchette Vézina, Poulet,
Dufour, Lefebvre). Le script des cartes les réunit
(`fusionnerLignesParParti`), mais le ton, les parts d'enjeux et la richesse
lexicale y sont approchés.
- Où : `agora-decideurs-qc`, publier en plus une vue par personne (par
  `person_id`), toutes allégeances confondues, calculée sur les phrases.
- Fini quand : `fusionnerLignesParParti` est supprimée et les neuf cartes
  gardent les mêmes totaux.
- Aussi : ouvrir une issue côté site, dont la fiche d'élu ne montre qu'une
  partie de la parole de ces neuf élus.

**A5. Recalibrer `public_lands` et `defense` (aws-refiners#546).**
Les cartes retirent ces deux enjeux des parts (`ENJEUX_EN_REVISION`) ; le site
ne le fait pas.
- Fini quand : la part de Terres et d'Affaires internationales sur le Salon
  bleu est plausible (voir la mesure de #546), et `ENJEUX_EN_REVISION` est vide.

**A6. Faire fusionner et publier pplmatch#6, et corriger la dimension.**
- Anomalies à corriger dans les tables existantes :
  - Youri Chassin est `IND` dès 2022 alors qu'il a été élu à la CAQ (départ en
    septembre 2024) ;
  - le mandat de Dominique Anglade se termine le 2023-03-12 au lieu de sa
    démission du 1er décembre 2022 ;
  - `persons` a deux lignes pour Eric Girard de Lac-Saint-Jean (17957), et
    celle de 17929 n'a pas de lien vers sa fiche.
- Faire relire par une deuxième personne, sources en main :
  - les 8 fonctions transcrites à la main (`functions_transcribed_qc.csv`) ;
  - les 4 montants de l'indemnité de base ;
  - l'hypothèse d'un barème inchangé de 2022 à 2026.
- Publication par Étienne (`publier_dimension.R --env DEV --go`).

**A7. Faire lire la dimension au site et aux cartes.**
Aujourd'hui les cartes lisent des fichiers locaux
(`scripts/social/donnees/fonctions-deputes.json`, `resultats-elections.json`),
produits par `scripts/social/fonctions-deputes.ts` et `resultats-elections.ts`
à partir d'assnat.qc.ca et d'Élections Québec.
- Où : exporter les tables de la dimension vers `public/data/` par
  `fetch_data.R` (whitelists `scripts/tables.json` et `workers/api/src/tables.ts`),
  puis faire lire ces fichiers au script des cartes.
- Fini quand : `scripts/social/donnees/*.json` et les deux scripts de collecte
  sont supprimés, et les 129 cartes sortent identiques (comparer
  `social-out/cartes-deputes/.pages/*.html` avant et après).
- Les vis-à-vis (porte-parole face à un ministre) ne servent plus à la rareté
  depuis le 23-09 : décider s'ils méritent une table (sinon, retirer leur calcul).

**A8. Graphie des noms, à la source.**
`NOMS_IMPRIMES` corrige à l'impression Jolin-Barrette et Frédéric Beauchemin.
Jules doit trancher les autres : Benoit ou Benoît Charette, Eric ou Éric
Girard (Lac-Saint-Jean), Etienne ou Étienne Grandmont, « Brigitte B. Garceau »
ou non.
- Où : le référentiel des portraits (`scripts/scrape_deputy_photos.py`, qui
  écrit `public/images/deputes/index.json`) et `persons` dans la dimension.
- Fini quand : `NOMS_IMPRIMES` est vide.

**A9. Vérifier les totaux après A1 à A4.**
- Échantillon vérifié à la main dans le Journal des débats : les 10 plus bas,
  les 10 plus hauts, et les élus proches des seuils de rareté.
- Confirmer qu'aucune séance n'a eu lieu entre le 12 juin 2026 (dernière
  séance couverte) et la dissolution du 27 août 2026.
- Dominique Anglade est absente des données agora : la faire apparaître (elle a
  siégé du 29 novembre au 1er décembre 2022) ou l'écrire sur la page de méthode.

### B. Contenu des cartes

- **B1. Citations du mot signature.** 85 cartes ont un mot signature, dont 77
  avec une citation coupée automatiquement. Les relire toutes, contexte en
  main ; une citation qui déforme le propos est un risque public. Idéalement,
  le raffineur publie des bornes de citation propres (la coupe se fait
  aujourd'hui dans `citationExtrait`, côté site).
- **B2. Régénérer après A1 à A5** et relire la planche
  (`social-out/cartes-deputes/_planche.html`) : la rareté peut bouger (au moins
  Blanchette Vézina et Lamontagne avec A1, Nathalie Roy avec A2).
- **B3. Décisions de Jules en suspens** :
  - sigle « M » de Pierre Dufour pour 17 jours comme ministre (garder, ou
    exiger une durée minimale) ;
  - mention « carte N de 125 » pour 129 cartes ;
  - mention « fac-similé » sur la signature de Legault ;
  - mise en page des versos sans mot signature ;
  - mention d'ancien premier ministre pour Legault (`CHEFS`).
- **B4. Tenir `CHEFS` et `PARTI_ACTUEL_PAR_SIEGE` à jour, ou les faire
  disparaître** : ces deux tables sont tenues à la main dans le script. Leur
  place est la dimension (fonction « chef de parti » datée, affiliation
  courante).

### C. Droits

- **C1. Photos** : confirmation écrite de l'Assemblée nationale pour l'usage
  prévu (la carte dit « usage non commercial autorisé »).
- **C2. Signature de François Legault** : son accord, ou la mention
  « fac-similé », ou le retrait.
- **C3. Logos des partis** : informer les partis, ou demander leur accord.

### D. Impression

- **D1. Lisibilité.** Au format 63,5 × 88,9 mm, la carte (1071 × 1496 px) est
  à environ 428 ppp : la note de méthode (15 px) ferait environ 2,5 points,
  le crédit photo (19 px) environ 3. Minimum lisible : environ 6 points.
  Choisir entre un format plus grand, ou une note d'une ligne avec un code QR
  vers la page de méthode.
- **D2. Fichiers imprimeur** : fonds perdus (environ 3 mm), traits de coupe,
  CMJN avec le profil de l'imprimeur, 600 ppp si demandé.
- **D3. Édition holographique** : procédé réel (film ou dorure) et masque
  séparé ; l'effet actuel n'est qu'une simulation d'écran.
- **D4. Épreuve papier** d'au moins une carte par rareté avant le tirage.

### E. Site et processus

- **E1. Page de méthode publique** des cartes, avec la skill
  `redaction-methodologie`, à partir de `cartes-deputes.md`. La carte y renvoie
  déjà.
- **E2. Signalement des corrections** : un canal (formulaire ou adresse),
  indiqué sur la page de méthode.
- **E3. PR de `feat/cartes-deputes`** : rebaser sur `develop`, corps court,
  section « Impact méthodologie », revue humaine. La proposer à Jules avant de
  l'ouvrir.

## Rustines à faire disparaître

Chacune compense une donnée fausse ou absente en amont. Une carte parfaite n'en
a plus aucune.

| Rustine (script des cartes) | Donnée qu'elle compense | Tâche |
|---|---|---|
| `ENJEUX_EN_REVISION` | têtes INFER sur la procédure | A5 |
| `fusionnerLignesParParti` | une ligne par élu et par parti | A4 |
| `presidente` (commune d'office) | parole au fauteuil non attribuée | A2 |
| `NOMS_IMPRIMES` | graphies fautives | A8 |
| `CHEFS`, `PARTI_ACTUEL_PAR_SIEGE` | fonctions et affiliation tenues à la main | A6, B4 |
| `scripts/social/donnees/*.json` et scripts de collecte | fonctions, scrutins, indemnités hors infra | A6, A7 |
| `VIS_A_VIS_MANUELS`, `ANCIENS` (`fonctions-deputes.ts`) | appariements et anciens députés à la main | A6, A7 |

## Reprendre le travail

```sh
git switch feat/cartes-deputes
npm run carte:deputes -- --parallele          # planche + contrôles de rendu (~40 s)
npm run carte:deputes -- --png --parallele    # PNG, après la planche de cette version
npm run carte:deputes -- --only tanguay --png # une carte
node scripts/garde_redaction.mjs scripts/social/cartes-deputes.ts docs/reference/cartes-deputes.md
```

Requêtes Athena : `library(tube); ellipse_connect(env = "PROD", database =
"datawarehouse")` pour la source brute (la table DEV du même nom est
incomplète), `env = "DEV", database = "datamarts"` pour les tables
`agora_datamart-*`. La session AWS SSO expire : Jules la relance.
