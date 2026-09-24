# Cartes de député : passation et chemin vers des cartes parfaites

Mis à jour le 23 septembre 2026 en fin de journée, pour l'agent (ou la
personne) qui reprend le chantier. À lire avec
[`cartes-deputes.md`](./cartes-deputes.md), qui documente chaque choix
méthodologique des cartes.

## Le principe qui passe avant tout

**Toutes les données des cartes doivent vivre dans l'infra, être produites par
les raffineurs ou la dimension, et être bonnes à la source.** Le site et les
cartes ne font que lire. Chaque correction faite seulement dans le script des
cartes est une dette (voir « Rustines à faire disparaître »).

- Faits de référence sur les élus (mandats, fonctions, résultats, indemnités) :
  dimension `dim_qc_parliament`, dépôt **pplmatch**.
- Parole à l'Assemblée : raffineurs **aws-refiners** `agora-decideurs-qc-phrases`
  puis `agora-decideurs-qc`.
- Horaires, `active` et déploiement : **aws-infra** (`lib/data-stacks/refiners/refiners.ts`).

⚠️ **Environnements (vérifié le 23-09).** Les deux raffineurs agora sont
`active: true`, donc actifs en DEV **et en PROD** (aws-infra#558), et le site lit
le datamart **PROD** depuis le 19 septembre (`DATAMART_ENV`). Un correctif de
raffineur doit donc être **gradué vers `main`** d'aws-refiners ; un merge sur
`develop` ne corrige que DEV. Le `CLAUDE.md` d'aws-refiners disait le contraire
(corrigé par aws-refiners#550).

## Ce qui a été fait le 23 septembre

Toutes les PR ci-dessous sont ouvertes, assignées à Adrien (`AdriClout`) ; Étienne
est en revue sur pplmatch.

| Tâche | Dépôt et PR | Contenu | Dépend de |
|---|---|---|---|
| Dimension enrichie | pplmatch#6 | tables `functions`, `election_results`, `indemnities`, `indemnity_scale` | rien |
| A2 Présidence | pplmatch#7 | « La Présidente » attribuée à la personne au fauteuil (`presiding_officer`) | #6 |
| A3 « Mme Roy » | pplmatch#8 | alias retiré ; l'en-tête (« Mme Roy (Montarville) ») tranche | rien |
| A6 Anomalies | pplmatch#9 | Chassin, Nichols, Anglade, Girard (Groulx), Bélanger (Orford) | rien |
| A1 Doublons | aws-refiners#548 | dédoublonnage sur `id` avant la segmentation | **mergée** ; release vers `main` prête |
| Reconstruction, A4, présidence hors parti | aws-refiners#549 | tables suffixées, table `agora_decideurs_qc_personnes`, outils de reconstruction, comparaison et bascule, parole au fauteuil hors des totaux de parti | #548 |
| Doc agents | aws-refiners#550 | environnements DEV/PROD dans `.claude/CLAUDE.md` | **mergée** |
| Version pplmatch épinglée | aws-refiners#551 | `pplmatch@cab7e29` dans le raffineur des phrases | rien |
| Release de #548 | aws-refiners#552 | graduation vers `main` | rien |
| En-tête de présidence | aws-refiners#553 | « Le Vice-Président (M. Benjamin) » ne masque plus l'élu (398 interventions sur 1 513 perdaient leur `person_id` au test local) | **avant la reconstruction** |
| Métho | vitrine#858 | swimlanes : table `_personnes`, noms `_deputes` canoniques | **déploiement** de #549 |

Issues ouvertes : aws-refiners#546 (têtes INFER `public_lands`/`defense`),
aws-refiners#547 (doublons, présidence, « Mme Roy » : diagnostic et chiffres à
jour dans la description), pplmatch#10 (le générateur `build_mandates.py` ne
reproduit plus `mandates_qc.csv` : dix écarts, assignée à Étienne).

Cartes (branche `feat/cartes-deputes` de ce dépôt, poussée, sans PR) : rareté
selon les mots prononcés, note de méthode au verso, un élu = une ligne, cartes
indépendantes pour les dix élus qui finissent indépendants, graphie accentuée.

## Décisions de Jules (23-09) à respecter

- Rareté : les deux premiers ministres sont légendaires ; tous les autres, chefs
  compris, sont classés sur les **mots prononcés** au Salon bleu sur la
  législature (10 % rares, 35 % peu communes). Durée du mandat incluse, voulue.
