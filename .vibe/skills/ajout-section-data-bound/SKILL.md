---
name: ajout-section-data-bound
description: >
  Shim Vibe — ajoute une nouvelle section data-bound au site Vitrine (afficher
  une table Athena sur la page). À utiliser quand on demande d'ajouter ou
  d'afficher une section, un module ou un bloc alimenté par des données (scores
  de partis, enjeux, etc.), de brancher une nouvelle table, ou d'activer une
  table dormante de scripts/tables.json. Délègue à la skill Claude Code
  canonique du même nom. Déclencheurs : « ajoute une section », « affiche la
  table X », « nouveau module data », « branche les données ».
---

# ajout-section-data-bound (shim Vibe)

La procédure canonique vit dans la skill Claude Code de ce repo. Ne pas la
reproduire ici — toute duplication diverge.

**Lis et suis :** `.claude/skills/ajout-section-data-bound/SKILL.md` (chemin
relatif à la racine du repo `vitrine-showcase.github.io`).

⚠️ Le hook `.claude/hooks/guard.py` bloque déterministiquement l'édition manuelle
de `public/data/` (règle dure AGENTS.md #1). La règle mère est dans `AGENTS.md`.
En cas de conflit, `AGENTS.md` prime.
