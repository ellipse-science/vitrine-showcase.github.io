# Reference — Garde-fous & automatisation déterministe

Ce repo applique certaines règles de façon **déterministe** (hooks, CI) plutôt que de seulement les conseiller — principe « ne jamais demander au LLM le travail d'un outil déterministe ». Les règles elles-mêmes sont dans [`AGENTS.md`](../../AGENTS.md).

## Hook d'agent (local)

`.claude/hooks/guard.py` (enregistré dans `.claude/settings.json`, événement `PreToolUse` sur `Write|Edit|MultiEdit`) **bloque** mécaniquement deux actions, avec un message expliquant l'alternative (code de sortie 2) :

1. toute écriture/édition sous `public/data/` — généré par `scripts/fetch_data.R` (règle dure #1) ;
2. l'ajout de `aws-actions/configure-aws-credentials` dans un fichier — pas de déploiement AWS (règle dure #3).

Il s'applique à tout agent travaillant dans le repo (après acceptation des réglages projet).

> `.claude/settings.local.json` reste **personnel** (git-ignoré). `settings.json`, `skills/` et `hooks/` sont **partagés** (versionnés).

## Portes CI (sur chaque PR)

`.github/workflows/ci.yml` exécute, sur toute PR vers `develop` : **type-check → test → build**. Rien qui casse la compilation, la logique de données (tests `lib/data/`) ou le build n'atteint `develop`.

## Garde attribution humaine (sur chaque PR)

`.github/workflows/garde-attribution.yml` échoue si un commit de la PR met une IA en **paternité** : auteur/committer avec adresse IA, ou trailer `Co-Authored-By` pointant vers `noreply@anthropic.com`, Copilot, etc. (règle dure #8, issue #235). La distinction est volontaire :

- **Paternité (bloquée)** — GitHub parse l'auteur/committer et `Co-Authored-By` comme une co-signature et crédite le co-auteur dans le graphe Contributors. Pas d'auteur non humain sur un livrable scientifique.
- **Provenance (permise)** — un trailer `Assisted-by: Claude Code (Opus 4.8)` (ou `Generated-with:`) documente l'outil sans être compté comme co-auteur par GitHub. C'est la forme sanctionnée pour reconnaître l'assistance machine ; le check la laisse passer.

Complément préventif : `"includeCoAuthoredBy": false` dans `.claude/settings.json` empêche Claude Code de générer le trailer de paternité. La détection se fait par adresse courriel, pas par prénom.

## Garde rédaction / typographie (sur chaque PR)

`.github/workflows/garde-redaction.yml` exécute `scripts/garde_redaction.mjs`, qui applique la règle dure #7 à ce que **nous** écrivons : littéraux de chaîne et nœuds de texte JSX de `app/`, `components/`, `lib/`, plus le HTML de `static-content/` et de `public/` (page Méthodologie et docs vivantes du pipeline).

Sept règles, toutes tirées du guide Notion (miroir : [`redaction-editoriale`](../../.claude/skills/redaction-editoriale/SKILL.md)) : heure collée (`16h`, jamais `16 h`), pas de tiret cadratin, insécable avant `:` et `%` et dans les guillemets français, **aucune espace avant `;`, `?` et `!`** (norme québécoise, à l'inverse de la France), « Une » toujours en majuscule.

Trois choix de conception valent d'être connus :

- **Les sources, pas `out/`.** Les manchettes des médias ne sont pas de notre plume : elles se normalisent au rendu, pas à la source. Les faire échouer une PR n'aurait aucun sens.
- **Analyse par spans, pas par lignes.** Seuls les littéraux de chaîne et le texte JSX sont examinés, et le contenu des interpolations `${…}` est neutralisé — sinon chaque ternaire `cond ? a : b` et chaque annotation TypeScript déclencherait la règle de l'insécable. Le tri texte/code se fait **après** ce masquage : `Son sommet&nbsp;: ${label ?? "plus tôt"}` est du texte affiché qui contient du code, et le juger sur le brut le faisait sortir de la garde avec ses vraies fautes.
- **Cliquet sur `scripts/garde_redaction.baseline.json`.** Ce fichier fige la dette (208 violations distinctes au 2026-08-13 — suivi&nbsp;: #446). Le check échoue sur toute violation **nouvelle**, et aussi quand une entrée de dette ne correspond plus à rien — pour que la dette ne puisse que rétrécir. Après une correction : `npm run garde-redaction -- --ecrire-baseline`.

**La dette a bondi de 84 à 208 en ouvrant `public/`** (#462), et c'est le résultat attendu, pas un accident : 117 des 124 entrées neuves viennent des trois pages HTML de `public/`, que rien ne vérifiait — dont 73 tirets cadratins. Les 7 autres sont de notre plume ailleurs, débusquées par la règle neuve, dont trois questions de `lib/shareModules.ts`, le texte qui part sur les réseaux sociaux.

Dérogation légitime (séparateur de `<title>`, tiret employé comme glyphe de donnée absente) : écrire `garde-redaction: ok (raison)` en commentaire, sur la ligne ou juste au-dessus.

**Trou connu** : les notes de `/journal` viennent de la section « Note de journal » du corps des PR et sont ajoutées à `static-content/changelog.json` par `version-bump.yml` **après** le merge. Le check ne peut donc rien y empêcher, et le fichier est exclu de l'analyse.

## Auto-merge Dependabot

`.github/workflows/auto-merge-dependabot.yml` approuve puis active l'auto-merge (`gh pr merge --auto`) des PRs Dependabot. **L'auto-merge ne fusionne que si la protection de branche de `develop` exige le check CI en succès.**

À vérifier (réglage admin) : Settings → Branches → règle sur `develop` → « Require status checks to pass before merging » doit inclure le job **CI**. Sans ça, une mise à jour de dépendance pourrait être fusionnée sans CI verte. Le workflow utilise `pull_request_target` (token avec write) — acceptable car restreint à l'auteur `dependabot[bot]`.

## PR #102 « keep open » (aws-refiners)

Le déploiement d'un raffineur passe par une PR permanente `develop → main` **jamais fusionnée** (mécanisme `pr.yml` → ECR → redeploy). Détail : [`aws-backend.md`](./aws-backend.md). Contournement assumé, documenté ici pour mémoire.
