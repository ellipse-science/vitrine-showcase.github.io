---
name: reel-vitrine
description: >
  Produire les reels et les textes sociaux de la Vitrine (scripts/social), ou en
  créer un pour un module qui n'en a pas encore. Couvre la production d'une
  édition (données du moment, aperçu, contrôle du cadre ET des zones Instagram,
  MP4, les cinq textes de réseau), l'adaptation du gabarit visuel, et l'ajout
  d'un nouveau module. À utiliser dès qu'on demande « fais le reel de l'édition
  de 20h », « produis les formats pour les réseaux », « change telle scène du
  reel », ou « fais le reel des 12 enjeux ». Contient les pièges qui ont coûté
  du temps : données locales périmées, animation CSS sur un élément SVG, opacité
  en attribut, playwright absent du worktree.
---

# Produire et adapter les reels de la Vitrine

**Avant toute modification visuelle, lire [`scripts/social/GABARIT.md`](../../../scripts/social/GABARIT.md).**
Le gabarit est arrêté : on ne le renégocie pas à chaque publication, et toute
modification passe par ce fichier D'ABORD, puis par le code. Chaque décision y
est datée et signée — y compris les renversements.

## 1. Produire l'édition du moment

```bash
git pull                                   # ⚠️ indispensable : voir le piège 1
npm run reel:une-des-unes                  # aperçu animé + les cinq textes
npm run reel:deux-solitudes
npm run reel:une-des-unes -- --mp4         # la vidéo, après avoir regardé l'aperçu
```

Sortie dans `social-out/` (hors Git — on ne pousse JAMAIS de MP4) :

| Fichier | Quoi | Qui publie |
|---|---|---|
| `<module>_<date>_<h>.mp4` | la vidéo 1080×1920, piste muette | — |
| `…_linkedin.txt` | post long, 3 mots-clics | Adrien |
| `…_x.txt` | fil découpé, caractères comptés par message | Adrien |
| `…_facebook.txt` | post long | Jules |
| `…_instagram.txt` | légende, « lien dans la bio » | Jules |
| `…_tiktok.txt` | légende courte | Jules |
| `…_commentaire.txt` | les articles de la nouvelle n°1, avec signatures et liens | premier commentaire, partout |

**La piste est muette, et elle le reste** : la musique se prend dans le catalogue
de la plateforme au moment de publier. Un lit sonore fabriqué par nous a été
essayé le 16-09 et rejeté — ce n'était pas de la musique. `--musique
fichier.mp3` monte une trame dont on détient les droits, pour les plateformes
sans catalogue.

## 2. Les deux contrôles, à chaque production

Le script les lance seul et refuse de produire le MP4 si le premier échoue :

- **`cadre → rien ne dépasse`** : tout reste dans l'encadré (30 px des bords).
- **`zones → rien sous l'interface d'Instagram`** : aucun TEXTE sous l'en-tête,
  la légende ou la colonne de boutons (`SAFE` dans `lib/reel.ts`). Non bloquant —
  un bandeau décoratif a le droit de passer dessous — mais un chiffre ou un mot
  qui s'y trouve ne sera jamais lu.

**Ne jamais annoncer un reel sans avoir REGARDÉ des images fixes.**
`-- --apercu 12,31,47` écrit des PNG aux secondes demandées ; les ouvrir et les
lire. Le contrôle automatique dit si ça dépasse, pas si c'est beau ni si c'est
lisible.

## 3. Adapter une scène

1. Écrire la décision dans `GABARIT.md` (ARRÊTÉ / À VALIDER / REJETÉ, la date, qui
   l'a demandée). Un renversement se marque comme tel, il ne s'efface pas.
2. Modifier le script du module.
3. Relancer l'aperçu, relire les images fixes, vérifier les deux contrôles.

**La règle éditoriale qui prime sur toutes les autres** (Jules Piral, 16-09) :
*moins de stock*. Un reel se regarde en quelques secondes, sans son, sur un
téléphone. Ce qui compte, c'est le titre et le chiffre. Tout le reste — enjeu,
niveau, médias couvrants, notes de méthode — vit sur le site, où on a le temps.

## 4. Créer le reel d'un nouveau module

`une-des-unes.ts` sert de modèle. Un script de module ne fait que trois choses :
charger ses données avec **les loaders du site**, décrire ses scènes, écrire ses
textes. Tout le reste est commun :

- `lib/modules.ts` — nom, couleur et lignes d'accroche du module. **Une couleur
  par module, une seule table**, lue par les reels et par le site.
- `lib/reel.ts` — le moteur : `sceneIntro` (accroche commune, trois lignes qui
  tombent une par une), `sceneFin` (logo irisé, adresse, bandeau des six
  éditions), `logoAnime`, `teintePapier`, `buildPage`, `produce`.
- `lib/post.ts` — émojis, rappel, mots-clics, comptes à identifier.
- `lib/reseaux.ts` — les cinq formats et leurs contraintes.

Puis ajouter `"reel:<module>": "tsx scripts/social/<module>.ts"` dans
`package.json`, une ligne au tableau du README et une section au GABARIT.

**Les données viennent des loaders**, jamais du HTML publié ni d'un calcul
refait à côté : le reel doit montrer exactement ce que la page calcule, avec les
mêmes libellés. Si une valeur manque, elle s'ajoute au loader (`lib/data/`), pas
au script du reel.

## 5. Les pièges qui ont déjà coûté du temps

1. **Le reel montre le dépôt LOCAL, pas le site.** Sans `git pull`, on produit
   l'édition d'il y a quatre heures. Le script prévient au-delà de 5 h de retard.
   Dans un worktree qui ne suit pas `develop` : `git checkout origin/develop --
   public/data/headline-events.json`, produire, puis **restaurer** le fichier
   (`git checkout -- public/data/…`) — une donnée ne se commite jamais ici.
2. **Une animation CSS à `transform` sur un élément SVG écrase son attribut
   `transform`** et se calcule depuis l'origine du SVG : la flèche partait dans
   le coin. Mettre le placement sur un `<g>` parent, l'animation sur l'enfant,
   avec `transform-box:fill-box;transform-origin:center`.
3. **Une opacité posée en ATTRIBUT (`opacity=".12"`) est écrasée** par une
   animation CSS d'opacité — la tranche devenait un aplat plein. Passer par
   `fill-opacity`.
4. **Le pictogramme d'enjeu du site est un `<svg>` complet** : il ne s'affiche
   pas imbriqué dans un autre `<svg>`. Les pastilles se posent en HTML, par-dessus
   le graphique.
5. **`playwright` manque dans un worktree neuf** (node_modules non installés) :
   `npm install playwright --no-save`. Le rendu se rabat sur le Chrome du poste
   si le Chromium de Playwright n'est pas téléchargé.
6. **Le rendu d'un reel de 60 s prend ~4 minutes.** Valider sur l'aperçu et les
   images fixes AVANT de lancer `--mp4`.

## 6. Ce qui reste manuel

La publication. Le script n'envoie rien : il écrit les fichiers, un humain
publie. L'automatisation est prévue (voir la spec sociale d'Adam du 09-09) et
butera sur les autorisations des plateformes, pas sur le code.
