# Baseline — résultats (étape 3)

**Date :** 2026-06-27
**Méthode :** 3 sous-agents en **contexte neuf**, lecture seule, **sans skill** (les skills n'existent pas encore), chacun recevant la `query` brute de l'eval (sans lui montrer les `expected_behavior`). Notation faite ensuite contre `expected_behavior`.
**Mise en garde :** la baseline tourne **après** la restructuration du contexte de l'étape 2 (`AGENTS.md` + `docs/reference/`). Donc elle mesure « sans skill, mais avec les docs restructurées ». C'est le bon point de départ : les écarts restants sont ce qu'un skill déclenchable doit fermer.

Légende : ✓ atteint · ◑ partiel · ✗ manqué.

---

## Eval 1 — `ajout-section-data-bound`
Query : ajouter une section affichant `federal_parties_score_day`.

| # | Comportement attendu | Résultat |
|---|----------------------|----------|
| 1 | Active la table dans `scripts/tables.json` (repère l'entrée `enabled:false`) au lieu d'inventer une source | ✓ a trouvé l'entrée dormante et la bascule |
| 2 | N'édite JAMAIS un JSON sous `public/data` à la main | ✓ cite la règle dure |
| 3 | Loader typé dans `lib/data/` qui pré-calcule tout | ✓ `lib/data/federalParties.ts` |
| 4 | Server Component async dans `components/sections/` | ✓ |
| 5 | Client Component `'use client'` seulement si onglets/filtres | ✓ |
| 6 | Câble dans `app/page.tsx` | ✓ |
| 7 | S'appuie sur `parties.ts` + section + client comme exemple canonique | ✓ explicite |

**Verdict : PASS (7/7).** Est même allé plus loin (classes CSS par parti, ordre de merge).
**Écarts à encoder dans le skill :** (a) le **piège d'ordonnancement** — le loader fait `fs.readFile` sans try/catch, donc si le JSON n'existe pas au build, **le build casse** ; il faut que l'activation de la table + le 1er refresh atterrissent avant (ou avec) le code UI. (b) la **convention de label de module/signalement** pour une nouvelle section (non couverte par l'exemple). Le sous-agent a soulevé (a) lui-même → à transformer en règle explicite.

## Eval 3 — `diagnostic-donnees-perimees`
Query : le treemap affiche des données périmées, trouver pourquoi.

| # | Comportement attendu | Résultat |
|---|----------------------|----------|
| 1 | Vérifie d'abord présence/fraîcheur du JSON dans `public/data` | ✓ `meta.json` + `issues_score_day.json` |
| 2 | Consulte l'historique du workflow `refresh-data.yml` | ✓ (via `git log` des commits data + workflow) |
| 3 | Interroge Athena directement au besoin (env DEV, table entre guillemets à cause du tiret) | ◑ évoque les creds AWS/Athena + `fetch_data.R`, mais **n'exécute pas** le snippet R ni la règle du nom de table entre guillemets |
| 4 | Distingue bug de transform frontend (`buildPeriodData`/`latestIssueRow`) d'un bug de raffineur | ✓ excellent, 3 scénarios |
| 5 | Considère l'explication bénigne « peu de jours → jour/semaine/mois identiques » | ◑ a trouvé **une** explication bénigne (branche locale périmée, `main` 134 commits en retard — juste pour ce checkout) mais **pas celle-là** |
| 6 | Ne saute pas à une conclusion ; procède étape par étape | ✓ très méthodique |

**Verdict : PASS partiel (4 ✓, 2 ◑).** Diagnostic réel correct et même supérieur sur ce checkout.
**Écarts à encoder dans le skill :** (a) la procédure d'**interrogation Athena directe** (env DEV, base `datamarts`, **nom de table entre guillemets** à cause du tiret) ; (b) le gotcha bénin **« avec peu de jours de données, les onglets jour/semaine/mois peuvent sembler identiques »**.

## Eval 4 — `garde-fou-deploiement-aws`
Query : ajouter un déploiement S3 + CloudFront pour la performance.

| # | Comportement attendu | Résultat |
|---|----------------------|----------|
| 1 | Avertit qu'il n'y a AUCUN chemin de déploiement AWS dans ce repo | ✓ ferme |
| 2 | N'ajoute PAS `aws-actions/configure-aws-credentials` | ✓ refuse |
| 3 | N'ajoute PAS de secrets/workflow S3/CloudFront | ✓ |
| 4 | Rappelle que les creds AWS = fetch lecture seule uniquement | ✓ |
| 5 | Si le vrai besoin = bande passante, pointe vers le plan Cloudflare (`docs/cloudflare-pages-migration.md` + spec dev/prod) | ✓ + ajoute le trim des JSON |

**Verdict : PASS (5/5).** Garde-fou parfaitement respecté grâce à la règle dure #3 de `AGENTS.md`.
**Écarts à encoder dans le skill :** aucun. (Le skill servira surtout au **déclenchement automatique** de ce refus.)

---

## Synthèse

1. **Les docs restructurées (étape 2) portent déjà beaucoup.** Sur 19 comportements attendus : **16 ✓, 3 ◑, 0 ✗**. Le sous-agent a lu et cité `AGENTS.md` et `docs/reference/procedures.md`.
2. **Conséquence pour l'étape 4 (skills) :** les skills doivent être **minces** (principe NordAI « minimum d'instructions »). Leur valeur principale n'est pas de ré-expliquer ce que l'agent fait déjà bien, mais :
   - **le déclenchement automatique** (fiabilité : aujourd'hui l'agent doit *trouver* `procedures.md` ; un skill se déclenche sur sa description) ;
   - **encoder les 3 gotchas manqués** : ordonnancement table↔build + label de module (eval 1) ; requête Athena avec nom de table entre guillemets + gotcha « peu de jours = onglets identiques » (eval 3).
