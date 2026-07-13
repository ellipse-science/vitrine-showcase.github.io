# Red-team — Métrique de convergence/divergence QC↔CAN du Module 2 « Deux solitudes »

**Date de l'exercice : 2026-06-05** (session red-team indépendante, pilotée par Adrien avec Claude Code, en aval de la session d'analyse du même jour).

> ⚠️ **Note de provenance (2026-07-13).** Ce fichier est une **reconstitution** : le rapport original du 2026-06-05, cité par les issues [vitrine#143](https://github.com/ellipse-science/vitrine-showcase.github.io/issues/143) et [aws-refiners#173](https://github.com/ellipse-science/aws-refiners/issues/173), n'a jamais été commité (il vivait dans la session d'analyse et ses scripts `/tmp/rt_*.R`). Reconstitué depuis la mémoire de session pour que les renvois des deux issues cessent d'être des liens morts. Les verdicts, chiffres et formulations ci-dessous sont ceux de l'exercice original ; en cas de doute, la source de vérité reste les données (`salient_index`, `headline_events_4h` sur Athena) et les issues de handoff.

## Contexte et mandat

La session d'analyse du 2026-06-05 avait diagnostiqué la métrique de convergence du Module 2 (`interval_convergence_score`, cosinus au niveau **événement** produit par `radar-event-salience`) et proposé un prototype **P1 : cosinus au niveau OBJET** depuis `salient_index` (objets normalisés EN, partagés QC/CAN), indépendant du clustering. Conclusions provisoires : médiane de divergence 100 % → 91 %, blocs à 100 % de divergence 69 → 10, ~8 objets partagés/bloc.

Le red-team a reçu le mandat de **tout recalculer from scratch** depuis Athena DEV (sans réutiliser les scripts de l'analyse) et d'attaquer chaque conclusion. Scripts indépendants `/tmp/rt_*.R`.

## Verdicts A–J

- **A ✅ Reproduction exacte.** Les chiffres de l'analyse sont reproduits au point près : médiane-objet brute 9 %, bandes 72,5/15,9/9,4/2,2, max 86, ~8 objets partagés/bloc ; 52,2 % des blocs à cosinus-événement = 0 ; 7,8 % des événements couverts bilatéralement.

- **B ❌ LE PLUS GRAVE — fenêtre non représentative.** `salient_index` remonte à **2025-05-17** (>1 an, 2306 blocs) alors que l'analyse n'avait que 3 semaines de `headline_events_4h`. Sur l'ANNÉE : médiane de convergence **18 % (pas 9)**, bande « Divergence » **58 % (pas 72)**. **Mai 2026 = creux annuel.** La médiane mensuelle oscille de 8 à 36, la bande Divergence de 35 à 78 %. ⟹ « 71 % de divergence » et les seuils calibrés sur 3 semaines = **artefact de période**. Reco : recalibrer sur ≥ 6 mois et baser le mot du module sur une **fenêtre glissante**.

- **C ⚠️ Signal géo générique.** **58,6 %** du produit scalaire vient d'entités géographiques génériques (canada 7,6, états-unis 2,9, québec, alberta, ottawa…) contre les vraies figures (carney 4,3, trump 1,8). MAIS une stoplist géo ne fait pas basculer le verdict (médiane 9 → 4,5, plus divergent) car le cosinus s'auto-normalise. Reco : **petite stoplist ciblée**, pas de full-IDF.

- **D ⚠️ Vérité terrain (10 blocs relus à la main).** Bon accord aux extrêmes (0 = hockey vs Alberta, divergence réelle ; 86 = comité de défense Canada-US, partage réel ; 55 = « Trump 51ᵉ état », partagé). La métrique **sur-compte** « même objet, histoires différentes » (carney/canada) et **sous-compte** quand les objets nommés diffèrent (Snowbirds : `ottawa` côté QC vs `royal canadian air force` côté CAN). ⟹ elle mesure « mêmes **sujets** », pas « mêmes histoires ».

- **E ⚠️ « Artefact » sur-vendu.** Sur 70 blocs à cosinus-événement = 0, **48 (69 %) ont aussi un cosinus-objet ≤ 10 → la divergence est RÉELLE, pas un artefact**. Seuls 4 blocs ont objet ≥ 40 (vrais ratés de clustering, ex. 2026-06-02 20-24 : objet 55, événement 0, aucun événement bilatéral). Spearman(événement, objet) = 0,54. Le défaut de la métrique-événement n'est pas qu'elle « ment » : elle **quantifie trop brutalement** (saute à 0) et **rate ~30 % des recoupements**. Reformulation exigée : « divergence réelle et majoritaire, **sur-quantifiée** par le clustering » — pas « artefact ».

- **F ⚠️ Leak français.** Par bloc : médiane 100 objets QC, 141 CAN, **12 partagés** (Jaccard vocabulaire 0,05). **~10 % des lignes-objet QC portent du français résiduel** (vs 0,8 % CAN), jamais appariables → **biais structurel à la baisse** de la convergence. L'espace anglais commun existe mais fuit.

- **G ✅ Forme des bandes.** Les 4 bandes collent au terrain ; les seuils sont défendables **en forme** (symétrie 25/50/75) mais fragiles **en calibration absolue** (cf. B).

- **H ✅ Bug d'intégrité — cause trouvée.** 51 % des blocs ont un score stocké ≠ recalculé depuis les lignes publiées ; 54/61 fois le stocké est **plus divergent**. Cause : `compute_interval_divergence()` tourne sur `events_df` **complet**, mais la table ne publie que le **top 5–9 événements/bloc** (médiane 8). La traîne d'événements unilatéraux gonfle les normes → score non reproductible. = pré-**troncature top-N** (pas pré-dédup).

- **I ✅ Bug USA confirmé empiriquement.** `score_saillance = score_qc + score_roc + score_us` **exactement** (corrélation 1,0). Le frontend dérive `roc = score_saillance − score_qc` = `score_roc + score_us`. **359/1105 événements (33 %) ont `score_us` > 0** → le côté « Canada » du module absorbe la saillance américaine. Le loader ignore aussi `interval_convergence_score` (recalcule un Jaccard maison) et la métrique-objet n'est pas branchée. *(Note 2026-07-13 : le Jaccard maison a depuis été remplacé par la lecture du score ; le bug USA est corrigé par vitrine PR #237.)*

- **J Recos additionnelles.** Ajouter une mesure **asymétrique QC→CAN / CAN→QC** (« qui suit qui ») depuis les mêmes vecteurs ; la projection CAP-12 est trop basse-dimension pour être la mesure primaire (option secondaire seulement) ; garder l'objet comme niveau primaire mais **relabel « sujets »**.

## Verdict global

Intégrer la **MÉCANIQUE** objet (oui), mais **PAS** les chiffres/seuils figés de mai 2026 ni la rhétorique « artefact ». Recalibrer sur ≥ 6 mois, fenêtre glissante pour le mot affiché, corriger le bug USA (sans regret), reformuler la méthodologie (« mêmes sujets saillants », « sur-quantifiée par le clustering »).

## Recalibration (2026-06-06, à la suite du red-team)

Recalcul sur **13 mois (2025-05 → 2026-06, n = 2306 blocs)** ; 2 planches générées (`scripts/generate_convergence_charts.py`), dont la tendance mensuelle (saisonnalité forte → fenêtre glissante).

**Pondération finale = cosinus-objet BRUT (saillance), SANS IDF.** Testé brut / √IDF / full-IDF : le full-IDF est trop agressif (95 % divergence) — il écrase les grands sujets fédéraux co-suivis (ex. « mark carney », couvert fort des deux côtés mais IDF bas car fréquent). Précédent éditorial de la même méthode : article La Presse « Budget fédéral 2025-2026 : après les chiffres, les mots » (8 nov. 2025, Adrien expert cité) — cosinus + TF-IDF + stoplist y fonctionnait car on comparait des documents intrinsèquement similaires (deux budgets) ; comparer deux espaces médiatiques par bloc de 4 h est l'inverse : ce qu'ils partagent, ce sont les grandes histoires FRÉQUENTES, que l'IDF efface.

**Méthode finale : cosinus-objet brut + petite stoplist géo (4 termes : canada, états-unis, québec, ottawa** — provinces gardées, 2 % du signal seulement ; « united states » était le 1ᵉʳ contributeur, géo générique ≈ 30 % du signal, vraies figures 68 %).

Distribution 13 mois (seuils symétriques 25/50/75 sur la convergence) :

| Niveau | Part |
|---|---|
| Divergence | 63 % |
| Divergence partielle | 17 % |
| Convergence partielle | 13 % |
| Convergence | 7 % |

Médiane 14 % · saisonnalité mensuelle 4 % → 34 % · asymétrie QC↔CAN ≈ symétrique sur l'année (29 % vs 31 %).

## Suites données

- Issues de handoff (2026-06-06) : [aws-refiners#173](https://github.com/ellipse-science/aws-refiners/issues/173) (indice objet côté refiner) et [vitrine#143](https://github.com/ellipse-science/vitrine-showcase.github.io/issues/143) (bug USA + refonte frontend + méthodo).
- Feedback d'équipe postérieur (Slack, 2026-06-08, Yannick) : le **mot affiché** doit suivre une **logique de centile** (« plus/moins divergent que d'habitude »), pas un score absolu — intégré à #143 en addendum le 2026-07-13.
- Chantier lancé le 2026-07-13 : vitrine PR #237 (bug USA) et aws-refiners PR #211 (indice objet, closes #173).
