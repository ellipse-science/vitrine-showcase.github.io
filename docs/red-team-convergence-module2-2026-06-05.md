# Rapport red-team — Convergence/divergence Module 2 « Deux solitudes »

**Date :** 2026-06-05
**Rôle :** validateur indépendant (red-team), recalcul *from scratch* depuis Athena DEV.
**Méthode :** R + `tube`, scripts `/tmp/rt_*.R`, aucune réutilisation des chiffres fournis ni de `metrics_all.json`.

**Données :**
- `salient_index` 2025-05-17 → 2026-06-05 — 571 145 lignes objet (QC+CAN). **Remonte à plus d'un an.**
- `headline_events_4h` 2026-05-14 → 2026-06-05 — 1 105 événements, 134 blocs (3 semaines seulement).

---

## A — Reproductibilité ✅ TIENT

Recalcul indépendant, fenêtre 3 semaines (138 blocs) :

| Métrique | Annoncé | Recalculé | |
|---|---|---|---|
| Médiane convergence-objet brute | 9 % | **9 %** | ✅ |
| Bandes (Div/DivP/ConvP/Conv) | 71/17/10/2 | **72,5/15,9/9,4/2,2** | ✅ |
| Max | 86 | **86** | ✅ |
| Objets partagés/bloc (médiane) | ~8 | **8** | ✅ |
| Événement « divergence totale » (cos=0) | ~52 % | **52,2 %** (70/134) | ✅ |
| Événements couverts des 2 côtés | 7,8 % | **7,8 %** | ✅ |

Reproduction propre, au point près.

---

## B — Fenêtre d'échantillon ❌ CASSÉ (le plus grave)

La conclusion repose sur 3 semaines **non représentatives**. Backtest de la métrique-objet sur **toute l'année** (2 306 blocs, possible car `salient_index` remonte à 2025-05) :

| | 3 sem. (fenêtre utilisée) | **Année complète** |
|---|---|---|
| Médiane convergence | 9 % | **18 %** (×2) |
| Bande « Divergence » | 72,5 % | **58,4 %** |
| Bande « Convergence » | 2,2 % | **7,5 %** |

Médiane mensuelle (% bande Divergence) :

```
2025-06: 35  (div 42%)     2026-01: 36  (div 35%)
2025-07: 19  (div 59%)     2026-02: 28  (div 48%)
2025-08: 17  (div 58%)     2026-03: 30  (div 43%)
2025-09: 11  (div 72%)     2026-04: 21  (div 53%)
2025-10: 15  (div 62%)     2026-05: 8   (div 73%)  ← fenêtre utilisée = creux annuel
2025-11: 10  (div 78%)     2026-06: 16  (div 67%)
2025-12: 14  (div 73%)
```

**Mai 2026 est un des creux de convergence de l'année.** La médiane oscille de 8 à 36 ; la part « Divergence » de 35 % à 78 %. Le « 71 % de divergence » et les seuils calibrés dessus sont un **artefact de période**. En janvier 2026, le même module aurait affiché « convergence partielle » comme mode.

---

## C — Brut vs stoplist géo ⚠️ FRAGILE mais défendable

Top contributeurs au produit scalaire (cosinus), fenêtre 3 sem. :
`canada` 7,60 · `mark carney` 4,32 · `united states` 2,90 · `donald trump` 1,83 · `quebec` 1,45 · `alberta` 1,41 · `danielle smith` 0,90 · `ottawa` 0,36…

- **58,6 % du signal de convergence vient d'entités géo/juridictions génériques** (canada, états-unis, québec, alberta, ottawa, montréal, ontario, C.-B.). Le reste vient de vraies figures. ≈ moitié géo / moitié réel.
- Retirer la stoplist ne fait **pas basculer** la distribution : médiane 9 %→4,5 % (année 18 %→15 %), bande Div 72,5 %→81,2 %. Le cosinus se normalise (on retire du numérateur *et* des normes) → auto-compensation. La géo gonfle la convergence de **quelques points seulement**.

Tension : full-IDF rejeté pour avoir tué `carney` — or `carney` (fréquent) et `canada` (fréquent) sont downweightés ensemble.
**Reco :** petite stoplist ciblée (canada, états-unis, québec, ottawa, montréal, alberta, ontario, c.-b.) + re-calibrer les seuils, et divulguer la part géo. Pas full-IDF.

---

## D — Objet vs Histoire ⚠️ FRAGILE (point crucial)

Vérité terrain sur 10 blocs (Unes réelles lues). Accord bon aux extrêmes, lâche au milieu :