- La présidente est commune d'office tant que sa parole au fauteuil n'est pas
  attribuée ; une fois pplmatch#7 et la reconstruction faits, elle entre dans le
  calcul (elle serait rare). Pas de badge (essayé, retiré).
- Sa parole au fauteuil compte pour **elle**, **pas** dans le total de la CAQ.
- Un élu qui finit indépendant a une **carte indépendante** (« Indépendant (élu CAQ) »).
- Graphie **accentuée** des noms, même quand l'Assemblée n'en met pas.
- Sigle de fonction : la **mieux payée**, quelle que soit sa durée (Dufour garde « M »).
- Mention « carte N de 125 » : gardée.
- Les modèles réentraînés de #546 sont **en service** dans INFER.
- Priorité actuelle : **infra et raffineurs**, pas le site.

## Ce qui reste à faire, dans l'ordre

### 1. Revues et déploiement (humains)

1. Fusionner pplmatch#6, puis #7 ; #8 et #9 à tout moment. L'image des
   raffineurs installe pplmatch depuis `main` au moment du build.
2. Fusionner aws-refiners#548 puis #549 dans `develop`, puis les **graduer vers
   `main`** (branche `release/…`, procédure du `CLAUDE.md` d'aws-refiners).
3. Reconstruire les images `agora-decideurs-qc-phrases` et `agora-decideurs-qc`
   dans les deux comptes ; vérifier que l'image contient `table_suffix` avant
   tout run avec suffixe (sinon le run écrirait dans les tables canoniques).

### 2. Reconstruction de l'historique : séquence sûre (DEV d'abord, puis PROD par la migration)

Alignée sur la stratégie de migration de Patrick (`docs/STRATEGIE_MIGRATION.md`
et `tools/migrate_all.sh` d'aws-refiners) : **DEV est la source, PROD la reçoit
par `tools/migrate_table_dev_to_prod.R`** (téléversements bridés, validation des
comptes et des statistiques par colonne, chemin CAST corrigé par #537). On ne
reconstruit donc qu'une fois, en DEV, et INFER ne travaille qu'une fois ; DEV et
PROD finissent identiques par construction.

**Test local du 23-09** (vrai `lambda_handler`, publication interceptée, arrêt
avant INFER, trois fenêtres réelles lues en PROD) : doublons écartés, présidence
attribuée, « Mme Roy » résolue, et le défaut corrigé par #553 trouvé. Données dans
`~/Desktop/Travail/CLESSN/Vitrine/test-local-agora/` (hors dépôt).

**État de départ vérifié le 23-09** : les tables agora de DEV et de PROD sont
identiques (821 285 phrases, 287 jours, mêmes mots, 141 affiliations). Les deux
comptes lisent la même source (`rootSourceEnv = 'PROD'`).

**Ce qui change en PROD avant la reconstruction.** L'Assemblée est dissoute
depuis le 27 août : pas de nouvelle séance avant la 44e législature, donc les
runs du mardi ne font que republier les instantanés. Phrases, identités et
agrégats journaliers : inchangés. `agora_decideurs_qc` et `_deputes` : republiées
à l'identique. `agora_decideurs_qc_personnes` : créée (le site ne la lit pas).
`agora_decideurs_qc_affiliations` (lue par le site) : **change** dès que l'image
installe pplmatch#9 (Chassin, Nichols, Bélanger, Anglade corrigés).

**Étapes, dans l'ordre :**

1. Fusionner aws-refiners#553 (en-tête de présidence ; sans lui, la
   reconstruction retirerait les vice-présidents de leurs propres chiffres),
   aws-refiners#551 (version de pplmatch épinglée sur `cab7e29`,
   aucun changement de comportement), #549, et les graduer vers `main` avec
   #548 (branche `release/agora-doublons-source` déjà poussée). Les images des
   deux comptes embarquent alors le même code et la même version de pplmatch.
2. Fusionner pplmatch#6 à #9, puis une PR aws-refiners qui **avance le SHA
   épinglé** vers le nouveau `main` de pplmatch (elle reconstruit l'image du
   raffineur des phrases ; la graduer aussi). Un merge dans pplmatch seul ne
   reconstruit aucune image.
3. Prévenir Shannon : créneaux utilisés et évités (chaîne radar à 3, 7, 11, 15,
   19, 23 h ; promesses neuves à 9, 13, 17, 21 h ; passage agora du mardi).
4. Accord d'une deuxième personne. Reconstruction **en DEV**, lancée par un
   humain (le script attend les créneaux libres, pause de 2 min entre fenêtres,
   sonde de garde-fou avant tout) :
   ```sh
   PUBLICATION_ENV=DEV FN_PHRASES=<lambda DEV phrases> FN_AGREGATS=<lambda DEV agrégats> \
     tools/reconstruire_agora_parallele.sh --go
   Rscript tools/comparer_reconstruction_agora.R --env=DEV --suffixe=_reconstruction
   ```
   Si l'agrégation finale dépasse 15 min : `AGREGATS_SEULEMENT=1`.
5. Contrôles ciblés (valeurs connues) : Fitzgibbon à la moitié de ses mots ;
   Marissal 223 184 mots sur une ligne ; Nathalie Roy environ 23 500
   interventions au fauteuil ; Chassin CAQ en 2023 ; « Mme Roy (Montarville) » à
   Nathalie Roy. Échantillon vérifié à la main dans le Journal des débats.
6. Bascule **en DEV** (sauvegarde `.rds`, puis remplacement), puis une
   restauration d'essai et une nouvelle bascule pour valider le retour arrière :
   ```sh
   Rscript tools/basculer_reconstruction_agora.R --env=DEV --suffixe=_reconstruction \
     --go --accord="<nom>" --sauvegarde=~/sauvegardes-agora
   ```
7. ⚠️ Trois tables agora **n'existent pas en PROD** (vérifié le 23-09) :
   `agora_decideurs_qc_phrase_identities`, `agora_decideurs_qc_deputes_annotated`
   et `agora_decideurs_qc_concept_cache_deputes`. Sans les identités, le raffineur
   d'agrégats ne peut pas produire sa vue par député en PROD. La migration doit
   les inclure.
   **Migration DEV → PROD** des dix tables agora avec l'outil de Patrick, hors
   mardi, **rafraîchissement du site suspendu** pendant l'opération (le workflow
   `refresh-data` : réglage de dépôt, fait par un humain), puis relancé une fois
   les comptes vérifiés. Ordre amont d'abord : phrases, identités, affiliations,
   annotées, annotées par député, caches, puis `agora_decideurs_qc`, `_deputes`,
   `_personnes`.
   ```sh
   R --slave -f tools/migrate_table_dev_to_prod.R --args --table-key=agora_datamart-agora_decideurs_qc_phrases
   ```
   (même commande pour chaque table ; Patrick relit la liste avant.)