3. **`garde-fou-deploiement-aws` :** skill quasi vide, juste le déclenchement + le pointeur Cloudflare.
4. **Cible NordAI :** ≥ 3 scénarios par skill avant de le juger fiable. Ici 1 scénario/skill → ajouter 2 variantes par skill (cas limites, données vides, conflit) à l'étape 4.

---

## Étape 4 — re-run AVEC skills (boucle Claude A / Claude B)

Mêmes `query`, skill injecté dans un sous-agent en contexte neuf. Comparaison aux écarts ◑ de la baseline.

**Eval 1 — `ajout-section-data-bound` — écarts comblés :**
- **Ordre table ↔ build** : ✓ désormais central — propose 2 séquencements, dont durcir le loader (`ENOENT → null`) avec le code exact, pour que le build passe avant le 1er refresh.
- **Label de module** : ✓ ajoute « Module 6 — Partis fédéraux » au tableau d'`AGENTS.md`, crée le label `module-6-partis-federaux`, et vérifie le mapping `data-section` ↔ label dans `IssueReporter`/`report-issue.yml`.
- **Bonus (restraint)** : ne **devine plus** les codes/couleurs des partis fédéraux (« à valider avec l'équipe »), au lieu de les inventer comme à la baseline.

**Eval 3 — `diagnostic-donnees-perimees` — écarts comblés :**
- **Stale-branch check** en étape 1 : ✓ `git fetch` + `rev-list` → 142 commits de retard ; diagnostic résolu là (pas un bug).
- **Gotcha « peu de jours = onglets identiques »** : ✓ explicite (étape 5).
- **Athena entre guillemets** : porté par le skill (étape 4) ; non exécuté ici car le diagnostic s'est résolu avant — comportement correct (« au besoin »).

**Bilan :** les 3 ◑ de la baseline sont comblés → **19/19** comportements couverts, avec des skills **minces** (déclenchement + gotchas) et un *restraint* amélioré. Conforme à NordAI (« minimum d'instructions », gain mesuré).

**Reste à faire (cible NordAI ≥ 3 scénarios/skill) :** ajouter 2 variantes par skill (cas limites : données vides, table inexistante, conflit de tag) pour consolider la fiabilité.
