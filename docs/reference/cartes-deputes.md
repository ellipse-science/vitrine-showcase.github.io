# Cartes de député : méthodologie

Document de référence interne de la série de cartes de la 43e législature
(`scripts/social/cartes-deputes.ts`). Il consigne **chaque choix
méthodologique**, sa source et ses limites, pour qu'on puisse le défendre,
le refaire ou le changer en connaissance de cause. Rédigé le 23 septembre 2026.
Si un choix change dans le code, cette page change dans le même commit.

La page Méthodologie publique n'en parle pas encore : elle sera à écrire au
moment de publier les cartes sur le site (voir la dernière section).

## Périmètre

| | |
|---|---|
| Législature | 43e, de l'élection générale du **3 octobre 2022** à la dissolution du **27 août 2026** |
| Série | **125 sièges, 129 cartes** : une carte par siège, plus 4 cartes de députés remplacés en cours de route |
| Données de parole | fichiers agora du site (`public/data/agora/`), dernière séance couverte le 12 juin 2026 |
| Données ajoutées pour les cartes | fonctions, rémunération, résultats électoraux, vis-à-vis : `scripts/social/donnees/` |

## 1. Numérotation et composition de la série

- **Un numéro par siège**, dans l'ordre alphabétique des circonscriptions
  (1 à 125). Un député remplacé en cours de législature (démission, décès)
  partage le numéro de son siège, suivi d'une lettre : Arthabaska est la 6,
  Alex Boissonneault la 6, Éric Lefebvre la 6A. Les lettres suivent l'ordre
  inverse des départs (A = le plus récent).
- **L'élu en poste** est celui dont le mandat finit le plus tard, ou pas du
  tout. Une défection vers le statut d'indépendant ferme un segment
  d'affiliation sans que l'élu quitte son siège : ce n'est pas un départ.
- **Les indépendants** n'ont pas de casier sur le site, mais leur siège a sa
  carte. Seuls entrent ceux dont le siège n'a aucune autre carte (Youri
  Chassin, Saint-Jérôme) ; un élu passé indépendant en cours de route garde sa
  carte sous son parti d'élection, et son verso le dit (« Indépendant (élu
  CAQ) »).
- **Allégeance actuelle** : quand une même personne occupe deux lignes
  (Maïté Blanchette Vézina, CAQ puis PCQ), la carte suit l'allégeance actuelle
  (`PARTI_ACTUEL_PAR_SIEGE`).

## 2. Parole à l'Assemblée (verso, tableau)

- **Une seule ligne : la législature.** Ce sont des cartes de législature ; la
  session et la dernière séance appartiendront aux éditions de session, en
  ligne. La ligne porte « Législature 2022-2026 ».
- Interventions, mots prononcés, richesse lexicale (MATTR, 5 niveaux relatifs
  aux élus de la même période) et ton : repris tels que le site les calcule.

### Enjeux : deux catégories écartées

Terres publiques et agriculture, et Affaires internationales et défense, sont
**retirées des parts** des cartes, et les dix autres enjeux sont ramenés à
100 %. Raison : les classifieurs INFER `public_lands` et `defense`, calibrés
sur la presse, étiquettent des phrases de procédure du Salon bleu (« Il n'y a
pas de consentement. ») ; Terres sortait enjeu dominant de 59 élus sur 129.
Diagnostic et pistes : **aws-refiners#546**. Le site n'est pas modifié. À
retirer quand le classifieur sera recalibré (`ENJEUX_EN_REVISION`).

### Mot signature

Repris du site. **Sans mot distinctif, l'encadré est retiré** (une
cinquantaine d'élus), plutôt que d'afficher une boîte qui dit qu'il n'y a
rien. La note du verso ne le définit alors pas non plus.

## 3. Fonctions exercées

**Source** : la fiche de chaque député sur assnat.qc.ca, section « Fonctions
politiques, parlementaires et ministérielles », qui date chaque fonction (« du
29 novembre 2022 au 27 août 2026 », « depuis le 7 novembre 2024 »). Les pages
de synthèse de l'Assemblée ne suffisent pas : aucune ne liste les présidents
de séance ni les porte-parole. La table `dim-qc-parliament-members-staging`
(datawarehouse) a une colonne `functions`, mais c'est un instantané du
21 juin 2024, inutilisable.

