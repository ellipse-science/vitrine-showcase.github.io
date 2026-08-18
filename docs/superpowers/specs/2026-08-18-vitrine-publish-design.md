# Design : raffineur « vitrine-publish », sortie de GitHub Actions du chemin critique

**Date :** 2026-08-18
**Statut :** approuvé, en attente d'implémentation (PR à venir dans `aws-refiners` et `aws-infra`, réglages Cloudflare Pages manuels).
**Prolonge :** [`2026-05-28-dev-prod-split-design.md`](./2026-05-28-dev-prod-split-design.md) et la cible annoncée dans `lib/data/source.ts` : « le raffineur alimente Postgres depuis l'intérieur d'AWS, et le dépôt cesse de grossir de 10 Mo par jour ».

---

## Objectif

Retirer GitHub Actions et cron-job.org du chemin critique du rafraîchissement des données, pour prod ET dev. Motifs : les crons GitHub sont irréguliers, le service est surchargé aux heures pleines, et cron-job.org est un tiers de plus dont dépend la page d'accueil. Contrainte ferme : aucun credential AWS additionnel. Le seul accès AWS reste le rôle IAM des Lambdas existants (côté AWS) et les clés de lecture DEV de `~/.Renviron` (côté humain, pour les tests locaux).

GitHub reste la plateforme de code : PR, gardes CI, promotion `main → prod` par fusion délibérée. C'est uniquement son compute planifié qui sort du chemin critique. Les workflows actuels sont rétrogradés en filet dormant et ne seront supprimés que lorsque l'équipe aura constaté qu'on n'en a plus besoin.

## Architecture cible

```
EventBridge (heure de Montréal, 6 fois/jour, en fin de cascade)
   → Lambda « vitrine-publish » (R, rôle IAM existant)
        1. lit les 15 tables Athena DEV (tube)
        2. applique les post-traitements (logique de fetch_data.R, inchangée)
        3. écrit dans Neon Postgres (transaction par table + sync_state)
        4. si TOUT a réussi : POST sur les Deploy Hooks Cloudflare (prod + dev)
   → Cloudflare Pages construit prod et dev (build natif, lit l'API)
```

L'ordre « synchro avant build », dont la violation a causé la régression du 2026-08-18 (site servant des données plus vieilles que celles publiées), est désormais garanti par construction : c'est le même processus qui écrit puis déclenche.

## Le raffineur (repo `aws-refiners`)

- `refiners/vitrine-publish/runtime.R` : reprend `scripts/fetch_data.R` (800 lignes) et `scripts/tables.json` tels quels. Pas de portage vers un autre langage : le risque de régression des post-traitements (tri déterministe, fenêtres de rétention, post-process configurés) serait le coût principal de toute autre option.
- **Copie canonique.** Le raffineur devient propriétaire de la logique de transformation. La copie de `vitrine-showcase.github.io` reste en place pour le filet dormant. Toute modification doit être répercutée des deux côtés tant que le filet existe ; la phase d'ombre (ci-dessous) sert à détecter une dérive.
- **Écriture Neon :** `RPostgres`, une transaction par table : remplacement complet des lignes, puis mise à jour de `sync_state` avec `source = 'aws-refiner'`. Le champ `source` de `/v1/health` permet de savoir en tout temps qui a écrit quoi.
- **Règle des hooks : tout ou rien.** Si une seule table échoue, aucun déploiement n'est déclenché : alerte Slack, et le site garde son dernier build cohérent. C'est une amélioration sur le comportement actuel, où une synchro partielle peut publier un cycle mélangé.
- **Secrets du Lambda** (mécanisme de secrets `aws-infra` existant) : `NEON_DATABASE_URL`, `DEPLOY_HOOK_PROD`, `DEPLOY_HOOK_DEV`, `SLACK_WEBHOOK`. Aucune clé AWS nouvelle.
- **Horaire** (`aws-infra/lib/data-stacks/refiners/refiners.ts`, heure de Montréal comme tout le fichier) : 6 fois/jour à :10 de l'heure suivant la fin de cascade (`vitrine-graph-data` tourne à :57).

## Builds : du runner GitHub au build natif Cloudflare Pages

- Les deux projets Pages passent en intégration Git : le projet prod construit la branche `prod`, le projet dev construit `main`.
- Variables d'environnement reprises telles quelles dans le tableau de bord Pages, y compris `NEXT_PUBLIC_BASE_PATH` posée VIDE (piège documenté : l'omettre casse tous les actifs), `NEXT_PUBLIC_SITE_ORIGIN` par environnement, `VITRINE_DATA_SOURCE=api` et `VITRINE_API_KEY`.
- Un Deploy Hook par projet pour les rebuilds « données seulement » déclenchés par le raffineur.
- La garde de fraîcheur de `lib/data/source.ts` (synchro la plus ancienne > 45 min : repli sur les JSON commités) reste inchangée, seconde ligne de défense.

