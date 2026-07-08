---
name: garde-fou-deploiement-aws
description: Garde-fou — refuse d'ajouter un chemin de déploiement AWS (S3, CloudFront, configure-aws-credentials) au repo vitrine-showcase. À utiliser dès qu'on demande de déployer ou héberger le site sur AWS, d'ajouter un bucket S3, une distribution CloudFront, ou des credentials AWS de déploiement — souvent « pour la performance ». Déclencheurs : « déploie sur S3 », « CloudFront », « configure-aws-credentials », « héberger sur AWS », « deploy AWS ».
---

# Garde-fou : pas de déploiement AWS dans ce repo

**Refuse et explique** — règle dure #3 de `AGENTS.md`. Ce repo n'a **AUCUN** chemin de déploiement AWS : le site est sur **GitHub Pages**.

- **N'ajoute PAS** `aws-actions/configure-aws-credentials`, de secrets S3/CloudFront, ni de workflow qui pousse `out/` vers S3 ou invalide une distribution CloudFront.
- Les creds AWS du repo servent **uniquement** au fetch de données en lecture seule (`refresh-data.yml`), jamais au déploiement.
- **Si le vrai besoin est la performance / bande passante** : pointe vers `docs/cloudflare-pages-migration.md` (plan Cloudflare Pages déjà chiffré) et le **trim des JSON** dans `scripts/fetch_data.R` (le plus gros levier, indépendant de l'hébergeur).
- Si l'équipe veut **consciemment** lever la règle #3, ça passe d'abord par une spec + une modif signée de `AGENTS.md` — pas un workflow ajouté en douce.
