---
name: reel-vitrine
description: >
  Produire, publier et faire rayonner les reels et les posts de la Vitrine
  (scripts/social). Couvre le post de l'édition du moment (12h, 20h) : données,
  reel par plateforme, images fixes, MP4, textes prêts à coller ; sa publication
  sur la page LinkedIn ; et le commentaire « roi et reine » qui identifie les
  journalistes dont les articles ont fait la Une des Unes. Couvre aussi
  l'adaptation du gabarit visuel et l'ajout d'un nouveau module. À utiliser dès
  qu'on demande « fais le post de 20h », « sors-moi les reels du moment », « fais
  le reel sur la n°2 », « identifie les journalistes », « change telle scène du
  reel » ou « fais le reel des 12 enjeux ». Contient les pièges qui ont coûté du
  temps : données locales périmées, zones propres à chaque plateforme, contrôle
  aveugle aux traits SVG et aux cartes en milieu de scène, téléversement LinkedIn
  impossible à scripter, homonymes de journalistes.
---

# Produire, publier et faire rayonner les reels de la Vitrine

**Avant toute modification visuelle, lire [`scripts/social/GABARIT.md`](../../../scripts/social/GABARIT.md).**
Le gabarit est arrêté : on ne le renégocie pas à chaque publication, et toute
modification passe par ce fichier D'ABORD, puis par le code. Chaque décision y
est datée et signée — y compris les renversements.

## 1. Produire l'édition du moment