| Bloc | Score-obj | Réalité terrain | Verdict |
|---|---|---|---|
| 05-31 20-24 | 0 | QC: rassemblement raciste Shawinigan / CAN: Danielle Smith-Carney | Vraiment divergent ✅ |
| 05-24 00-04 | 6 | QC: hockey CH-Hurricanes / CAN: sécession Alberta, Trump-Hormuz | Vraiment divergent ✅ |
| 06-02 12-16 | 27 | **CUSMA/ACEUM partagé** + (QC: bambin LaSalle / CAN: IA Anthropic) | Partiel correct ✅ |
| 06-03 16-20 | 43 | **Trump/US/Iran partagé** (angles ≠) | Partiel correct ✅ |
| 06-02 20-24 | 55 | **Trump « 51e état »/Carney/CUSMA — même histoire** | Convergent correct ✅ |
| 05-18 12-16 | 86 | **Suspension comité défense Canada-US — même histoire** | Convergent correct ✅ |

Deux modes d'erreur confirmés :
- **Sur-comptage « même objet, histoire ≠ »** : 06-01 20-24, score 21 — `carney`+`canada` partagés tirent le score, mais les Unes diffèrent (Shawinigan QC vs récession/Banque du Canada). Effet modeste.
- **Sous-comptage** : 05-19 12-16, score 3 — les deux couvrent **les Snowbirds cloués au sol**, mais QC l'attache à `ottawa`, CAN à `royal canadian air force` → recoupement manqué.

Le cosinus-objet mesure « mêmes **sujets** saillants », **pas** « mêmes histoires ». Approximation acceptable, à assumer explicitement.

---

## E — « Divergence totale = artefact » ⚠️ PARTIELLEMENT VRAI / sur-vendu

Croisement des 70 blocs où événement-cosinus = 0 :

- **48/70 (69 %) ont aussi objet ≤ 10** → les deux métriques s'accordent : **divergence RÉELLE**, pas artefact.
- **4/70 ont objet ≥ 40** = vrais ratés de clustering. Cas net (confirmé par titres) : **06-02 20-24, événement=0 mais objet=55** — histoire Trump « 51e état »/Carney partagée des 2 côtés mais **pas un seul événement fusionné cross-frontière** (nboth=0).
- Même quand le clustering attrape l'histoire, il sous-estime : 05-18 (objet 86) → événement-cosinus 55, stocké 44.

Spearman(événement, objet) = **0,54**. La métrique-événement **sature brutalement à 0**.

Conclusion : le « 52 % de divergence totale » n'est **pas majoritairement un artefact** (~70 % réel). Le défaut de la métrique-événement : **quantifiée trop brutalement** (0 dès qu'aucun événement n'est fusionné) et **rate ~30 % des recoupements**. La métrique-objet est meilleure (dégrade en douceur, récupère les ratés), mais la rhétorique « la divergence est fausse » est **trop forte**.

---

## F — Qualité salient_index / espace anglais commun ⚠️ FRAGILE

- Médiane : **100 objets/bloc QC, 141 CAN, seulement 12 partagés** (Jaccard de vocabulaire **0,05**).
- Vocabulaire distinct : 57 364 objets QC, 67 724 CAN, **12 619 partagés**.
- **~9,9 % des lignes-objet QC portent du français résiduel** (vs 0,8 % CAN) — jamais appariables côté CAN (« québec solidaire », « bloc québécois », noms d'écoles, « 25 millions de dollars », « 92637552 québec inc »…). **Biais structurel à la baisse** de ~10 % de la masse de saillance QC.

L'espace anglais commun **existe** (carney, trump, canada, alberta s'apparient) mais il est **leaky** : normalisation EN imparfaite côté QC. Tolérable (cosinus pondéré-saillance) mais abaisse mécaniquement la convergence.

---

## G — Sens éditorial des niveaux ✅ TIENT (dans cette fenêtre)

Lecture terrain (point D) → les bandes correspondent : Div = histoires différentes ; DivP = recoupement partiel réel (CUSMA, Iran) ; ConvP/Conv = même histoire phare. Seuils 25/50/75 **défendables en forme**. **Réserve** : à cause de B, ces seuils figés produisent un mot-de-module trompeur hors de mai 2026.

---

## H — Intégrité score stocké ✅ CONFIRMÉ + cause trouvée