8. Parité : relancer la comparaison DEV/PROD (mêmes comptes et mêmes mots par
   élu), fusionner vitrine#858, vérifier le site, retirer les tables
   `_reconstruction` en DEV.

⚠️ À signaler à Patrick : son `STRATEGIE_MIGRATION.md` (point 15b) dit
qu'aucun raffineur ne produit `agora_decideurs_qc_affiliations` ; le raffineur
des phrases la publie désormais (`build_affiliation_dimension`).

### Fermeture des issues (à la main, pas par les PR)

Aucune PR ne porte de mot-clé de fermeture (elles disent « Refs »), et c'est
voulu : une fusion ne règle pas ces issues, et la branche par défaut
d'aws-refiners est `develop`, donc un « closes » fermerait #547 avant la
graduation vers `main` et la reconstruction. Les fermer à la main, avec un
commentaire qui résume ce qui a été fait et les chiffres vérifiés :

| Issue | Fermer quand |
|---|---|
| aws-refiners#547 (doublons, présidence, « Mme Roy ») | après la bascule en PROD, chiffres vérifiés sur le site |
| aws-refiners#546 (têtes INFER Terres et défense) | après vérification des parts d'enjeux reconstruites ; retirer alors `ENJEUX_EN_REVISION` des cartes |
| pplmatch#10 (générateur des mandats) | quand `build_mandates.py` reproduit la table (décision d'Étienne) |

### 3. Infra, sans attendre personne

- Attribuer « Le Président » (6 cas) et les vice-présidences nommées dans
  l'étiquette (« Le Vice-Président (M. Benjamin) », 3 cas) dans pplmatch. Marginal.
- Suivre pplmatch#10 avec Étienne : tant que le générateur ne reproduit pas la
  table des mandats, une régénération peut écraser les corrections de #9.
