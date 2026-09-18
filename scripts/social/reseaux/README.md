# Un dossier, un réseau

Cinq réseaux, cinq fichiers. **Modifier un réseau ne peut pas en changer un autre** —
c'est la seule règle de ce dossier, et elle est là pour qu'Adrien puisse retoucher
LinkedIn sans qu'un reel Instagram bouge.

| Fichier | Réseau | Qui publie |
|---|---|---|
| `linkedin.ts` | LinkedIn | Adrien |
| `x.ts` | X | Adrien |
| `facebook.ts` | Facebook | Jules |
| `instagram.ts` | Instagram | Jules |
| `tiktok.ts` | TikTok | Jules |

`index.ts` tient le registre et applique la typographie OQLF. Il ne décide rien du
contenu. `types.ts` porte le contrat entre un module et les réseaux.

## Ce qui est commun, et où

Trois niveaux, du plus figé au plus mouvant :

| Niveau | Où | Qui peut le changer |
|---|---|---|
| **Identité visuelle** — palette, accroche, fin, logos, zone sûre | [`../GABARIT.md`](../GABARIT.md) §0, puis `lib/modules.ts` et `lib/reel.ts` | Décision à deux, écrite dans `GABARIT.md` **avant** le code |
| **Identité éditoriale** — émojis, rappel, mots-clics, comptes | [`../lib/identite.ts`](../lib/identite.ts) | Décision à deux : une ligne change les cinq réseaux d'un coup |
| **Format d'un réseau** — longueur, liens, nombre de mots-clics | ce dossier, un fichier par réseau | Le responsable du réseau, seul |

Le **contenu** — chiffres, titres, liens — ne s'écrit à aucun de ces trois niveaux :
il vient des données (`loadHeadlineEvents`), et aucune phrase n'est inventée.

## Modifier un réseau

1. Ouvrir **son** fichier. Ne pas ouvrir `lib/identite.ts` : si le changement doit
   toucher les cinq réseaux, c'est qu'il se décide à deux.
2. Les contraintes de la plateforme sont en tête de chaque fichier (pourquoi X part
   en fil, pourquoi Instagram écrit « lien dans la bio »). Les lire avant de couper
   dedans.
3. Régénérer les textes et les relire : `npm run reel:une-des-unes`.

## Ajouter un réseau

Un fichier qui exporte un `Format` (`responsable` + `post`), une ligne dans
`RESEAUX` (`index.ts`), une ligne dans le tableau ci-dessus. Rien d'autre.