- Collecte : `scripts/social/fonctions-deputes.ts`, une fiche toutes les
  0,7 s, cache dans `social-out/.cache-assnat/`. 125 fiches, extraites le
  22 septembre 2026.
- **Anciens députés** (Lefebvre, Fitzgibbon, Laforest, Boutin) : l'index ne
  les liste plus et leur page n'offre qu'une biographie en prose. Leurs
  mandats et fonctions rémunérées sont **transcrits à la main** depuis cette
  biographie (constante `ANCIENS`, source citée).
- **Homonymes** : deux Eric Girard (Groulx, Lac-Saint-Jean). Tout appariement
  passe par l'identifiant de l'Assemblée ou la circonscription, jamais par le
  nom seul.
- **Titres régionaux** (« Ministre responsable de la région de… ») : écartés
  de la frise et des vis-à-vis. Ils ne désignent pas un portefeuille et ne
  changent pas la rémunération (le député est déjà ministre).

### Frise « Parcours et rémunération » (verso)

Pour chaque jour du mandat, la **fonction la mieux payée** (c'est elle qui
fixe la rémunération). Des jours consécutifs au même taux forment un segment ;
plusieurs portefeuilles tenus en même temps forment un seul segment
(« Ministre (8 portefeuilles) »). Une fonction moins payée exercée en même
temps n'apparaît donc pas. L'axe va du 3 octobre 2022 au 27 août 2026 pour
toutes les cartes ; le temps hors mandat est hachuré.

### Intitulés abrégés (légende de la frise)

Les intitulés officiels vont jusqu'à 180 caractères. On ne les tronque jamais
en plein mot ; on les abrège par règles qui gardent un intitulé vrai
(`titreCourt`) :

1. précisions entre parenthèses retirées (« (volet santé mentale) ») ;
2. ordinaux en chiffres (« 2e groupe d'opposition ») ;
3. ministre : premier portefeuille de l'intitulé (« Ministre de l'Économie ») ;
4. adjoint parlementaire : ministère entre parenthèses (« Adjointe
   parlementaire (Santé) ») ;
5. commission trop longue : « Vice-présidente de commission (Citoyens) » ;
6. trois cas abrégés à la main (`ABREGES`), dont « Relations avec les
   Premières Nations et les Inuit » → « Affaires autochtones ».

Seuil : 55 caractères. Un intitulé que le texte doit rapetisser pour tenir est
signalé par le contrôle de rendu, pour qu'on ajoute une règle.

### Code de fonction (recto)

Le sigle de la fonction la mieux payée pendant la législature, dans l'ordre du
barème : PM (première ministre), PAN (présidence de l'Assemblée), M
(ministre), CO (chef d'un groupe d'opposition), VP (vice-présidence de
l'Assemblée), LP (leader parlementaire), W (whip), PCA (présidence de
caucus), PC (présidence de commission), AP (adjoint parlementaire), VC
(vice-présidence de commission), PS (présidence de séance), B (Bureau), PP
(porte-parole sans fonction rémunérée), D (député sans fonction).
Conséquence connue : Pierre Dufour porte « M » pour 17 jours de ministère au
début de la législature.

## 4. Rémunération

**Ce qui est compté** : l'indemnité annuelle de base et l'indemnité
additionnelle de fonction. **Ce qui ne l'est pas** : allocation de dépenses,
allocation de transition, régime de retraite, remboursements de frais.

### Indemnité de base

| En vigueur depuis | Montant | Source |
|---|---|---|
| 1er avril 2022 (inchangée au 1er avril 2023) | 101 561 $ | page « Indemnités et allocations », versions archivées (archive.org) |
| 7 juin 2023 | 131 766 $ | L.Q. 2023, c. 14 (projet de loi 24), en vigueur le 7 juin 2023, sans rétroactivité |
| 1er avril 2025 | 141 625 $ | page archivée d'août 2025 |
| 1er avril 2026 | 146 375 $ | page actuelle |

### Indemnités additionnelles

Un pourcentage de la base, **inchangé de 2022 à 2026** (tableaux archivés
comparés) : premier ministre 105 % ; ministre, présidence de l'Assemblée, chef
de l'opposition officielle 75 % ; vice-présidence de l'Assemblée, chefs des
2e et 3e groupes, leader de l'opposition officielle, whip en chef du
gouvernement 35 % ; whip en chef de l'opposition officielle 30 % ; leader du
2e groupe, leader adjoint du gouvernement, présidence de caucus du
gouvernement, présidence de commission 25 % ; présidence de caucus de
l'opposition officielle 22,5 % ; whip du 2e groupe, leader adjoint de
l'opposition officielle, whip adjoint du gouvernement, adjoint parlementaire,
vice-présidence de commission 20 % ; présidence de séance, membre du Bureau
15 %.

- **Cumul** : un député qui cumule plusieurs fonctions « n'a droit qu'à
  l'indemnité la plus élevée » (page de l'Assemblée). On ne les additionne pas.