- Polimètre+ : le choix de l'IA par défaut reposait sur « rien n'est en PROD »,
  qui ne tient plus (signalé dans #550). Arbitrage d'Alexandre FC.

### 4. Site et cartes (plus tard, quand Jules rouvre le site)

- Ajouter `agora_decideurs_qc_personnes` à `scripts/tables.json` **et**
  `workers/api/src/tables.ts`, puis faire lire cette table au script des cartes
  et supprimer `fusionnerLignesParParti`.
- Exporter la dimension (fonctions, résultats, indemnités) vers `public/data/`
  et supprimer `scripts/social/donnees/*.json` et leurs scripts de collecte.
- Retirer `ENJEUX_EN_REVISION` une fois les parts d'enjeux reconstruites avec
  les nouveaux modèles, après vérification (voir #546).
- Retirer le cas `presidente` (commune d'office) une fois la parole au fauteuil
  publiée : elle entre alors dans le classement.
- Régénérer les 129 cartes, relire la planche : les raretés vont bouger.
- Relire les 77 citations du mot signature.
- Droits : photos (Assemblée), signature de Legault, logos des partis.
- Impression : texte du verso illisible au format carte (environ 2,5 points),
  fichiers imprimeur (fonds perdus, CMJN), procédé holographique, épreuve papier.
- Page de méthode publique des cartes et moyen de signaler une correction.
- PR de `feat/cartes-deputes` : rebaser sur `develop`, corps court, « Impact
  méthodologie », proposée à Jules avant d'être ouverte.

## Rustines à faire disparaître

| Rustine (script des cartes) | Donnée qu'elle compense | Disparaît avec |
|---|---|---|
| `fusionnerLignesParParti` | une ligne par élu et par parti | table `_personnes` (#549) lue par les cartes |
| `ENJEUX_EN_REVISION` | têtes INFER sur la procédure | reconstruction avec les modèles de #546 |
| `presidente` (commune d'office) | parole au fauteuil non attribuée | pplmatch#7 + reconstruction |
| `finitIndependant` (défection sans suite) | Orford sans segment IND | pplmatch#9 publié (la règle « sans affiliation » reste) |
| `NOMS_IMPRIMES` | graphies fautives ou sans accent | référentiel des portraits corrigé |
| `CHEFS`, `PARTI_ACTUEL_PAR_SIEGE` | fonctions et affiliation tenues à la main | dimension (fonction chef datée, affiliation) |
| `scripts/social/donnees/*.json`, `VIS_A_VIS_MANUELS`, `ANCIENS` | fonctions, scrutins, indemnités hors infra | pplmatch#6 publié et lu par le site |

## Règles à respecter (non négociables)

- Ne jamais modifier `public/data/` à la main.
- Ne jamais écrire dans un datamart ni lancer `--go`, `--apply` ou une
  republication sans demande explicite, et, en PROD ou sur une donnée partagée,
  sans l'accord d'une deuxième personne. Lire Athena est libre. Les invocations
  Lambda sont lancées par un humain.
- Ne jamais lire de fichier d'identifiants (`~/.Renviron`, `.env`, `~/.aws/*`).
- Pousser une branche : oui. Ouvrir une PR : la proposer d'abord. Jamais
  approuver ni fusionner.
- Commits : trailer `Assisté par : Claude Code (<modèle>)`, jamais
  `Co-Authored-By` ; PR et issues : ligne « 🤖 Assisté par … ». aws-refiners
  exige « Impact méthodologie » et un corps de PR d'environ 50 lignes au plus.
- Pas de tiret cadratin dans les textes d'équipe ou publics.
- Ne pas redessiner les tracés de Jules : proposer plutôt que changer.
- Travailler dans un `git worktree` pour ne pas toucher la copie de travail de
  l'humain ; préserver les fins de ligne (CRLF) des CSV de pplmatch.

## Pièges rencontrés le 23-09

- La table DEV `datawarehouse."a-qc-parliament-debates"` est **incomplète**
  (14 jours en 2025) : la référence est PROD.
- SSL sur assnat.qc.ca : `SSL_CERT_FILE=$(python3 -c "import certifi;print(certifi.where())")`.
- Régénérer `mandates_qc.csv` avec `build_mandates.py` change dix mandats sans
  rapport (pplmatch#10) : faire des corrections ciblées.
- `gh`/zsh : `set -- $var` ne découpe pas en mots ; `"$b:lib"` est lu comme un
  modificateur (`"${b}:lib"`).
