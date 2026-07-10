# Bienvenue sur la Vitrine démocratique 👋

**Copie canonique unique** (règle du projet) — les repos `aws-refiners` et
`aws-infra` contiennent un panneau indicateur vers ce fichier. Dernier audit
contre le code : **2026-07-10**.

## La carte en 90 secondes

Le projet est un pipeline de données en 3 repos, de la collecte à la
visualisation publique :

```
   MÉDIAS (Unes scrapées 6×/jour)
      │
      ▼
┌──────────────┐   Glue (Python) + EventBridge (crons, HEURE DE MONTRÉAL)
│  aws-infra   │   AWS CDK/TypeScript : horaires, Lambdas, Athena, S3
└──────┬───────┘   → horaires des raffineurs : lib/data-stacks/refiners/refiners.ts
       │              (pipelines Glue : src/pipelines/)
       ▼
┌──────────────┐   Raffineurs R (Lambda) : segmentation, objets saillants,
│ aws-refiners │   indices de saillance, événements/storylines, scores
└──────┬───────┘   → 1 raffineur = refiners/<nom>/runtime.R → table Athena
       ▼
   vitrine_datamart (Athena)
       │  scripts/fetch_data.R (whitelist scripts/tables.json)
       ▼
┌──────────────────────────┐   Next.js statique (GitHub Pages, auto-deploy
│ vitrine-showcase (ici)   │   ~2 min après merge sur main)
└──────────────────────────┘   → le site public et ses 6 modules
```

**Qui possède quoi** : Étienne (`etienneprx`) = reviews ; Laurence
(`laurenceomfoisy`) = raffineurs/modèles ; Capel (`capel201`) = habillage du
site ; Jules (`julespiral`) = illustrations ; Adrien (`AdriClout`) = modules
1-2 (Une des Unes, Deux solitudes) et données.

## Les 4 documents à connaître (tous vivants, tous canoniques ici)

1. [Page Méthodologie](https://ellipse.science/vitrine-showcase.github.io/methodologie/)
   (`public/methodologie/index.html`) — le contrat public : comment chaque
   chiffre est produit.
2. [Diagramme des pipelines (swimlanes)](https://ellipse.science/vitrine-showcase.github.io/docs/workflow-vitrine-2025-swimlanes.html)
   — qui produit quelle table, avec quelles colonnes.
3. [Horaire des raffineurs](https://ellipse.science/vitrine-showcase.github.io/docs/horaire-refiners-2026.html)
   — quand chaque étage tourne.
4. Le fichier d'agents du repo où tu travailles — règles dures, commandes,
   pièges : `AGENTS.md` (vitrine, aws-infra) ou `.claude/CLAUDE.md`
   (aws-refiners).

## Les 5 règles de survie (transversales aux 3 repos)

1. **FAIT vs VISION** — ne jamais documenter une intention au présent de
   l'indicatif. Ce qui EST implémenté (vérifié dans le code, daté) ≠ ce qui
   est PLANIFIÉ (marqueur VISION / EN COURS / LIVRÉ). La source de vérité du
   pipeline = le code des 3 repos.
2. **Copie canonique unique** — jamais de copie locale des diagrammes, de la
   métho ou de ce fichier ; on pointe vers la copie vivante. (La divergence
   des copies a causé les faux diagnostics de juillet 2026.)
3. **Impact méthodologie sur chaque PR** — tout changement de calcul, seuil,
   horaire, collecte ou représentation met à jour la métho/les docs vivantes
   ou déclare l'absence d'impact (section du template de PR, check
   `garde-metho`). Guide : `.claude/skills/synchro-methodologie/SKILL.md`.
4. **Les horaires sont en heure de Montréal**, pas UTC — partout.
5. **Ne jamais éditer `public/data/` à la main** (écrasé par
   `scripts/fetch_data.R`) et **aucun chemin de déploiement AWS dans le repo
   vitrine** (GitHub Pages seulement).

## Le workflow d'une PR (identique dans les 3 repos)

branche → PR (remplir le template, dont « Impact méthodologie ») → review
Copilot (traiter ET résoudre chaque fil — le ruleset l'exige) → review
humaine (1 requise ; Étienne review vite) → **merge commit** (pas de squash)
→ déploiement auto (Pages ~2 min côté vitrine ; workflow Deploy Refiners →
ECR côté refiners ; CDK côté infra) → côté vitrine, le label `semver:*`
déclenche le bump de version automatique.

⏱️ Cas particulier : une PR aws-refiners/aws-infra qui a un impact métho
ouvre la PR vitrine tout de suite, mais on la merge **quand le changement est
déployé** (sinon la métho décrit du futur).

## Ta première journée

1. **Accès** : org GitHub `ellipse-science` + portail AWS SSO
   (`ellipse-science.awsapps.com`, compte Dev). Demande à Adrien.
2. **Cloner les 3 repos côte à côte** (beaucoup de liens relatifs supposent
   des dossiers frères) : `vitrine-showcase.github.io`, `aws-refiners`,
   `aws-infra`.
3. **Setup par repo** : vitrine = Node 22 (`.nvmrc`) puis `npm install`,
   `npm run dev` ; aws-refiners = R + `remotes::install_github("ellipse-science/tube")`
   (ou le devcontainer), test local d'un raffineur via son `test_local.R` ;
   aws-infra = `yarn` (build/test/lint en CI).
4. **Lire** le fichier d'agents du repo où tu vas travailler, puis les 2
   diagrammes vivants.
5. **Si tu utilises Claude/Copilot** : les fichiers d'agents et les skills
   (`.claude/skills/`) encodent déjà les règles ci-dessus — ton IA les lit.
   Ne la laisse pas croire une doc sans marqueur d'état (règle 1).

## Où demander de l'aide

Une PR = tagger le propriétaire du territoire (voir « Qui possède quoi »).
Un doute sur une donnée affichée = commencer par les diagrammes vivants,
puis la table Athena (lecture seule via `tube::ellipse_query`, voir
`docs/reference/aws-backend.md`).