- **Interprétations** : ministres délégués comptés comme ministres (le barème
  ne les distingue pas) ; membres suppléants du Bureau non payés à ce titre ;
  Commission de l'Assemblée nationale, sous-commissions et commissions
  spéciales sans indemnité (seules les dix commissions permanentes
  sectorielles comptent).

### Calcul

Jour par jour, du **début du mandat** (élection générale ou partielle) à la
**dissolution** (27 août 2026) ou au **jour de la démission** compris :
(base du jour × (1 + taux de la fonction la mieux payée ce jour-là)) ÷ 365.

- **Total** : la somme sur la législature (de 74 110 $ pour Marie-Karlynn
  Laflamme, élue en février 2026, à 988 689 $ pour François Legault).
- **Moyenne par année** : le total ramené à 365 jours de présence, pour qu'un
  élu de partielle ne paraisse pas sous-payé.
- Les ministres de l'ancien Conseil restés en poste après le 3 octobre 2022
  sont payés comme ministres jusqu'à leur remplacement, comme leur fiche le
  date.

## 5. Résultat électoral (verso)

Source : données ouvertes d'Élections Québec, un `resultats.json` par scrutin
(générale du 3 octobre 2022, partielles des 13 mars et 2 octobre 2023, 17 mars
et 11 août 2025, 23 février 2026). Script : `scripts/social/resultats-elections.ts`.

- On garde le gagnant de chaque circonscription : part des voix, **avance sur
  le deuxième** (`nbVoteAvance`, calculée par Élections Québec), participation.
- Appariement : même circonscription **et** même nom de famille, à deux
  lettres près (le référentiel des portraits écrit « Jolin-Barette ») ; le
  scrutin le plus récent l'emporte (Chicoutimi : Laforest en 2022, Laflamme
  en 2026).

## 6. Vis-à-vis

Un dossier de porte-parole (« … en matière de santé ») est rapproché du
**ministre qui tenait le portefeuille pendant la même période**.

- Rapprochement par mots communs entre le domaine du dossier et celui du
  portefeuille (racines de 5 lettres, mots vides retirés), score ≥ 0,5 et un
  seul candidat ; sinon, pas de duel.
- **Corrections manuelles** (`VIS_A_VIS_MANUELS`) quand le ministre ne se lit
  pas dans le titre (protection des consommateurs → Justice, DPJ → Services
  sociaux, CPE → Famille…). Elles désignent un **portefeuille**, pas un nom,
  pour survivre aux remaniements et aux homonymes.
- **16 dossiers laissés sans vis-à-vis** faute de ministre certain : éthique,
  indépendance, communautés LGBTQ+, handicap et autisme, nationalisme
  inclusif, économie sociale, intimidation, relations avec les citoyens,
  ordres professionnels, défense et aéronautique, allègement réglementaire.
- **Sur toute la législature** : chaque dossier daté est apparié aux ministres
  successifs, au prorata des jours de chevauchement (Santé : Christian Dubé,
  puis Sonia Bélanger). 38 porte-parole, 78 élus liés à au moins un duel.
- Les vis-à-vis **ne sont pas imprimés** et ne servent plus à la rareté depuis le 23-09 (voir § 7). Ils restent calculés.

## 7. Rareté

Grille du 23 septembre 2026 (décision de Jules).

| Rareté | Qui | Cartes | Au recto |
|---|---|---|---|
| Légendaire | les premiers ministres de la législature (Legault, Fréchette) | 2 | 4 fleurs, photo pleine, ligne diamant |
| Rare | les 10 % d'élus qui ont prononcé le plus de mots | 13 | 3 fleurs, bandeau à la couleur du parti, lignes or |
| Peu commune | les 35 % suivants | 44 | 2 fleurs, ligne argent, coin de l'écusson à la couleur du parti |
| Commune | les autres, et la présidente | 70 | 1 fleur, cadre de base |

