<!-- Décrivez le quoi et le pourquoi. Liez les issues (closes #…). -->

## Quoi

## Note de journal

<!--
1 à 2 phrases GRAND PUBLIC pour le Journal des mises à jour (/journal).
Extraites automatiquement au merge (version-bump.yml) — écrivez ce que la
PR change pour le site, en langage simple, sans jargon interne (pas de noms
de tables, de raffineurs ni de colonnes). Règles d'écriture :
.claude/skills/redaction-editoriale/SKILL.md. Section vide ou inchangée →
le titre de la PR est utilisé tel quel.
-->

À remplacer : une ou deux phrases qui expliquent ce que cette PR change pour le site.

## Version (label `semver:*`)

<!--
Le bump est piloté par le LABEL de la PR, pas par cette case — la case sert
d'aide-mémoire. Critère : ce qu'un VISITEUR du site perçoit.
Guide complet : AGENTS.md § Versionnage. En cas d'hésitation, le plus bas.
-->

- [ ] Aucun label — rien ne change pour le visiteur (docs, CI, tests, refactor)
- [ ] `semver:patch` — correctif ou retouche d'un module existant
- [ ] `semver:minor` — nouveauté ou évolution visible (module, donnée, visuel, calcul)
- [ ] `semver:major` — refonte ou rupture

## Impact méthodologie

<!--
« Métho » = TROIS documents, pas seulement la page Méthodologie :
  1. public/methodologie/index.html          (le contrat public)
  2. public/docs/horaire-refiners-2026.html  (quand chaque étage tourne)
  3. public/docs/workflow-vitrine-2025-swimlanes.html  (qui produit quelle table)
Les trois doivent TOUJOURS refléter le comportement réel du pipeline —
copies canoniques uniques.

⚠️ Piège vécu (aws-infra#429, juillet 2026) : « aucun impact » a été coché
avec pour justification « pas décrit dans la page Méthodologie » — alors que
le raffineur débranché occupait un couloir entier des swimlanes, restées
fausses 17 jours. Vérifiez les TROIS, pas la première.

Cochez UNE case (le workflow garde-metho la vérifie si la PR touche des
fichiers sensibles). Guide : .claude/skills/synchro-methodologie/SKILL.md
-->

- [ ] Aucun impact métho — ne change ni calcul, ni seuil, ni horaire, ni collecte, ni représentation, ET les 3 docs restent exactes (justification, en nommant les 3 : …)
- [ ] Métho mise à jour dans cette PR (sections/docs : …)
- [ ] PR métho séparée : #… (à merger avec/après le déploiement de celle-ci)

## Vérification responsive

<!--
Obligatoire si la PR touche components/, du CSS, app/page.tsx ou une page
statique de public/. Guide : .claude/skills/verification-responsive/SKILL.md
(viewports cibles, frontières de breakpoints 767/769 et 899/901, débordement
horizontal, TOUS les états dynamiques du composant).
-->

- [ ] Vérifiée en preview (viewports et états testés : …)
- [ ] Sans objet — la PR ne change rien au rendu (justification : …)

## Apport de l'IA

<!--
Règle dure #8 (AGENTS.md). L'humain reste seul AUTEUR : aucun commit/trailer
Co-Authored-By pointant vers une IA (bloqué par le check garde-attribution).
La PROVENANCE est obligatoire dès qu'une IA a aidé, TOUJOURS EN FRANÇAIS :
- commits → trailer « Assisté par : Claude Code (Opus 4.8) »
- corps de PR, issues, réponses/commentaires → ligne « 🤖 Assisté par … »
Remplacer tout libellé anglais par défaut (p. ex. « Generated with Claude Code »).
-->

- [ ] IA impliquée — provenance en français fournie (trailer sur les commits + « 🤖 Assisté par … » dans ce corps de PR)
- [ ] Aucun apport d'IA
