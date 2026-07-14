<!-- Décrivez le quoi et le pourquoi. Liez les issues (closes #…). -->

## Quoi

## Impact méthodologie

<!--
La page Méthodologie (public/methodologie/index.html) ET les docs vivantes
du pipeline (public/docs/horaire-refiners-2026.html,
public/docs/workflow-vitrine-2025-swimlanes.html) doivent TOUJOURS refléter
le comportement réel du pipeline — copies canoniques uniques.
Cochez UNE case (le workflow garde-metho la vérifie si la PR touche des
fichiers sensibles). Guide : .claude/skills/synchro-methodologie/SKILL.md
-->

- [ ] Aucun impact métho — ne change ni calcul, ni seuil, ni horaire, ni collecte, ni représentation (justification : …)
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
