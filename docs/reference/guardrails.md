# Reference — Garde-fous & automatisation déterministe

Ce repo applique certaines règles de façon **déterministe** (hooks, CI) plutôt que de seulement les conseiller — principe « ne jamais demander au LLM le travail d'un outil déterministe ». Les règles elles-mêmes sont dans [`AGENTS.md`](../../AGENTS.md).

## Hook d'agent (local)

`.claude/hooks/guard.py` (enregistré dans `.claude/settings.json`, événement `PreToolUse` sur `Write|Edit|MultiEdit`) **bloque** mécaniquement deux actions, avec un message expliquant l'alternative (code de sortie 2) :

1. toute écriture/édition sous `public/data/` — généré par `scripts/fetch_data.R` (règle dure #1) ;
2. l'ajout de `aws-actions/configure-aws-credentials` dans un fichier — pas de déploiement AWS (règle dure #3).

Il s'applique à tout agent travaillant dans le repo (après acceptation des réglages projet).

> `.claude/settings.local.json` reste **personnel** (git-ignoré). `settings.json`, `skills/` et `hooks/` sont **partagés** (versionnés).

## Portes CI (sur chaque PR)

`.github/workflows/ci.yml` exécute, sur toute PR vers `main` : **type-check → test → build**. Rien qui casse la compilation, la logique de données (tests `lib/data/`) ou le build n'atteint `main`.

## Garde attribution humaine (sur chaque PR)

`.github/workflows/garde-attribution.yml` échoue si un commit de la PR met une IA en **paternité** : auteur/committer avec adresse IA, ou trailer `Co-Authored-By` pointant vers `noreply@anthropic.com`, Copilot, etc. (règle dure #8, issue #235). La distinction est volontaire :

- **Paternité (bloquée)** — GitHub parse l'auteur/committer et `Co-Authored-By` comme une co-signature et crédite le co-auteur dans le graphe Contributors. Pas d'auteur non humain sur un livrable scientifique.
- **Provenance (permise)** — un trailer `Assisted-by: Claude Code (Opus 4.8)` (ou `Generated-with:`) documente l'outil sans être compté comme co-auteur par GitHub. C'est la forme sanctionnée pour reconnaître l'assistance machine ; le check la laisse passer.

Complément préventif : `"includeCoAuthoredBy": false` dans `.claude/settings.json` empêche Claude Code de générer le trailer de paternité. La détection se fait par adresse courriel, pas par prénom.

## Auto-merge Dependabot

`.github/workflows/auto-merge-dependabot.yml` approuve puis active l'auto-merge (`gh pr merge --auto`) des PRs Dependabot. **L'auto-merge ne fusionne que si la protection de branche de `main` exige le check CI en succès.**

À vérifier (réglage admin) : Settings → Branches → règle sur `main` → « Require status checks to pass before merging » doit inclure le job **CI**. Sans ça, une mise à jour de dépendance pourrait être fusionnée sans CI verte. Le workflow utilise `pull_request_target` (token avec write) — acceptable car restreint à l'auteur `dependabot[bot]`.

## PR #102 « keep open » (aws-refiners)

Le déploiement d'un raffineur passe par une PR permanente `develop → main` **jamais fusionnée** (mécanisme `pr.yml` → ECR → redeploy). Détail : [`aws-backend.md`](./aws-backend.md). Contournement assumé, documenté ici pour mémoire.
