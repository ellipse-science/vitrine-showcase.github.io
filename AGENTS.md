# AGENTS.md — La Vitrine démocratique (`vitrine-showcase.github.io`)

Universal, tool-agnostic rules for any agent or contributor touching this repo. Claude-specific guidance and the just-in-time reference index live in [`CLAUDE.md`](./CLAUDE.md). Detailed material lives under [`docs/reference/`](./docs/reference/) and is loaded on demand.

## What this repo is

Self-contained repository for **La Vitrine démocratique** — a media-focused data showcase by the CAPP — Centre d'analyse des politiques publiques (Université Laval). A single-page editorial dashboard (Playfair Display / Source Serif / IBM Plex Mono, paper/ink palette), rendered from a designer's maquette and hydrated at **build time** from JSON snapshots committed to the repo by an external R script. Hosted free on **GitHub Pages**. No AWS infrastructure in this repo.

## Stack

- **Node.js 22** — pinned in `.nvmrc` and used by CI (`npm ci`). Run `nvm use` (or `fnm`/`asdf`) before installing.
- **Next.js 16** (App Router), static export (`output: 'export'`) → a plain `out/` directory of HTML/CSS/JS
- **React 19** Server Components for the data-bound sections; Client Components for interactive bits (tabs, countdown)
- **TypeScript strict**
- No CSS framework — the maquette's CSS lives verbatim in `app/globals.css`
- No backend, no API routes, no SSR — pure SSG

## Commands

```bash
npm install        # if node_modules missing
npm run dev        # http://localhost:3000
npm run build      # next build → out/, then scripts/postbuild.mjs copies /presentation
npm run type-check # tsc --noEmit
npm run test       # vitest — unit tests on the data loaders (tests/*.test.ts)
```

CI (`ci.yml`) runs **type-check + build + `npm run test`** on every PR; run all three locally before pushing.

## Branches, PRs, deployment

- **Push to `main`** → `.github/workflows/deploy.yml` runs `npm ci && npm run build` and publishes `out/` to GitHub Pages (live within ~2 min). Site: https://ellipse.science/vitrine-showcase.github.io/
- **Pull requests** → `.github/workflows/ci.yml` runs type-check + full build, no deploy. Nothing broken reaches `main`.

## Versionnage

`package.json` `version` est la **source unique de vérité**. Le footer (`static-content/bottom.html`) contient le placeholder `__VERSION__`, substitué au build par `RawMaquette` :

- `2.0.0-beta.3` → **« Bêta v2.0.0 (b3) »** (compteur bêta visible)
- `2.0.0` → **« v2.0.0 »** (hors bêta)

Le bump est **automatique et piloté par label**. Mets un label sur ta PR ; au merge, `.github/workflows/version-bump.yml` bumpe `package.json` sur `main` et redéploie :

| Label | Effet en bêta | Effet hors bêta |
|-------|---------------|-----------------|
| `semver:patch` | `2.0.0-beta.0` → `2.0.0-beta.1` | → `2.0.1` |
| `semver:minor` | → `2.1.0-beta.0` | → `2.1.0` |
| `semver:major` | → `3.0.0-beta.0` | → `3.0.0` |

**Quel label choisir ?** Le critère est ce qu'un **visiteur du site** perçoit :

| Label | Quand | Exemples |
|-------|-------|----------|
| *(aucun)* | Rien ne change pour le visiteur | docs, CI, tests, refactor sans effet visible, tooling |
| `semver:patch` | Correctif ou retouche d'un module existant | bug d'affichage, ajustement CSS/responsive, reformulation d'un libellé, correction de la métho |
| `semver:minor` | Nouveauté ou évolution visible | nouveau module/section, nouvelle donnée affichée, changement notable d'un visuel ou d'un calcul présenté |
| `semver:major` | Refonte ou rupture | redesign global, restructuration du site, changement de méthodologie qui invalide les lectures antérieures |

En cas d'hésitation entre deux niveaux, prends le plus bas.

**Journal des mises à jour (`/journal`)** : au merge d'une PR dans main, `.github/scripts/append-changelog.mjs` tente d'ajouter une entrée dans `static-content/changelog.json`, affichée sur la page `/journal` (accessible en cliquant le badge de version du footer). La note vient de la section « Note de journal » du template de PR : 1-2 phrases grand public, sans jargon interne (règles : `.claude/skills/redaction-editoriale/SKILL.md`). **Section vide ou note non publiable → aucune entrée n'est créée.** Le titre de la PR n'est **jamais** utilisé en repli : c'est lui qui a publié des titres de commit techniques (ex. « test(saillance) : les fixtures cessent de dépendre de l'état du flag ») sur une page que lisent visiteurs et partenaires — un trou dans le journal coûte moins cher qu'une ligne indéfendable. PR de bot → note générique. Le check `garde-journal` bloque la PR bien avant le merge si la note n'est pas publiable ; `append-changelog.mjs` n'est que le filet sous ce filet. Ne jamais éditer `changelog.json` à la main sauf pour corriger une note.

