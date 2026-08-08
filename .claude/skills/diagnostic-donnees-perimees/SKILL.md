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

**Retard « normal »** (depuis la réforme #195 phase A, LIVRÉE le 2026-07-15 — aws-refiners#214/#215) : la grille est ancrée Montréal (`03-07/07-11/11-15/15-19/19-23/23-03`), la cascade tourne à la fin de chaque bloc et le fetch du site suit → **fraîcheur normale ≈ 1 h** (à 20 h, le site sert le bloc 15-19, étiqueté « 20h »). Le bloc affiché vieillit ensuite jusqu'à ~5 h juste avant le fetch suivant. Un retard qui dépasse ça n'est **plus** normal — l'ancienne tolérance « 4-12 h le matin » décrivait la grille pré-réforme et n'a plus cours.

**Signature vécue (2026-08-06→07, aws-refiners#278) — retard CONSTANT d'exactement 4 h, zéro erreur aux logs** : un stepper de la cascade est coincé **un bloc en arrière** (bug du reliquat de `radar-salient-objects` : des Unes ingérées en retard « brûlent » un run entier ; à 1 bloc/run et 6 runs/jour, l'écart ne se résorbe jamais seul). Diagnostic : lire dans CloudWatch **quel bloc chaque étage traite** (`borne_sup` pour salient-objects, `Processing NEXT time segment` pour salient-index, `Bloc cible` pour event-salience) — ne pas chercher des crashs, il n'y en a pas. Remède : rattrapage manuel via le skill `rattrapage-radar-data-prep` (1 invoke par étage dans l'ordre salient-objects → salient-index → event-salience, ~5 min entre chaque, hors fenêtres cron). Correctif de fond : aws-refiners#279.

**Vraie panne** si : le bloc affiché a > 6 h, OU `meta.json.generatedAt` est vieux (fetch cassé), OU les runs d'`event-salience`/`salient-index` échouent (CloudWatch). Bug date connu : bloc 20-24 daté +1 jour, corrigé par aws-refiners PR #197 — si observé, vérifier que #197 est déployée.

## Gotcha à considérer avant de conclure à un bug
Avec **peu de jours de données**, les onglets **jour / semaine / mois peuvent sembler identiques** — c'est attendu ; la divergence apparaît à mesure que l'historique s'accumule. Ne conclus pas trop vite à un bug.
