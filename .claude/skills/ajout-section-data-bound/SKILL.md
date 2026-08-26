---
name: ajout-section-data-bound
description: "Ajoute une nouvelle section data-bound au site Vitrine (afficher une table Athena sur la page). À utiliser quand on demande d'ajouter ou d'afficher une section, un module ou un bloc alimenté par des données (scores de partis, enjeux, etc.), de brancher une nouvelle table, ou d'activer une table dormante de scripts/tables.json. Déclencheurs : « ajoute une section », « affiche la table X », « nouveau module data », « branche les données »."
---

# Ajouter une section data-bound

Exemple canonique à cloner : `lib/data/parties.ts` + `components/sections/PartisCouvertureSection.tsx` + `components/interactive/PartisCouvertureClient.tsx`. Procédure complète : `docs/reference/procedures.md` (§ « How to add a new data-bound section »).

## Étapes
1. **Donnée** : active la table dans `scripts/tables.json` (bascule `enabled:false` → `true`, ou repère l'entrée existante). **N'invente pas de source.** **N'édite JAMAIS** un JSON sous `public/data/` à la main — il est rafraîchi par `scripts/fetch_data.R`.
2. **Loader** typé dans `lib/data/` : lit depuis `public/data/` et **pré-calcule toutes** les valeurs d'affichage (le composant React ne fait aucun calcul).
3. **Server Component** async dans `components/sections/`.
4. **Client Component** `'use client'` dans `components/interactive/` **seulement** s'il y a onglets/filtres.
5. **Câble** dans `app/page.tsx`, dans un wrapper `data-section="…"`.

## Pièges à ne pas rater
- **Ordre table ↔ build (sinon le build casse).** Les loaders font `fs.readFile` sans try/catch : si le JSON n'existe pas au build, `npm run build` (et la CI/`deploy.yml`) échoue. L'activation de la table + le 1er refresh (JSON committé) doivent atterrir **avant ou avec** le code UI sur `main`. Sinon, durcis le loader pour renvoyer `null` sur `ENOENT` afin que la section se masque tant qu'il n'y a pas de donnée.
- **Label de module/signalement.** Une nouvelle section = un nouveau module : choisis un nom `data-section` cohérent et, si le triage par clic droit s'applique, un label GitHub assorti (cf. `AGENTS.md` § « Module naming + signalement labels »).
