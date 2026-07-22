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

À remplacer&nbsp;: une ou deux phrases qui expliquent ce que cette PR change pour le site.

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
La page Méthodologie (public/methodologie/index.html) ET les docs vivantes
du pipeline (public/docs/horaire-refiners-2026.html,
public/docs/workflow-vitrine-2025-swimlanes.html) doivent TOUJOURS refléter
le comportement réel du pipeline — copies canoniques uniques.
Cochez UNE case (le workflow garde-metho la vérifie si la PR touche des
fichiers sensibles). Guide : .claude/skills/synchro-methodologie/SKILL.md
-->

- [ ] Aucun impact métho — ne change ni calcul, ni seuil, ni horaire, ni collecte, ni représentation (justification&nbsp;: …)
- [ ] Métho mise à jour dans cette PR (sections/docs&nbsp;: …)
- [ ] PR métho séparée&nbsp;: #… (à merger avec/après le déploiement de celle-ci)

## Vérification responsive

<!--
Obligatoire si la PR touche components/, du CSS, app/page.tsx ou une page
statique de public/. Guide : .claude/skills/verification-responsive/SKILL.md
(viewports cibles, frontières de breakpoints 767/769 et 899/901, débordement
horizontal, TOUS les états dynamiques du composant).
-->

- [ ] Vérifiée en preview (viewports et états testés&nbsp;: …)
- [ ] Sans objet — la PR ne change rien au rendu (justification&nbsp;: …)

## Apport de l'IA

<!--
Règle dure #8 (AGENTS.md). L'humain reste seul AUTEUR : aucun commit/trailer
Co-Authored-By pointant vers une IA (bloqué par le check garde-attribution).
La PROVENANCE est obligatoire dès qu'une IA a aidé, TOUJOURS EN FRANÇAIS :
- commits → trailer « Assisté par: Claude Code (Opus 4.8) »
- corps de PR, issues, réponses/commentaires → ligne « 🤖 Assisté par … »
Remplacer tout libellé anglais par défaut (p. ex. « Generated with Claude Code »).
-->

- [ ] IA impliquée — provenance en français fournie (trailer sur les commits + «&nbsp;🤖 Assisté par …&nbsp;» dans ce corps de PR)
- [ ] Aucun apport d'IA
