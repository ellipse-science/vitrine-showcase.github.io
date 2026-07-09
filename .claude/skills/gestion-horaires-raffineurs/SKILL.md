---
name: gestion-horaires-raffineurs
description: "Change l'horaire (cron / fréquence) d'un raffineur du pipeline radar. À utiliser quand on demande de modifier QUAND ou à quelle FRÉQUENCE un raffineur tourne (ex. « fais tourner radar-issues-score à 8h »). Le changement se fait dans le repo aws-infra, PAS dans vitrine-showcase. Déclencheurs : « change l'horaire du raffineur », « fais tourner à Xh », « fréquence de rafraîchissement », « modifie le cron », « planifie le raffineur »."
---

# Changer l'horaire d'un raffineur

**Ce changement ne se fait PAS dans ce repo (`vitrine-showcase`).** Les horaires vivent dans le repo **`aws-infra`**. Ne modifie aucun fichier du site ni aucun workflow ici pour un changement d'horaire.

Procédure (source : `docs/reference/procedures.md` § « How to change a refiner schedule » + `docs/reference/aws-backend.md` § Schedule times + règle dure #2 d'`AGENTS.md`) :

1. **Édite `aws-infra/lib/data-stacks/refiners/refiners.ts`** — trouve l'entrée du raffineur concerné et change son tableau `cron`.
2. **Heure locale de Montréal (EDT/EST), PAS UTC** — c'est la règle dure #2 ; le commentaire en tête du fichier le rappelle. Ex. « 8h le matin » → `{ hour: '8', minute: '…' }` tel quel (ne convertis pas en UTC dans le cron).
3. **Lint avant de pousser** : `yarn lint:ts`, `yarn lint:eslint`, `yarn lint:prettier`. Prettier est strict — pas d'espaces d'alignement.
4. **Ouvre une PR vers `develop` dans `aws-infra`** — le déploiement CDK propage le nouvel horaire aux règles EventBridge.

Ne touche pas au repo `vitrine-showcase` pour ce changement. Contexte plus large : le multi-repo map dans `AGENTS.md` et le cycle de vie des raffineurs dans `docs/reference/aws-backend.md`.
