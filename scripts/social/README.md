# Reels Instagram de la Vitrine

**Avant toute modification visuelle, lire [`GABARIT.md`](./GABARIT.md)** : le gabarit
est arrêté, on ne le retouche pas à chaque publication.

Produit une vidéo verticale (1080×1920, MP4) et sa légende pour un module du
site, à partir des **mêmes données et des mêmes calculs que la page**.

## État (audit du 2026-09-16)

| Script | État |
|---|---|
| `une-des-unes.ts` (module 1) | LIVRÉ |
| `deux-solitudes.ts` (module 2) | LIVRÉ |
| 12 enjeux, Partis et couverture, Polimètre+, Assemblée nationale | PLANIFIÉ |
| Reel global (tour des six modules) | PLANIFIÉ — Jules |

**Un module, un post** (décision de Jules et d'Adrien, 2026-09-16) : un reel ne
mélange pas deux modules, sinon le public ne sait plus ce qu'il regarde. Le reel
global est le seul qui les traverse tous.

La publication reste **manuelle** : le script ne publie rien sur Instagram.

## Installation (une fois)

```bash
npm install
npx playwright install chromium   # facultatif : sinon, Chrome installé sur le poste
```

## Produire un reel

Deux temps : **on regarde l'aperçu, puis on produit la vidéo.**

```bash
git pull                                   # données de l'édition du moment
npm run reel:une-des-unes                  # 1. aperçu animé dans le navigateur
npm run reel:une-des-unes -- --mp4         # 2. la vidéo, une fois l'aperçu validé
npm run reel:deux-solitudes                # module 2, mêmes options
```

L'aperçu est la même page que celle qui est filmée pour le MP4 : lecture,
défilement, saut de scène, vitesse ralentie et bouton « Zones Instagram », qui
colore en rouge ce que l'interface masque (en-tête, légende, boutons).

Sortie dans `social-out/` (ignoré par Git — **on ne pousse jamais de MP4**) :

- `…_apercu.html` : l'aperçu animé ;
- `…​.mp4` : la vidéo (1080×1920, piste audio muette) ;
- **un texte par réseau**, prêt à copier, et le premier commentaire :

| Fichier | Qui publie |
|---|---|
| `…_linkedin.txt` | Adrien |
| `…_x.txt` (fil, caractères comptés par message) | Adrien |
| `…_facebook.txt` | Jules |
| `…_instagram.txt` (« lien dans la bio ») | Jules |
| `…_tiktok.txt` | Jules |
| `…_commentaire.txt` (articles + signatures de la nouvelle n°1) | en premier commentaire, partout |

Pour produire, adapter ou créer un reel, le skill **`reel-vitrine`**
(`.claude/skills/reel-vitrine/`) tient la marche à suivre et les pièges.

Options (après `--`, par exemple `npm run reel:une-des-unes -- --mp4`) :

| Option | Effet |
|---|---|
| `--mp4` | produit la vidéo (environ 1 min 30 de rendu) |
| `--edition 2026-09-16T15` | une édition passée (clé de bloc, voir la barre d'éditions du site) |
| `--apercu 5,20,35` | images fixes à ces secondes |
| `--sans-illustration` | mise en page sans l'illustration |
| `--sans-ouvrir` | écrit l'aperçu sans ouvrir le navigateur |
| `--sortie dossier` | autre dossier de sortie |

## Publier

1. Regarder la vidéo en entier : titres, chiffres, orthographe des médias.
2. Relire la légende. Les mots-clics sont dans `HASHTAGS`, en tête du script.
3. Publier depuis le compte Instagram et ajouter une musique dans l'application.

## Ce qu'il faut savoir

- **Le reel montre le dépôt local, pas le site.** Le script prévient si la
  dernière édition du dépôt a plus de 5 heures.
- **L'illustration n'existe que pour l'édition courante.** `latest.png` est
  écrasée à chaque cycle. Le script applique la garde du module : pas d'image
  si elle n'appartient pas à la Une n°1. Les éditions passées sortent donc
  sans illustration.
- **Aucune phrase n'est inventée.** Titres, résumés, niveaux de saillance et
  phrase de trajectoire viennent de `loadHeadlineEvents`. Les seuls textes
  propres au reel sont les étiquettes fixes des scènes et la légende, écrites
  selon les règles de rédaction (AGENTS.md, règle 7).
- **Rythme.** Toutes les durées sont étirées par `SLOW` dans `lib/reel.ts`
  (1,4 : le rythme validé).

## Ajouter un module

`lib/reel.ts` fournit le moteur : palette, fleur de lys, typographie OQLF,
assemblage des scènes (`buildPage`) et rendu MP4 (`renderReel`). Un script de
module ne fait que trois choses : charger ses données avec les loaders du
module, décrire ses scènes (HTML + animations CSS), écrire sa légende.
`une-des-unes.ts` sert de modèle.