- **Mesure : les mots prononcés au Salon bleu sur la législature**, tels que
  le verso les affiche. Ce qu'on mesure, c'est la saillance de l'élu sur
  toute la législature : un mandat plus court donne moins de mots, et c'est
  voulu (élus partiels, départs).
- **Mots plutôt qu'interventions** : les vice-présidents cumulent des
  milliers d'interventions de procédure (Benjamin 10 577, Lévesque 9 701,
  Soucy 8 929, à 26 à 42 mots chacune) et occupaient la tête du classement
  par interventions. Limite : leurs mots de présidence comptent quand même
  (Lévesque est 7e en mots, Benjamin est rare).
- **Chefs de parti dans le calcul**, sans catégorie d'office.
- **La présidente (Nathalie Roy) est commune d'office.** Un sceau or sur
  la photo a été essayé puis retiré le 23-09. Dans les transcriptions, ce qu'elle dit en
  présidant est attribué à « la Présidente », pas à son nom : 6
  interventions et 18 371 mots sur la législature. Le calcul la classerait
  commune pour un défaut de données ; on l'écrit plutôt que de le cacher.
- Pourcentages appliqués aux 126 élus classés, arrondis (13 et 44).
  Égalités départagées par le numéro de carte. Calculée sur la série
  entière, avant tout filtre : une carte tirée seule garde sa rareté.
- **Données à vérifier** avant impression : Vincent Marissal (5 380 mots)
  et Maïté Blanchette Vézina (5 989) sont presque en bas du classement,
  peu plausible pour Marissal ; possible défaut d'appariement dans agora.
- Grilles abandonnées : le 22-09, poids des fonctions rémunérées et des
  duels de porte-parole, classé par camp (trop difficile à expliquer, et
  sans équivalent clair des ministres dans l'opposition) ; avant, cinq et
  six catégories, seuils fixes, quotas de 15 et 20 %.

## 8. Présentation

- **Édition** : « 43e législature » au recto, « 43e législature · 2022-2026 »
  au verso ; « carte N de 125 ».
- **Édition holographique** : chaque carte a un verso holographique (reflet
  irisé), sans numéro de tirage ; le recto d'une carte holo est le recto
  ordinaire.
- **Signature** (légendaires) : tracé blanc tiré d'une image fournie
  (`scripts/social/donnees/signatures/<slug>.jpg`) ; seule celle de François
  Legault existe. **Question ouverte** : une mention « fac-similé » pour
  qu'on ne croie pas la carte signée ou approuvée par l'élu.
- **Contrôles de rendu** : chaque page est mesurée (débordement en haut et en
  bas du panneau, lignes d'en-tête coupées, intitulés rapetissés). Le gabarit
  légendaire n'a pas de panneau : il n'est vérifié qu'à l'œil.

### Note de méthode (verso)

Chaque élément visuel de la carte, recto compris, y est nommé et justifié en
une phrase : sources, richesse lexicale, ton, frise, rémunération, parts,
mot signature, sigle, filet de l'enjeu, fleurs de lys et règle de rareté. Une
phrase ne paraît que si son élément paraît sur la carte. Corps de 15 px :
à 17 px, onze versos débordaient. « Relu à la main » n'est vrai que parce
que le verrou de `--png` impose la planche avant les images.

## Reproduire

```sh
npx tsx scripts/social/fonctions-deputes.ts      # fonctions, rémunération, vis-à-vis (--rafraichir pour retélécharger)
npx tsx scripts/social/resultats-elections.ts    # résultats d'Élections Québec
npx tsx scripts/social/cartes-deputes.ts --sans-ouvrir          # planche des 129 cartes
npx tsx scripts/social/cartes-deputes.ts --png --sans-ouvrir    # PNG (après relecture de la planche)
```

## Données produites et suite

`scripts/social/donnees/fonctions-deputes.json` et
`resultats-elections.json` sont des **copies locales** au script des cartes.
Selon le registre des données de référence, la source d'identité des
député·e·s est la dimension `dim_qc_parliament` (paquet `pplmatch`) ; les
fonctions datées et les résultats électoraux devront y être versés plutôt que
de rester ici. Avant de publier les cartes sur le site : écrire la section
de la page Méthodologie publique (skill `redaction-methodologie`) et remplir
la case « Impact méthodologie » de la PR.
