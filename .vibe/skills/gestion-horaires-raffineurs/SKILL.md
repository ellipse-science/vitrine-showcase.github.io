---
name: gestion-horaires-raffineurs
description: >
  Shim Vibe — change l'horaire (cron / fréquence) d'un raffineur du pipeline
  radar. À utiliser quand on demande de modifier QUAND ou à quelle FRÉQUENCE un
  raffineur tourne (ex. « fais tourner radar-issues-score à 8h »). Le
  changement se fait dans le repo aws-infra, PAS dans vitrine-showcase. Délègue
  à la skill Claude Code canonique du même nom. Déclencheurs : « change
  l'horaire du raffineur », « fais tourner à Xh », « fréquence de
  rafraîchissement », « modifie le cron », « planifie le raffineur ».
---

# gestion-horaires-raffineurs (shim Vibe)

La procédure canonique vit dans la skill Claude Code de ce repo. Ne pas la
reproduire ici — toute duplication diverge.

**Lis et suis :** `.claude/skills/gestion-horaires-raffineurs/SKILL.md` (chemin
relatif à la racine du repo `vitrine-showcase.github.io`).

⚠️ La source de vérité des horaires est `aws-infra/lib/data-stacks/refiners/refiners.ts`,
en heure de Montréal (règle AGENTS.md #1 du repo aws-infra). Toute PR qui touche
les horaires déclare son impact méthodologie (règle #4). En cas de conflit,
`AGENTS.md` prime.