- **61/119 blocs (51 %)** : stocké ≠ cosinus recalculé depuis les score_qc/roc publiés. **54/61 : stocké plus divergent** (Δ jusqu'à −26).
- **Cause racine :** `compute_interval_divergence` (`runtime.R:1523`) tourne à l'étape 5.5 sur **`events_df` complet** (tous les clusters), mais la table ne publie que le **top 5–9 événements/bloc** (médiane 8, vérifié). La traîne d'événements **unilatéraux** vue par le refiner gonfle les normes sans nourrir le produit scalaire → cosinus stocké systématiquement **plus divergent**, et **non recalculable** depuis les lignes publiées. = pré-**TRONCATURE** top-N (pas pré-dédup).

Devient sans objet avec la métrique-objet (pas de troncature), mais reste un problème tant que le score-événement est stocké/affiché.

---

## I — Bug frontend (ROC dérivé inclut USA) ✅ CONFIRMÉ

- Empirique : `score_saillance = score_qc + score_roc + score_us` **exactement** (corrélation 1,000, |écart| médian 0). Donc `roc = score_saillance − score_qc` (`headlineEvents.ts:450, 562-571`) **= score_roc + score_us**.
- **359/1105 événements (33 %) ont score_us > 0** → pour un tiers des événements, le côté « Canada » du Module 2 **absorbe à tort la saillance américaine**.
- Correctif (lire `score_roc` directement, séparer `score_us`) = **correct et nécessaire**.
- En prime : le loader **ignore `interval_convergence_score`**, recalcule un **Jaccard** (≠ cosinus), et la métrique-objet **n'est pas encore branchée**. Le régime `convPct ≥ 65 → "convergence"` (ligne 460) n'est quasi jamais atteint.

---

## J — Contre-propositions

1. **Mesure asymétrique QC→CAN (recommandée en complément).** Le cosinus est symétrique ; « deux solitudes » est directionnel. `couverture_QC_dans_CAN = Σ(saillance QC sur objets aussi salients CAN)/Σ(saillance QC)` et l'inverse → raconte *qui suit qui*. Gratuit depuis les mêmes données.
2. **Fenêtre glissante pour le mot-de-module (corrige B).** Médiane glissante 30 jours, re-calibrée.
3. **Petite stoplist géo + divulgation (corrige C).** Pas full-IDF.
4. **Cosinus niveau enjeu-CAP : NE PAS prendre comme primaire.** Espace 12-enjeux trop basse-dimension → convergence quasi toujours haute. Couche de contexte, pas indice.
5. **Garder objet comme primaire**, mais l'afficher comme « mêmes sujets saillants » et non « mêmes nouvelles » (honnêteté du point D).

---

## Synthèse

**(1) Peut-on intégrer en confiance ?** — **Oui pour la mécanique, non pour le discours actuel.** La métrique-objet brute est correcte, reproductible, supérieure au score-événement, et tranche bien aux extrêmes. Mais **n'intégrez pas les chiffres/seuils figés sur mai 2026** ni la rhétorique « la divergence-événement est un artefact ». Intégrez la métrique ; recalibrez et reformulez.

**(2) Les 3 risques majeurs :**
1. **Fenêtre non représentative (B)** — « 71 % de divergence » et les seuils sont un creux saisonnier ; sur l'année c'est 58 % / médiane 18 %.
2. **Objet ≠ histoire (D) + leak français (F)** — sur-compte les figures co-salientes (carney, canada) et est plombé de ~10 % par le français résiduel QC.
3. **Sur-vente de l'argument-artefact (E)** — ~70 % des « divergences totales » sont réelles.

**(3) Recommandations concrètes :**
- ✅ Corriger le bug frontend USA (point I) — sans regret, indépendant du reste.
- ✅ Adopter la métrique-objet, mais **re-calibrer les seuils sur ≥6 mois** (données disponibles) et passer le mot-de-module en **fenêtre glissante**.
- ✅ Petite stoplist géo ciblée + divulguer la part géo ; **pas** full-IDF.
- ✅ Ajouter la **mesure asymétrique QC→CAN** comme angle éditorial.
- ✅ Reformuler la méthodo : « mêmes **sujets** saillants » (pas « mêmes histoires ») ; « divergence **réelle et majoritaire**, **sur-quantifiée** par le clustering et qui en **rate ~30 %** » plutôt que « artefact ».
- ⚠️ Si le score-événement reste affiché : régler l'intégrité H (calculer la divergence sur le **même** jeu d'événements que celui publié).

---

*Scripts de recalcul : `/tmp/rt_pull_master.R`, `/tmp/rt_analysis1.R`, `/tmp/rt_analysis2.R`, `/tmp/rt_analysis3.R`, `/tmp/rt_pull_titles.R`. Creds Athena via `~/.Renviron` (AWS_*_DEV).*
