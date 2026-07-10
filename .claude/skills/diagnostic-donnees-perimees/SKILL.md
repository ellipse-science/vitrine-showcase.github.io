---
name: diagnostic-donnees-perimees
description: Diagnostique pourquoi une section du site Vitrine (treemap des enjeux, partis, etc.) affiche des données périmées ou erronées, en distinguant un bug de transformation frontend d'un problème de raffineur/backend. À utiliser quand on signale des données « périmées », « pas à jour », « figées » ou « erronées » dans un module, ou qu'un onglet jour/semaine/mois semble incorrect. Déclencheurs : « données périmées », « pas à jour », « le treemap montre du vieux », « trouve pourquoi ».
---

# Diagnostic : données périmées (frontend vs backend)

Procédure complète : `docs/reference/procedures.md` (§ « Diagnosing frontend vs backend problems »). Les données sont hydratées **au build**, pas au runtime — aucun fetch client à suspecter.

## Ordre de vérification
1. **Es-tu sur une branche/commit à jour ?** `git status`, puis `git fetch` et compare à `origin/main` (ex. `git rev-list --count main..origin/main`). Une branche en retard affiche de vieilles données alors que le site déployé est frais — c'est fréquent, et ce n'est pas un bug.
2. **Fraîcheur du JSON local** : `cat public/data/meta.json` (`generatedAt`) et `ls -la public/data/refined/day/` ; regarde le `date_utc`/`tag` le plus récent dans `issues_score_day.json`.
3. **Pipeline de refresh** : historique du workflow `refresh-data.yml` (onglet Actions) ou `git log -- public/data/`.
4. **Athena en direct** (pour vérifier la source) : snippet R dans `docs/reference/aws-backend.md`. **Nom de table DEV entre guillemets** (à cause du tiret) : `SELECT * FROM "vitrine_datamart-issues_score_day" LIMIT 10`.
5. **Bug de transform frontend ?** `lib/data/headlineEvents.ts` : `latestIssueRow()` (choix de la dernière ligne) et `buildPeriodData()` (agrégation jour/semaine/mois).

## Gotcha à considérer avant de conclure à un bug
Avec **peu de jours de données**, les onglets **jour / semaine / mois peuvent sembler identiques** — c'est attendu ; la divergence apparaît à mesure que l'historique s'accumule. Ne conclus pas trop vite à un bug.