## GitHub Actions rétrogradées en filet dormant

- `refresh-data.yml` : plus de déclenchement externe ; `workflow_dispatch` + cron hebdomadaire (le planificateur GitHub suffit pour un filet), pour que les JSON commités et GitHub Pages ne pourrissent pas.
- `deploy-prod.yml` et `deploy-dev-cloudflare.yml` : `workflow_dispatch` seulement. Obligatoire dès l'activation des builds Git Pages, sinon chaque poussée déploierait deux fois.
- `deploy.yml` (GitHub Pages) : inchangé pour l'instant ; débranché plus tard par décision d'équipe.
- Compte cron-job.org : fermé en fin de bascule.
- **Le cron interne du Worker est COUPÉ à la bascule**, pas conservé : il recopie
  les JSON de GitHub raw, qui ne seront plus rafraîchis qu'une fois par semaine.
  Le laisser tourner écraserait toutes les 4 h les données fraîches du raffineur
  par des données vieilles. Trois fichiers couplés à modifier ensemble :
  `workers/api/wrangler.toml`, `workers/api/src/schedule.ts`,
  `tests/cron-schedule.test.ts`. L'endpoint `/v1/sync` reste, lui, au service du
  filet hebdomadaire.

## Bascule progressive, réversible à chaque phase

1. **Ombre.** Le raffineur tourne et écrit dans Neon en parallèle du chemin GitHub actuel, sans toucher aux hooks. Comparaison pendant quelques jours : comptes de lignes et checksums contre les JSON commités ; le champ `source` de `/v1/health` arbitre.
2. **Bascule.** Builds Git Pages activés, hooks branchés dans le raffineur, workflows de déploiement en `workflow_dispatch`, `refresh-data.yml` en hebdomadaire, cron-job.org coupé.
3. **Débranchement** (décision d'équipe, plus tard). Critère proposé : deux semaines sans intervention et parité confirmée. Alors seulement : suppression des workflows, arrêt des commits JSON, débranchement de GitHub Pages.

## Pannes et observabilité

- Raffineur en panne : pas de hook, donc pas de build ; le site statique garde son dernier build et ne casse jamais. `/v1/health` vieillit, l'alerte Slack part du raffineur.
- API en panne au moment d'un build : repli sur les JSON commités (vieux d'au plus une semaine avec le filet hebdomadaire). Dégradé mais debout, signalé par l'avertissement de build existant.
- Athena en panne : le raffineur échoue table par table, alerte, aucun hook. Identique au comportement « pas de build ».

## Alternatives rejetées

- **B : le raffineur POSTe vers `/v1/sync`, le Worker écrit dans Neon.** Refait passer ~10 Mo par cycle à travers les limites CPU des Workers, la fragilité déjà payée (« la synchro meurt à la 6e table »). Plus de pièces mobiles pour le même résultat.
- **Worker Cloudflare qui interroge Athena en SigV4.** Exige de porter 800 lignes de R en TypeScript : coût et risque de régression disproportionnés.
- **Machine locale ou VPS avec les clés `.Renviron`.** Fiabilité inférieure à ce qu'on quitte ; ajoute un serveur à entretenir.
- **Conteneur planifié chez un tiers (Cloud Run, Fly).** Un nouveau compte cloud et une nouvelle surface de secrets, alors qu'EventBridge est déjà là et déjà fiable.

## Tests avant bascule

- Exécution locale du raffineur avec les clés `.Renviron` contre une branche Neon jetable ; comparaison ligne à ligne avec les JSON du dernier cycle GitHub.
- Hooks testés au curl (rebuild observé dans le tableau de bord Pages).
- Parité des builds : HTML de dev construit par Pages comparé à celui construit par GitHub Actions.

## Critères d'acceptation

1. Un cycle complet (Athena → Neon → hooks → builds prod et dev) s'exécute sans qu'aucun workflow GitHub ne tourne.
2. `/v1/health` montre les 15 tables avec `source = 'aws-refiner'` et des horodatages du cycle courant.
3. Une table en échec simulé : aucun hook déclenché, alerte Slack reçue, site inchangé.
4. `git log origin/prod..origin/main -- app lib components` reste le test de promotion ; rien dans ce design ne le change.

## Dépendances

- PR `aws-refiners` (raffineur) et PR `aws-infra` (enregistrement, horaire, secrets), déployées par le pipeline habituel de l'équipe (fusion dans `develop`, jamais `main`, branche préfixée `feature/`).
- Création des Deploy Hooks et activation de l'intégration Git : manuel, tableau de bord Cloudflare.
- Mise à jour des trois documents de méthodologie (horaire des raffineurs, swimlanes) au moment de la bascule.
