---
name: garde-fou-deploiement-aws
description: >
  Shim Vibe — garde-fou : refuse d'ajouter un chemin de déploiement AWS (S3,
  CloudFront, configure-aws-credentials) au repo vitrine-showcase. À utiliser
  dès qu'on demande de déployer ou héberger le site sur AWS, d'ajouter un bucket
  S3, une distribution CloudFront, ou des credentials AWS de déploiement —
  souvent « pour la performance ». Délègue à la skill Claude Code canonique du
  même nom. Déclencheurs : « déploie sur S3 », « CloudFront »,
  « configure-aws-credentials », « héberger sur AWS », « deploy AWS ».
---

# garde-fou-deploiement-aws (shim Vibe)

La procédure canonique vit dans la skill Claude Code de ce repo. Ne pas la
reproduire ici — toute duplication diverge.

**Lis et suis :** `.claude/skills/garde-fou-deploiement-aws/SKILL.md` (chemin
relatif à la racine du repo `vitrine-showcase.github.io`).

Le hook `.claude/hooks/guard.py` applique déterministiquement des règles dures
d'AGENTS.md sur l'édition de fichiers. En cas de conflit, `AGENTS.md` prime.