- **PR sans label semver:*** → aucun bump (mais une entrée de journal quand même). Les commits `data: refresh …` n'ouvrent pas de PR → jamais de bump sur le pipeline 4h.
- **Sortir de bêta** : éditer `package.json` à la main sur une PR (`2.0.0-beta.N` → `2.0.0`).
- **Comment le bump contourne la protection de `main`** : le ruleset exige une PR pour toute modif, et `github-actions[bot]` (GITHUB_TOKEN) **n'est pas ajoutable** à la bypass-list. Le workflow pousse donc son commit avec la **même SSH deploy key que `refresh-data.yml`** (`secrets.REFRESH_DATA_DEPLOY_KEY`) — les Deploy keys **sont** dans le bypass du ruleset. Aucun réglage de ruleset à faire. Seul prérequis restant : les trois labels `semver:*` doivent exister dans le repo.

## Hard rules (non-negotiable)

1. **Never edit JSON under `public/data/` by hand.** It is refreshed by `scripts/fetch_data.R` from Athena; hand edits get overwritten. To add data, edit `scripts/tables.json` (see [procedures](./docs/reference/procedures.md)).
2. **Schedule times are Montreal local (EDT/EST), not UTC** — everywhere schedules appear (here and in `aws-infra`).
3. **No AWS deployment path in this repo.** Do not add `aws-actions/configure-aws-credentials`, S3/CloudFront secrets, or any workflow that pushes `out/` to S3 or invalidates a CloudFront distribution. AWS credentials in this repo are **read-only data fetching** (`refresh-data.yml`) only. The site is on GitHub Pages; Cloudflare Pages is a separate, deferred decision ([`docs/cloudflare-pages-migration.md`](./docs/cloudflare-pages-migration.md)).
4. **Never commit credentials.** Secrets live in environment variables / GitHub Actions secrets, never in source.
5. **FAIT vs VISION — jamais d'intention au présent de l'indicatif.** Toute doc (md, HTML, Notion) qui décrit le système doit distinguer explicitement ce qui **EST implémenté** (vérifié dans le code, avec date d'audit) de ce qui est **PLANIFIÉ** (vision/spec, avec marqueur d'état : VISION / EN COURS / LIVRÉ). Ne jamais écrire « le raffineur utilise X » tant que X n'est pas dans le code. Une intention documentée au présent devient un « fait » pour le prochain agent IA — c'est ce qui a causé les faux diagnostics de juillet 2026 (réforme des horaires lue comme complète, GLiNER décrit comme livré). Corollaire : la source de vérité du pipeline = **le code des 3 repos** (`vitrine` + `aws-refiners` + `aws-infra`) ; toute doc rédigée à partir d'un seul repo est suspecte et doit être auditée contre les deux autres avant d'être crue.