Les données de l'édition arrivent sur `develop` par le commit `data: refresh` de
:59 (l'édition de 20h = le bloc qui finit à 19h). Dans un worktree qui ne suit
pas `develop`, copier les fichiers SANS les indexer, produire, puis restaurer :

```bash
git fetch origin develop
git diff --name-status HEAD origin/develop -- public/data \
  | while read s f; do [ "$s" = M ] && git show "origin/develop:$f" > "$f"; done
# … produire …
git checkout -- public/data        # une donnée ne se commite jamais ici
```

```bash
npm run reel:une-des-unes -- --format linkedin               # aperçu + gabarit + textes
npm run reel:une-des-unes -- --format linkedin --apercu 4.2,8.8   # images fixes (§2)
npm run reel:une-des-unes -- --format linkedin --mp4         # la vidéo, après relecture
npm run reel:une-des-unes -- --format linkedin --vedette 2   # le reel porte sur la n°2
npm run social:atelier       # tous les modules × toutes les plateformes, sur une page
```

- **`--format`** : `instagram` (défaut), `facebook`, `tiktok`, `linkedin`, `x`,
  `bluesky`. Un rendu par plateforme : zones et provenance de chaque mesure dans
  `FORMATS` (`lib/reel.ts`). LinkedIn = X = Bluesky : un seul MP4 sert les trois.
  Une faute de frappe dans le format fait échouer le script au lieu de retomber
  sur Instagram.
- **`--vedette N`** : la scène de la n°1, avec son illustration, PUIS la n°N
  (badge « Une n°N »), sa courbe, son centile et sa couverture. La vedette n'est
  JAMAIS présentée comme la plus saillante. Seule la n°1 est illustrée par le
  site : la vedette prend le bloc de couleur. Lire ses chiffres AVANT, car ils
  s'affichent tels quels (le 22-09 : « 2/6 », « 80 % plus saillantes »).
  Pourquoi garder la n°1 : « voir que la politique n'est pas la n°1 », dit
  Adrien.
- **Rythme** : `SLOW = 1,0`, soit 43 s pour la Une des Unes. Le 1,4 a été
  renversé le 22-09 : « Il est ben trop long ».
- **L'illustration de la n°1 vient du site déployé** : elle n'existe qu'après le
  build de prod (vers :05). L'aperçu est une chaîne JavaScript : chercher
  `id=\"art` (guillemets échappés), pas `id="art"`.

Sortie dans `social-out/` (hors Git — on ne pousse JAMAIS de MP4) :

| Fichier | Quoi | Qui publie |
|---|---|---|
| `<module>_<date>_<h>[_n2]_<format>.mp4` | la vidéo 1080×1920, piste muette | — |
| `…_linkedin.txt` | post long, 3 mots-clics | Adrien (page) |
| `…_x.txt` (et `…_bluesky.txt` sur la branche du publieur) | fil découpé, caractères comptés par message | Adrien |
| `…_facebook.txt` | post long | Jules |
| `…_instagram.txt` | légende, « lien dans la bio » | Jules |
| `…_tiktok.txt` | légende courte | Jules |
| `…_commentaire.txt` | les articles de la n°1 | voir §7, qui le remplace |

**La piste est muette, et elle le reste** : la musique se prend dans le catalogue
de la plateforme au moment de publier. Un lit sonore fabriqué par nous a été
essayé le 16-09 et rejeté. `--musique fichier.mp3` monte une trame dont on
détient les droits, pour les plateformes sans catalogue.

## 2. Les deux verrous, à chaque production

1. **L'aperçu d'abord, toujours.** `--mp4` refuse de produire la vidéo si
   l'aperçu (`…_apercu.html`) de CETTE version exacte du reel n'a pas été généré
   juste avant (empreinte de la page). On lance sans `--mp4`, on REGARDE, on
   corrige, puis `--mp4`.
2. **Le gabarit, bloquant** — le moindre écart empêche le MP4 :
   - cadre : tout reste dans l'encadré ;
   - zone de la plateforme (`FORMATS`) : en-tête, légende, boutons, et le
     contenu au-dessus de la barre de logos (`CONTENT_BOTTOM`). Seul le décor
     marqué `data-deco` a le droit d'en sortir ;
   - lisibilité : aucun texte sous 26 px (`MIN_FONT`) ;
   - empilement, troncature, recouvrement : aucune ligne sur une autre, aucun
     texte coupé, aucun aplat opaque sur du texte (fin de chaque scène).
   Ne JAMAIS contourner un écart en marquant du texte `data-deco`.

**Ne jamais annoncer un reel sans avoir REGARDÉ des images fixes.** Le contrôle
dit si ça dépasse, pas si c'est beau, ni si c'est lisible. Il ne voit PAS un
trait SVG qui barre une étiquette, une pastille pâle posée sur un titre, ni une
carte qui ne vit qu'au milieu d'une scène. Le 22-09, quatre défauts lui avaient
échappé :
- les fins de scène se lisent dans les `data-t` de l'aperçu ; capturer chaque
  fin de scène (`data-t` suivant − 0,35 s) ET le milieu des scènes de plus de
  10 s (les cartes de Deux solitudes défilent en cours de scène) ;
- composer des planches de 2 images à 540×960 : plus petit, les étiquettes ne
  se lisent plus ;
- après `--mp4`, tirer 3 images du MP4 lui-même (`ffmpeg -ss <t> -frames:v 1`).

## 3. Adapter une scène

1. Écrire la décision dans `GABARIT.md` (ARRÊTÉ / À VALIDER / REJETÉ, la date, qui
   l'a demandée). Un renversement se marque comme tel, il ne s'efface pas.
2. Modifier le script du module.
3. Relancer l'aperçu, relire les images fixes, vérifier les deux contrôles.

**La règle éditoriale qui prime sur toutes les autres** (Jules Piral, 16-09) :
*moins de stock*. Un reel se regarde en quelques secondes, sans son, sur un
téléphone. Ce qui compte, c'est le titre et le chiffre. Tout le reste — enjeu,
niveau, médias couvrants, notes de méthode — vit sur le site, où on a le temps.

**Une position ne s'écrit pas en dur** quand ce qui est au-dessus peut grandir :
un titre de 4 lignes, une date longue. Poser par script, après
`document.fonts.ready`, sous l'élément RÉEL (voir l'accroche de `lib/reel.ts` :
bandeau, date, `--vis-h` du visuel du module ; titre de la scène Une qui
rétrécit jusqu'à 56 px).

## 4. Créer le reel d'un nouveau module

`une-des-unes.ts` sert de modèle. Un script de module ne fait que trois choses :
charger ses données avec **les loaders du site**, décrire ses scènes, écrire ses
textes. Tout le reste est commun :

- `lib/modules.ts` — nom, `papier`, `accent` (palette Sépia) et lignes
  d'accroche du module. **Une seule table**, lue par les reels et par le site.
  Le script passe `theme: { paper: M.papier, accent: M.accent }` et
  `logos: await loadLogos()` à `buildPage` : les logos Vitrine + CAPP sont sur
  TOUTES les scènes.
- `lib/reel.ts` — le moteur : `sceneIntro` (accroche commune, trois lignes qui
  tombent une par une), `sceneFin` (logo irisé, adresse, bandeau des six
  éditions), `logoAnime` (l'irisation ne touche QUE le monogramme VD), `loadLogos`,
  `buildPage`, `produce`, `TONE` (vert favorable, rouge défavorable).
- `lib/commun.ts` — choix de l'édition, tournures de rédaction (`joinFr`, OQLF).
- `lib/post.ts` — émojis, rappels, mots-clics, comptes à identifier.
- `lib/reseaux.ts` — les formats de chaque réseau et leurs contraintes.

Puis ajouter `"reel:<module>": "tsx scripts/social/<module>.ts"` dans
`package.json`, une ligne au tableau du README et une section au GABARIT.

**Les données viennent des loaders**, jamais du HTML publié ni d'un calcul
refait à côté : le reel doit montrer exactement ce que la page calcule, avec les
mêmes libellés. Si une valeur manque, elle s'ajoute au loader (`lib/data/`), pas
au script du reel.

## 5. Les pièges qui ont déjà coûté du temps

1. **Le reel montre le dépôt LOCAL, pas le site.** Copier les données de
   `develop` (§1). 🪤 `git checkout origin/develop -- <fichier>` INDEXE le
   fichier : `git checkout -- <fichier>` ne le restaure plus. Passer par
   `git show … > <fichier>`.
2. **Une animation CSS à `transform` sur un élément SVG écrase son attribut
   `transform`** et se calcule depuis l'origine du SVG : la flèche partait dans
   le coin. Mettre le placement sur un `<g>` parent, l'animation sur l'enfant,
   avec `transform-box:fill-box;transform-origin:center`.
3. **Une opacité posée en ATTRIBUT (`opacity=".12"`) est écrasée** par une
   animation CSS d'opacité — la tranche devenait un aplat plein. Passer par
   `fill-opacity`.
4. **Le pictogramme d'enjeu du site est un `<svg>` complet** : il ne s'affiche
   pas imbriqué dans un autre `<svg>`. Les pastilles se posent en HTML,
   par-dessus le graphique, en POURCENTAGES du viewBox (en pixels bruts,
   l'anneau de Deux solitudes était décalé de 60 px du radar).
5. **`playwright` manque dans un worktree neuf** (node_modules non installés) :
   `npm install playwright --no-save`. Le rendu se rabat sur le Chrome du poste
   si le Chromium de Playwright n'est pas téléchargé.
6. **Le rendu d'un reel de 43 s prend ~4 minutes.** Valider sur l'aperçu et les
   images fixes AVANT de lancer `--mp4`.
7. **Mesurer une géométrie sur le RENDU, pas sur le fichier source.** Le « E » de
   VITRINE est à 21,3 % du logo rendu contre 19,3 % dans le PNG : le masque de
   l'irisation le colorait.
8. **Un 2/6 qui étonne se vérifie titre par titre** dans `headline-events.json`
   (`articles`, `articles_24h`) avant d'en douter : « en Une » veut dire la
   manchette, pas « en parle sur son site ».

## 6. Publier sur LinkedIn

Le script n'envoie rien : il écrit les fichiers, un humain publie.
L'automatisation (vitrine#684) vise la PAGE, donc l'API Community Management,
qui passe par un examen.

- **Depuis la PAGE « La Vitrine démocratique »**
  (`linkedin.com/company/vitrine-démocratique-capp`), pas depuis le profil.
- **Le texte** suit le format réécrit par Adrien le 22-09 (encodé dans
  `lib/reseaux.ts` sur la branche `feat/social-publieur`, pas encore versé) : le lien sous le
  titre, la mesure sur sa 2e ligne (`+73 %/16h`), un rappel court (« Gratuit,
  scientifique, sans publicité : vitrinedemocratique.com 🚀 »). Il se COLLE
  depuis le presse-papiers (`pbcopy`, puis `cmd+v`) et ne se retape jamais :
  les espaces insécables y tiennent.
- **L'aperçu de lien** que LinkedIn fabrique depuis l'adresse doit être retiré
  (×) AVANT la vidéo : tant qu'il est là, « Ajouter un média » disparaît.
- **La vidéo, c'est l'humain qui la joint.** L'éditeur média de LinkedIn ignore
  un fichier posé par script (trois essais le 22-09 : champ intercepté, `change`
  relancé, glisser-déposer simulé). Montrer le fichier : `open -R <mp4>`.
- **« Publier » et « Commenter » : jamais nous.** On prépare, l'humain relit et
  envoie.
- Premier commentaire de la page : les partenaires et l'équipe à identifier
  (`COMPTES` de `lib/post.ts`).

## 7. Le commentaire « roi et reine » : identifier les journalistes

**La stratégie** (Adrien, 23-09) : chaque journaliste dont l'article a fait la
Une des Unes reçoit une notification, voit que son article est « roi » ou
« reine » des Unes, et découvre la Vitrine. C'est notre meilleur canal vers les
journalistes, et on le fera souvent.

**Les articles** : TOUS ceux des nouvelles vedettes (la n°1 et la vedette, ou le
top 2), pas un seul. On les tire des lignes du `storyline_id` dans
`headline-events.json`, champs `articles` et `articles_24h` (`media_id`,
`author`, `url`), avec un `tag` au plus égal au bloc de l'édition : pas les
articles du lendemain. Médias québécois seulement. Une ligne par média, et un
journaliste qui signe deux articles n'est identifié qu'une fois.

**Le format** (1 250 caractères au plus, limite d'un commentaire LinkedIn) :

```text
👑 Les articles qui ont fait la Une des Unes de 20h

1. Guy Turcotte n'obtient pas de sortie de prison avec escorte

La Presse — @Louis-Samuel Perron
https://www.lapresse.ca/…

2. Le PQ frôle la majorité, la course électorale se fragmente

Journal de Montréal — @Marc-André Gagnon
https://www.journaldemontreal.com/…
```

**Dans LinkedIn, pas à pas :**
1. **Passer l'identité à la page AVANT de taper.** Le changement vide le
   brouillon. Chemin : l'avatar ▾ à gauche de « J'aime », puis « Commentez,
   réagissez et republiez pour le compte de », puis La Vitrine démocratique,
   puis Enregistrer.
2. **Mentionner** : taper `@Nom` et cliquer l'option dont le TITRE nomme le
   média.
   - Les homonymes sont la règle : 7 Stéphanie Marin, plus de 10 Jack Wilson.
   - Si la bonne personne n'est pas proposée (souvent en 3e niveau), effacer le
     `@` et laisser le nom en texte. Ne jamais prendre un homonyme « au cas où ».
   - Une signature de pupitre (« Radio-Canada Info ») s'identifie par la page
     du média : « Radio-Canada », pas « CBC/Radio-Canada ».
3. **Sauter les lignes avec `shift+Enter`.**
4. **Vérifier avant de rendre la main** : les mentions (`[data-type=mention]`),
   aucun `@` orphelin, la longueur. Puis l'humain clique « Commenter ».

**Les comptes vérifiés** (22-23 septembre 2026, un par un, sur la plateforme
même, par un titre ou une bio qui nomme le média ; jamais d'adresse courriel
ici) :

| Journaliste | Média | LinkedIn (titre à choisir) | X | Bluesky |
|---|---|---|---|---|
| Louis-Samuel Perron | La Presse | « journaliste at La Presse » (3e) | @lsp_10 | — |
| Stéphanie Marin | Le Devoir | « Journaliste spécialisée en affaires judiciaires… » (2e) | @MarinSteph | — |
| Camille Payant | Journal de Montréal, TVA | « Journaliste au Journal de Montréal » (2e) | @PayantCamille | @camillepayant.bsky.social |
| Marc-André Gagnon | Journal de Québec / de Montréal | « Correspondant parlementaire à l'Assemblée nationale » (2e) | @MAGagnonJDQ | @magagnonjdq.bsky.social |
| Jack Wilson | Montreal Gazette | « Reporter for The Montreal Gazette » (3e, NON proposé en mention) | — | @jackdlwilson.bsky.social |
| Radio-Canada Info | Radio-Canada | page « Radio-Canada » | @RadioCanadaInfo | @info.radio-canada.ca |
| Tom Mulcair | Montreal Gazette (chronique) | aucun profil | — | — |

Un nom absent du tableau se vérifie avant d'être identifié, puis s'ajoute ici
avec la date.
