# Design : émancipation totale de GitHub Actions et de cron-job.org

**Date :** 2026-08-19
**Statut :** VISION approuvée par Laurence (directive du 2026-08-19), déclinée en chantiers ; chaque item porte son marqueur LIVRÉ / EN COURS / VISION.
**Contexte déclencheur :** panne de facturation GitHub le matin même (dépôts privés gelés, minutes épuisées, limite de dépense à zéro), pendant que le pipeline AWS, lui, tournait sans accroc.

## La cible, en une phrase

`vitrinedemocratique.com`, `dev.vitrinedemocratique.com` et `api.vitrinedemocratique.com` fonctionnent sans AUCUN lien d'exécution avec GitHub, GitHub Actions ou cron-job.org : tout le travail planifié vit dans des raffineurs d'`aws-refiners` (EventBridge), la publication passe par Neon et les Deploy Hooks, l'hébergement par Cloudflare. Le dépôt `vitrine-showcase.github.io` est conservé comme source de code et filet « au cas où », sans qu'aucune attention ne lui soit due : sa panne ne doit rien casser.

## Inventaire exhaustif des liens GitHub d'exécution, et leur destination

| # | Lien aujourd'hui | Destination | État |
|---|---|---|---|
| 1 | `refresh-data.yml` (cron-job.org, fetch_data.R, commit JSON, /v1/sync, poussée prod) | Raffineur `vitrine-publish` : Athena vers Neon vers Deploy Hooks, EventBridge 6 fois/jour heure de Montréal | EN COURS : PR aws-refiners#356 (attend approbation), aws-infra#498 fusionnée, e2e prouvé 15/15 |
| 2 | `tables.json` lu depuis GitHub raw par le raffineur | Whitelist embarquée dans l'image (copie canonique déplacée dans aws-refiners) | LIVRÉ (commit a6194bd sur #356) |
| 3 | Builds du site dans les runners GitHub (`deploy-prod.yml`, `deploy-dev-cloudflare.yml`) | Builds natifs Cloudflare Pages (intégration Git) + Deploy Hooks appelés par le raffineur | VISION : phase D1 du plan vitrine-publish (manuel, dashboard) |
| 4 | Cron interne du Worker `/v1/sync` qui recopie les JSON de GitHub raw | Coupé à la bascule (le raffineur écrit Neon directement) | VISION : phase D3 du plan, trois fichiers couplés |
| 5 | Génération d'illustration (OpenAI), audio, `meta.json`, `salience_calibration.json`, sélection du héros : aujourd'hui produits par la chaîne GitHub et commités | Nouveau raffineur « vitrine-media » : la clé OpenAI est DÉJÀ dans l'image de base des raffineurs ; publication vers un stockage lisible au build (R2 ou S3 : à trancher) puis Deploy Hook | VISION : spec dédiée à écrire ; c'est le plus gros morceau restant |
| 6 | CI/CD des dépôts privés (`pr.yml`, `deploy.yml`, `develop.yml`, `prod.yml`) sur minutes GitHub payantes | CodeBuild (webhooks GitHub, build des images vers ECR) et CDK Pipelines (aws-infra) : calcul facturé sur le compte AWS ; amorçage par un `cdk deploy` manuel, donc SANS dépendre de la réparation de la facturation | VISION : spec dédiée à écrire |
| 7 | cron-job.org | Fermé après deux semaines de bascule stable | VISION : phase D du plan |
| 8 | Signalements (`report-issue.yml` crée les issues) | Le Worker de dispatch appelle l'API GitHub directement (issues = plateforme, pas Actions) | VISION : petit chantier indépendant |
| 9 | Gardes de PR du dépôt public (métho, rédaction, attribution, promotion), version-bump, journal | Restent sur GitHub Actions TANT QUE le dépôt public existe : minutes gratuites (dépôt public), non critiques (leur panne fait attendre des PR, jamais le site). Disparaîtront avec le délaissement du dépôt | Toléré, décision explicite |

## Ce que « toléré » veut dire (décision à assumer)

GitHub reste l'hébergeur du CODE SOURCE et du flux de revue (PR, rulesets, approbations humaines) : ce sont des liens de développement, pas d'exécution. La cible de cette vision est que le site en marche ne dépende de GitHub pour RIEN : pas de cron, pas de runner, pas de fetch à l'exécution. Une panne GitHub complète (facturation, service) doit se traduire par « on ne peut pas merger aujourd'hui », jamais par « le site est périmé ».

## Ordre des chantiers

1. **Finir vitrine-publish** (items 1 à 4, 7) : approbation #356, paramètres SSM, `active: true`, hooks Cloudflare, phase D. Le chemin critique des données quitte GitHub.
2. **vitrine-media** (item 5) : spec puis raffineur ; à sa livraison, plus rien de ce que le site AFFICHE ne naît dans GitHub Actions.
3. **CI/CD sur AWS** (item 6) : CodeBuild + CDK Pipelines ; règle au passage la panne de facturation par construction.
4. **Signalements** (item 8) : Worker vers API GitHub.

## Hors périmètre de cette vision

- Quitter GitHub comme hébergeur de code (GitLab, etc.) : non demandé, autre débat.
- Le sort final du dépôt public et de son miroir GitHub Pages : décision d'équipe au moment du délaissement.