6. **Impact méthodologie obligatoire sur chaque PR.** La page Méthodologie (`public/methodologie/index.html`) et les docs vivantes du pipeline (`public/docs/horaire-refiners-2026.html`, `public/docs/workflow-vitrine-2025-swimlanes.html`) ne doivent JAMAIS être périmées. Toute PR (de ce repo ou des repos AWS) qui change un calcul, un seuil, un horaire, la collecte ou une représentation met le texte à jour ou déclare explicitement l'absence d'impact — section « Impact méthodologie » du template de PR, vérifiée par le check `garde-metho`. Deux skills encadrent ce travail : [`synchro-methodologie`](./.claude/skills/synchro-methodologie/SKILL.md) (QUOI/QUAND mettre à jour — mapping sections ↔ code, véracité, timing) et [`redaction-methodologie`](./.claude/skills/redaction-methodologie/SKILL.md) (COMMENT l'écrire — registre grand public, pas de jargon interne comme les noms de raffineurs/tables/colonnes, transparence sans exposer la PI ni les droits des médias). Les employer ensemble. Timing : pour un changement aws-refiners/aws-infra, la PR métho se merge quand le changement est **déployé** (corollaire de FAIT vs VISION).

7. **Règles de rédaction obligatoires pour tout texte public.** Tout texte affiché sur le site (libellés, phrases éditoriales générées, infobulles, **étiquettes/titres/légendes de graphiques**, méthodo, billets) suit les règles canoniques de [`.claude/skills/redaction-editoriale/SKILL.md`](./.claude/skills/redaction-editoriale/SKILL.md) — voix sobre, **typographie OQLF** (pas d'espace avant `; ? !`, insécable avant `:` et `%`), langage inclusif, lexique canonique (jamais « ROC » en public), formulations honnêtes issues du red-team, superlatifs calibrés sur les percentiles. **La source de vérité est la page Notion « Guide de rédaction CAPP/CLESSN » ; le skill en est le miroir** : pour changer une règle, on édite Notion d'abord, puis on répercute dans le skill (jamais l'inverse). Les gabarits de phrases générées doivent être finis, listés dans le code et relus avant merge (arbitre du contenu éditorial : Adrien). **Depuis le 2026-08-10, la partie typographique est vérifiée mécaniquement** par le check `garde-redaction` (`npm run garde-redaction` en local) : la règle a vécu un mois sans aucune vérification, et l'audit a trouvé 27 heures espacées, 272 tirets cadratins et 424 deux-points sans insécable en production. Le check travaille sur un fichier de dette qui ne peut que rétrécir — détail dans [`guardrails.md`](./docs/reference/guardrails.md). Il ne couvre pas la voix, le lexique ni l'honnêteté méthodologique : ça reste une relecture humaine.

8. **Reconnaissance de l'apport de l'IA — l'humain est auteur, l'IA est tracée comme provenance, toujours en français.** La règle couvre **toute contribution rédigée ou assistée par une IA** : messages de **commit**, **corps de PR**, **issues** et **réponses/commentaires de PR**. On distingue deux choses que le débat confond souvent :
   - **Paternité (interdite à l'IA).** Aucun auteur/committer IA, aucun trailer `Co-Authored-By` pointant vers une IA (`noreply@anthropic.com`, Copilot, etc.) — vérifiez `git config user.name` / `user.email` dans vos environnements d'agents. Pourquoi : GitHub parse ces signaux comme une **co-signature** et crédite le co-auteur dans le graphe Contributors — le compte `claude` y apparaissait comme 2e contributeur du repo. Un livrable scientifique n'a pas d'auteur non humain ; c'est la personne qui commande, supervise et assume qui est l'autrice.
   - **Provenance (obligatoire dès qu'une IA a aidé, toujours en français).** Documenter l'outil qui a assisté le travail, en français :
     - *commits* → trailer `Assisté par : Claude Code (Opus 4.8)` (ou `Généré avec :`). GitHub **ne le parse pas** comme une co-signature : le graphe Contributors reste propre, l'humain reste seul auteur, et l'assistance machine est tout de même reconnue et traçable — sans en faire un co-auteur.
     - *issues, corps de PR, réponses et commentaires de PR* → une ligne finale en français : « 🤖 Assisté par Claude Code (Opus 4.8) » (préciser l'outil réel).
     - Remplacer tout libellé anglais par défaut (p. ex. « Generated with Claude Code »). C'est la manière sanctionnée de créditer honnêtement l'outil, en cohérence avec la transparence méthodologique (les outils employés sont déjà mentionnés dans la méthodo, pour la reproductibilité).

   Appliqué mécaniquement (**commits uniquement**) : `includeCoAuthoredBy: false` dans `.claude/settings.json` (Claude Code n'émet plus le trailer de paternité) + check CI `garde-attribution` sur chaque PR — qui **bloque la paternité mais laisse passer la provenance**. Les issues et les réponses de PR relèvent de la convention (pas de vérification CI). Contexte : [issue #235](https://github.com/ellipse-science/vitrine-showcase.github.io/issues/235).

9. **Un corps de PR se lit en une minute — le détail va dans l'issue liée.** Une PR tient dans un écran : 3 à 5 puces qui disent ce qui change et pourquoi, puis les sections du gabarit ([`.github/pull_request_template.md`](./.github/pull_request_template.md)) répondues en une ligne chacune. Les mesures, les tableaux, les sorties de tests et le récit de l'enquête vont dans **l'issue liée**, pas dans le corps de la PR; les issues, elles, restent aussi détaillées qu'il le faut (« garde les issues pour les machines, rends les PR plus digestes »). **Ce n'est pas une règle de style mais de sécurité du gitflow** : un corps de PR indigeste désarme le seul garde-fou humain de la chaîne. Le 2026-08-12, une PR longue a été approuvée avec le commentaire « J'approuve mais j'ai pas lu. Trop long et incompréhensible » — l'approbation qui la débloquait était devenue décorative. Corollaire : **une IA seule ne review pas une PR**, une approbation Copilot ne remplace jamais un œil humain. Demande de Patrick Poncet (2026-08-12), gabarit posé par [#469](https://github.com/ellipse-science/vitrine-showcase.github.io/pull/469) et propagé à `aws-refiners` et `aws-infra`. **Aucun check CI ne vérifie cette règle** : elle tient à la discipline de qui rédige, humain comme agent.

## Module naming + signalement labels (triage)

Treat these as **distinct modules**. A right-click report inside a block must be tagged to that module and receive its GitHub label:

| Module | Block | GitHub label |
|--------|-------|--------------|
| Module 1 — Une des Unes | primary/secondary front-page stories | `module-1-unes-des-unes` |
| Module 2 — Deux solitudes | divergence block, QC/Canada symbols + three bars | `module-2-solitudes` |
| Module 3 — Partis et couverture | coverage & tone by party, period tabs | `module-3-partis-couverture` |
| Module 4 — Enjeux saillants | issue treemap, day/week/month tabs | `module-4-enjeux-saillants` |
| Module 5 — Assemblée nationale | chamber language + lexical richness | `module-5-assemblee-nationale` |
| Module 6 — Polimètre+ | promise tracker block (`PolimetrePlusSection`) | `module-6-polimetre` |

Reports that fall outside a module — the general site chrome and standalone pages — get their own labels:

| Zone | Where | GitHub label |
|------|-------|--------------|
| En-tête | site header (top `RawMaquette`) | `site-header` |
| Pied de page | site footer (bottom `RawMaquette`) | `site-footer` |
| Page Méthodologie | `/methodologie/` (static HTML) | `page-methodologie` |
| Page À propos | `/apropos/` | `page-apropos` |
| Page Abonnement | `/abonnement/` | `page-abonnement` |

**How the triage works.** Each zone carries a `data-section` attribute in the DOM. `IssueReporter` walks up from the right-clicked element to the nearest `data-section`, sends that string in the dispatch payload, and `.github/workflows/report-issue.yml` maps it to the label above via the **`SECTION_LABELS` table** (the single place to edit when adding/renaming a zone). Labels are created automatically on first use. Missing labels are non-fatal — the issue is still created with `signalement-utilisateur`.

**One module = one top-level section (hard convention).** Every module is its own component under `components/sections/` and gets its own wrapper in `app/page.tsx` carrying **both** the URL anchor `id` (deep links + `ShareButton`, cf. PR #199) and the `data-section` (signalement) — `#une-des-unes`, `#deux-solitudes`, `#partis-et-couverture`, `#enjeux-saillants`, `#assemblee-nationale`, `#polimetre-plus`. Modules 1 and 2 read the same table (`headline_events_4h`) but are **separate sections** (`UneDesUnesSection` / `DeuxSolitudesSection`) — never nest one module inside another.

> **Méthodologie is a static HTML page** (`public/methodologie/`), so the React `IssueReporter` does not run there; `page-methodologie` is reserved for when reporting is wired into that page. All other zones are reportable.

## Multi-repo ecosystem

This site sits at the end of a 3-repo pipeline. When something looks broken, check which layer owns it.

| Repo | Purpose |
|------|---------|
| `vitrine-showcase.github.io` (this repo) | Next.js static site + data fetch scripts |
| `aws-refiners` | R Lambda functions computing scores, aggregations, issue metadata — each refiner under `refiners/<name>/runtime.R` |
| `aws-infra` | AWS CDK: EventBridge schedules, Lambdas, Athena databases, S3. Refiners wired in `lib/data-stacks/refiners/refiners.ts` |

A colleague may also have these cloned locally — check before changing shared infra. Full backend detail: [`docs/reference/aws-backend.md`](./docs/reference/aws-backend.md).

## Where things live (just-in-time references)

- Directory tree, data flow, what-to-edit → [`docs/reference/architecture.md`](./docs/reference/architecture.md)
- Data schemas (issues_score, headline_events, ISSUE_KEYS) → [`docs/reference/data-schemas.md`](./docs/reference/data-schemas.md)
- AWS backend (refiner lifecycle, deploy, schedules, Athena) → [`docs/reference/aws-backend.md`](./docs/reference/aws-backend.md)
- Repeatable procedures (skill candidates) → [`docs/reference/procedures.md`](./docs/reference/procedures.md)
- Visual / editorial design → [`design_language.md`](./design_language.md)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
