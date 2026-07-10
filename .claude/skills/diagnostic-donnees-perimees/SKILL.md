---
name: diagnostic-donnees-perimees
description: "Diagnostique pourquoi une section du site Vitrine (treemap des enjeux, partis, etc.) affiche des données périmées ou erronées, en distinguant un bug de transformation frontend d'un problème de raffineur/backend. À utiliser quand on signale des données « périmées », « pas à jour », « figées » ou « erronées » dans un module, ou qu'un onglet jour/semaine/mois semble incorrect. Déclencheurs : « données périmées », « pas à jour », « le treemap montre du vieux », « trouve pourquoi »."
---

# Diagnostic : données périmées (frontend vs backend)

Procédure complète : `docs/reference/procedures.md` (§ « Diagnosing frontend vs backend problems »). Les données sont hydratées **au build**, pas au runtime — aucun fetch client à suspecter.

## Ordre de vérification
1. **Es-tu sur une branche/commit à jour ?** `git status`, puis `git fetch` et compare à `origin/main` (ex. `git rev-list --count main..origin/main`). Une branche en retard affiche de vieilles données alors que le site déployé est frais — c'est fréquent, et ce n'est pas un bug.
2. **Fraîcheur du JSON local** : `cat public/data/meta.json` (`generatedAt`) et `ls -la public/data/refined/day/` ; regarde le `date_utc`/`tag` le plus récent dans `issues_score_day.json`.
3. **Pipeline de refresh** : historique du workflow `refresh-data.yml` (onglet Actions) ou `git log -- public/data/`.
4. **Athena en direct** (pour vérifier la source) : snippet R dans `docs/reference/aws-backend.md`. **Nom de table DEV entre guillemets** (à cause du tiret) : `SELECT * FROM "vitrine_datamart-issues_score_day" LIMIT 10`.
5. **Bug de transform frontend ?** `lib/data/headlineEvents.ts` : `latestIssueRow()` (choix de la dernière ligne) et `buildPeriodData()` (agrégation jour/semaine/mois).

## Cas particulier : la Une des Unes / Deux solitudes (headline-events.json)
**Chaîne réelle** (validée dans le code 2026-07-09 — ignorer toute doc qui dit autre chose) :
`glue r-media-headlines (:03)` → `radar-data-preparation (:06, stepper 1 bloc 4h/run)` → `salient-objects (:16)` → `salient-index (:42)` → **`radar-event-salience (:51, 6×/jour)`** → table `headline_events_4h` → fetch du site (HH:00). Ce n'est **PAS** `radar-headlines-issues` ni `headline-of-headlines` (plus consommés par le site).

**Retard « normal » connu** : la grille de blocs du code est `00-04/04-08/…` alors que le plan de réforme visait `3-7/7-11/…` → à 8 h le site montre le bloc 0-4 h, qui reste affiché jusqu'à 16 h. Une Une « en retard de 4-12 h » le matin n'est donc **pas une panne** tant que ce chantier n'est pas livré : [aws-refiners#195](https://github.com/ellipse-science/aws-refiners/issues/195) (phase A = grille ; phases B/C = suivi 24 h par storyline, union des médias, pic de saillance). L'indicateur « Dernière mise à jour du module » à l'écran reflète le bloc réellement affiché.

**Vraie panne** si : le bloc affiché a > 12 h, OU `meta.json.generatedAt` est vieux (fetch cassé), OU les runs d'`event-salience`/`salient-index` échouent (CloudWatch). Bug date connu : bloc 20-24 daté +1 jour, corrigé par aws-refiners PR #197 — si observé, vérifier que #197 est déployée.

## Gotcha à considérer avant de conclure à un bug
Avec **peu de jours de données**, les onglets **jour / semaine / mois peuvent sembler identiques** — c'est attendu ; la divergence apparaît à mesure que l'historique s'accumule. Ne conclus pas trop vite à un bug.
