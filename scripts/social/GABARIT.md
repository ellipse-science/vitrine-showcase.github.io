# Gabarit des reels : décisions arrêtées

Ce fichier fixe le gabarit visuel et éditorial des reels Instagram de la Vitrine.
**On ne le renégocie pas à chaque publication** : un reel se produit en lançant le
script, pas en retouchant les visuels. Toute modification du gabarit passe par ce
fichier d'abord, puis par le code.

Décisions de Jules Piral, séance du 2026-09-16, sur le reel « La Une des Unes ».
État de chaque point : **ARRÊTÉ** (validé), **À VALIDER** (en place, pas encore
confirmé), **REJETÉ** (essayé puis écarté : ne pas réintroduire).

## 0. L'identité : une intro commune, une fin commune, une couleur par module

Demandes d'Adrien du 2026-09-16 (et de Yannick depuis le 2 sept.) : **un look
commun, une identité visuelle, un rappel marqué.**

- **ARRÊTÉ · Même accroche partout, sauf Partis et couverture** (`sceneIntro`, `lib/reel.ts`) : logo, filet et
  nom du module à la couleur du module, **trois lignes qui tombent une par une**
  (« pour appuyer chaque ligne »), un visuel propre au module dans le bandeau
  d'encre, puis l'édition. Seuls les lignes, le visuel et la couleur changent.
  - Une des Unes : « Les faits saillants / au Québec / en ce moment ».
  - Deux solitudes : « Québec / Canada / 2 solitudes ? » (Québec en bleu, Canada
    en rouge, la question à la couleur du module).
  - Les quatre autres sont déjà écrites dans `lib/modules.ts`.
  - **Exception · Partis et couverture** (Jules Piral, 2026-09-16) : l'accroche
    donne d'emblée le RÉSULTAT et un visuel (« Le PQ / est le parti dont on parle
    le plus aujourd'hui » et le vumètre des partis). Une accroche en questions y a
    été jugée « trop de texte ». Le nom du module reste en surtitre.
- **ARRÊTÉ · Le logo est traversé par l'iridescence** (Adrien, 2026-09-16, d'après
  la version iridescente de « Vitrine — Image de marque » dans Notion) : une tache
  irisée floue respire derrière la marque, et une bande irisée traverse le logo,
  **découpée par le PNG lui-même** (`mask-image`) — seuls les traits s'allument, le
  papier autour ne bouge pas. Le PNG sert de gabarit : le calage est exact par
  construction, aucun tracé n'est redessiné. À l'accroche ET à la fin.
- **ARRÊTÉ · AUCUN SON dans le MP4** (Adrien, 2026-09-16). La piste reste muette
  et la musique se prend dans le **catalogue de la plateforme** au moment de
  publier : c'est la seule façon d'être en règle sur Instagram et TikTok.
  `--musique fichier.mp3` monte une trame dont on détient les droits, pour les
  plateformes sans catalogue. 🪤 `public/audio/latest.mp3` date du 16 juin et sa
  génération est en panne silencieuse : ne pas le coller sur une vidéo du jour.
- **ARRÊTÉ · Les partenaires ont le carré de couleur pour eux** (Adrien,
  2026-09-16) : « Nos partenaires » et les dix logos du site, en papier, dans le
  bandeau de fin ; l'horaire des six éditions remonte sur le papier, ses cases au
  contour de la couleur du module (l'édition en cours est pleine). « Méthodologie
  complète au » au-dessus de l'adresse. Porté au format strict le 17-09 : tout
  tient au-dessus de la barre Vitrine + CAPP. 🪤 `llm-tool.png` est blanc sur fond
  noir, avec des bandes de couleur : on n'en garde que le mot « LLM TOOL ».
  **ARRÊTÉ · Tous les logos en blanc, aucune couleur** (Jules Piral, 2026-09-17).
  🪤 La Chaire est en couleurs : en silhouette, une tache. On garde son tracé
  foncé ou coloré et on efface ses séparations claires (`traceSeul`).
- **ARRÊTÉ · Même fin partout** (`sceneFin`) : logo, signature du module, adresse,
  bandeau des six éditions — le bandeau prend la couleur du module.
- **ARRÊTÉ · Palette « Sépia · Terres »** (Jules Piral, 2026-09-17, choisie parmi
  15 pistes : https://claude.ai/artifact/Wk2Ta2v3L3gxusxmRdWfgh). Papiers sépia
  inchangés ; une encre par module, sourde et lisible (contraste ≥ 3,9) : Une des
  Unes laiton `#80602A`, Deux solitudes bordeaux `#8F3036`, 12 enjeux mauve
  `#6A4872`, Partis **orange brûlé** `#8E4413`, Polimètre+ sauge `#4B6E50`,
  Assemblée **bleu Salon** `#2F4A8A` (comme le Salon bleu). **Renverse** les accents
  du banc d'essai (17-09 au matin). ⚠️ Orange des Partis voisin de QS, bleu de
  l'Assemblée voisin du PQ et de la CAQ. Même source pour le site : le banc
  d'essai lit `lib/modules.ts` (mode « Sépia · Terres »), avec un fond qui glisse
  d'un module à l'autre dans l'ordre réel des sections (`lib/degradeModules.ts`).
- **ARRÊTÉ · Une couleur par module**, définie une seule fois dans
  **`lib/modules.ts`** (`papier` et `accent`), lue par les reels ET par le site.
  **Palette « Sépia » du banc d'essai** (`components/lab/PaletteScrollLab.tsx`),
  retenue par Jules Piral le 2026-09-16 : un papier propre à chaque module, qui
  fonce d'un module à l'autre (Une des Unes `#F3ECDD` → Assemblée `#DCC3B4`), et
  un accent par famille (médias `#86642C`, pont `#7A4E33`, décideurs `#5E1A25`).
  C'est le papier qui distingue deux modules d'une même famille.
  **Renverse** les nuances par module du 16-09 et le papier teinté à 6 %
  (`teintePapier`) : Deux solitudes perd le rouge comme couleur de MODULE (il
  reste celui du Canada à l'intérieur du reel).
- **ARRÊTÉ · Bandeau de marque EN HAUT, contenu CENTRÉ** (Jules Piral, 2026-09-17,
  mesuré dans le simulateur d'iPhone) : les deux logos, centrés côte à côte, à
  y 150 ; l'édition juste dessous ; le contenu des scènes de y 272 à
  `CONTENT_BOTTOM`. L'accroche et la fin, qui portent déjà le grand logo, masquent
  ce bandeau commun ; une scène qui écrit déjà son édition masque aussi la ligne
  commune. La colonne va de **x 180 à x 900** — la limite de la colonne de boutons —
  donc elle est symétrique par rapport au milieu de l'image. Le texte garde
  l'alignement propre à chaque scène : le centrer partout écrase la hiérarchie en
  une pile verticale. « C'est bizarre qu'à droite il n'y ait rien parce que les
  boutons sont là, alors qu'à gauche il y a de l'information. » **Renverse** la barre du bas
  (16-09) : en plein écran sur iPhone, le bas est pris par le voile d'Instagram, la
  légende et la barre de navigation. Le texte s'écrit à 28 px au moins.
- ⚠️ Rappel de la règle d'Adrien du 3 sept. : **en ligne**, la Une des Unes garde
  le papier tel quel. L'accent colore les filets et les bandeaux, pas le fond.

## 1. Règles communes à tous les reels

### Production

- **ARRÊTÉ · Simulateur d'iPhone 17 dans l'aperçu** (Jules Piral, 2026-09-17) :
  bouton « iPhone 17 » — écran 1206 × 2622 (19,5:9), îlot dynamique, colonne de
  boutons, nom du compte, légende, son et barre de navigation du profil. Le reel
  9:16 y est posé à la largeur de l'écran, avec du noir en haut et en bas, comme
  le fait Instagram. C'est là qu'on juge ce qui se perd vraiment.
- **ARRÊTÉ · Aperçu avant vidéo, IMPOSÉ.** Le script écrit et ouvre d'abord
  l'aperçu animé (`social-out/<module>_<date>_<heure>_apercu.html` : lecture,
  défilement, vitesse, bouton « Zones Instagram »). C'est là qu'on regarde et
  qu'on corrige son reel. `--mp4` **refuse** de produire la vidéo si l'aperçu de
  CETTE version exacte (même page, donc mêmes données et même code : empreinte
  `data-empreinte`) n'a pas été généré juste avant. L'aperçu n'est pas versionné
  (~2 Mo, instantané des données) : il se régénère en une commande.
- **ARRÊTÉ · Format.** 1080×1920 (9:16), H.264, 30 images/s, piste audio muette
  (la musique s'ajoute dans Instagram).
- **ARRÊTÉ · Rythme.** Durées de base étirées par `SLOW = 1,4` (`lib/reel.ts`).
  La première version était jugée trop rapide.

### Mise en page

- **ARRÊTÉ · PLUS D'ENCADRÉ** (Jules Piral, 2026-09-17 : « dépendamment de
  l'affichage ça va avoir l'air coupé »). Le filet autour du reel est retiré : un
  trait collé au bord se lit comme une erreur dès qu'une plateforme rogne l'image.
  Le **décor** (`data-deco` : bandeaux, illustrations, aplats) va maintenant jusqu'aux
  bords ; tout le reste garde 30 px de marge, que le contrôle vérifie.
- **ARRÊTÉ · L'ESSENTIEL AU CENTRE** (Jules Piral, 2026-09-17 : « dans la vue pas
  en reel on doit voir LA stat ou LE contenu »). Le **cœur** est le carré central
  (1080 × 1080, y 420 → 1500), ce que montrent la grille du profil et le fil avant
  qu'on ouvre le reel. Chaque scène marque son essentiel — LA statistique, LE
  résultat — avec `data-cle`, et le contrôle refuse la vidéo s'il en sort. Le
  surtitre, la note de méthode et la légende vivent au-dessus et au-dessous : on
  les découvre en plein écran. L'aperçu trace ce carré en bleu.
- **ARRÊTÉ · Format Instagram STRICT, MESURÉ AU SIMULATEUR** (Jules Piral,
  2026-09-17). Image en **1080 × 1920 (9:16)**, le format qu'Instagram réclame.
  Sur un écran 19,5:9 (iPhone récents), l'application peut l'afficher de deux
  façons, et on tient dans l'union des deux :
  - **ajusté** (barres noires en haut et en bas) : rien n'est rogné, mais le
    compte, la légende et le son couvrent de y 1700 à 1920 ;
  - **plein écran** (agrandi jusqu'à remplir) : **98 px rognés à gauche et à
    droite**, et le bas couvert dès y 1560.

  D'où la ZONE SÛRE `SAFE` : **haut 150 px** (l'heure et l'îlot dynamique tombent
  sur la bande noire), **bas 380 px**, **côtés 110 px**, et rien à droite de
  **x 900** sous y 1040 (colonne de boutons). Le contenu s'arrête au-dessus de la
  barre de logos (`CONTENT_BOTTOM`) ; seul le décor `data-deco` sort de la zone.
  **Renverse** les marges tirées des guides (300/450/60/120) : trop prudentes en
  haut, trop permissives sur les côtés. Le simulateur d'iPhone 17 de l'aperçu
  sert de mesure ; les 14 reels ont été redécoupés le même jour (contenu décalé
  de 76 à 116 px à gauche, graphiques resserrés, titres remontés).
- **ARRÊTÉ · Pied de page dans la zone sûre** (Jules Piral, 2026-09-17, mesuré au
  simulateur en PLEIN ÉCRAN) : à 70 px du bas, il tombait derrière la barre de
  navigation d'Instagram. Il remonte juste au-dessus des logos et ne garde que
  l'édition (« Édition de 8h · 17.09.2026 ») ; le nom de la Vitrine, lui, est déjà
  dans la barre de logos.
- **ARRÊTÉ · La barre d'avancement descend sous la caméra** (Jules Piral,
  2026-09-17 : « la barre qui avance en haut passe à travers la caméra frontale ») :
  elle se pose à y 128, dans la largeur de la zone sûre, et non plus à 28 px du
  bord supérieur.
- **ARRÊTÉ · Taille minimale du texte : 26 px** (`MIN_FONT`), ~9,5 points sur un
  téléphone, où le reel s'affiche à ~36 %.
- **ARRÊTÉ · Vérification BLOQUANTE.** `checkFrame` contrôle bords, zone sûre, cœur et
  taille sur chaque scène ; `--mp4` refuse de produire la vidéo au moindre écart,
  et la console nomme l'élément fautif (« zone Instagram · scène classement : … (bas
  25 px) »).
- **ARRÊTÉ · Remplir l'espace du cadre.** Pas de grands vides en bas de scène.
- **ARRÊTÉ · Couleurs du ton, partout** : vert = favorable, rouge = défavorable
  (`TONE`, `lib/reel.ts`).
- **ARRÊTÉ · Langage visuel du site.** Papier/encre, Playfair Display, Source Serif 4,
  IBM Plex Mono, fleur de lys ; couleurs des bandes de saillance du site.

### Contenu

- **ARRÊTÉ · Les données d'abord (« It's the content, stupid »).** Chaque scène porte
  un chiffre ou un graphique ; le texte ne sert qu'à les lire. Les graphiques
  s'animent (barres qui montent, compteurs, courbes qui se tracent).
- **ARRÊTÉ · Enjeux = couleur ET pictogramme du CAPP.** Dès qu'un enjeu apparaît, il
  porte sa couleur (`lib/enjeux.ts`) et son pictogramme, rendu par le composant du
  site (`SymboleEnjeu`) via `enjeuGlyph`. Jamais une couleur seule, sans légende.
- **ARRÊTÉ · Moments de la journée = pictogrammes de l'en-tête.** Sous chaque heure
  d'un axe temporel : le pictogramme de l'en-tête du site (pleine lune 0h, lune 4h,
  petit soleil 8h, soleil plein 12h, soleil 16h, croissant 20h), l'heure, puis le
  moment (« hier soir », « ce midi »). Fonction `celestial`.
- **ARRÊTÉ · Aucune donnée ni phrase inventée.** Chiffres, titres, résumés, niveaux
  et phrases de tendance viennent des loaders du site. Les seuls textes propres aux
  reels sont les libellés listés dans ce fichier.
- **ARRÊTÉ · Exactitude des formulations.** Un centile est un rang : « plus saillante
  que 92 % des nouvelles », jamais « 92 % plus saillante ».
- **ARRÊTÉ · Typographie.** OQLF (insécable avant « : » et « % ») ; heures collées
  (« 16h ») ; pas de « n° » en Playfair (le signe y flotte) : en mono seulement,
  sinon une formulation en toutes lettres.
- **ARRÊTÉ · Crédit de l'illustration :** « Image générée sous la direction de Mathieu
  Fortin », discret et intégré : italique Source Serif, gris pâle, précédé d'un filet
  fin, en bas à droite là où l'image se fond dans le papier ; il apparaît après
  l'image. L'illustration n'apparaît que si elle correspond à la Une n°1 (garde du site).
- **ARRÊTÉ · Listes plutôt que tuiles.** Pour énumérer (médias…), une liste
  typographique ; pas de blocs noirs.

## 2. La Une des Unes (`une-des-unes.ts`)

Thème : **ce qui domine l'actualité du Québec en ce moment.** Ordre des scènes :

1. **Accroche.** **Logo de la Vitrine en haut** (demande d'Adrien, 2026-09-16 — le
   même fichier que les cartes de partage, `public/images/brand/`), puis « Ce qui
   domine l'actualité du Québec en ce moment » en très grand ; bandeau noir en bas où
   montent les barres de saillance de la journée ; édition et date. ARRÊTÉ.
2. **Une n°1.** Illustration en haut, étiquette « Une n°1 », enjeu, titre, puis deux
   chiffres : niveau de saillance **avec sa valeur en points** (« 43,7 points de
   saillance sur 24 heures » — demande d'Adrien, 2026-09-16 : le niveau seul ne dit
   pas de combien) et **« 6/6 des médias québécois en parlent »**. ARRÊTÉ.
3. **Trajectoire (scène vedette).** Kicker « Saillance · 24 dernières heures » ; **titre
   de la Une** avec le pictogramme de son enjeu ; compteur géant qui suit la valeur ;
   étiquette de niveau qui change de couleur à chaque édition ; barres qui montent une
   à une, valeurs dans les barres, « Sommet » marqué, barre rayée pour « Hors des
   Unes » ; pictogramme + heure + moment sous chaque barre ; phrase de tendance du
   site en bas. ARRÊTÉ.
   - **Ligne de tendance sur le sommet des barres, avec une flèche au bout**, « comme
     pour la bourse » : demande d'Adrien le 2026-09-16, qui **renverse le rejet** pris
     le matin même. Elle se trace une fois les barres montées, un point marque chaque
     sommet, et la flèche prend l'angle du dernier segment — elle pointe donc vers le
     bas quand l'attention retombe.
4. **Centile.** « *Cette actualité est plus saillante que* / **92 %** / des nouvelles de
   la dernière année » ; échelle de 100 graduations fines (1 graduation = 1 % des
   nouvelles, plus saillantes en haut) qui se remplit ; trait « *Cette actualité* » ;
   annotations **« 8 % des nouvelles de la dernière année ont été plus saillantes »**
   et **« 92 % ont été moins saillantes »**. ARRÊTÉ.
   - **ARRÊTÉ · L'échelle est une PILE DE JOURNAUX** (Adrien, 2026-09-16 : « ça
     aurait l'air d'être des journaux qui s'empilent ») : cent feuilles, chacune
     décalée, un peu plus courte ou plus longue que sa voisine, légèrement de
     travers, d'un papier un peu différent. Le désordre est pseudo-aléatoire mais
     STABLE (fonction de l'indice) : la même édition rejouée donne la même pile,
     sinon la vidéo tremblerait d'un rendu à l'autre.
   - Note de source « Nouvelles : les Unes des médias québécois suivis, sur une année
     de référence » : À VALIDER. Raison : la référence est une période fixe
     (17 mai 2025 → 7 août 2026, bientôt l'année civile 2025), pas une année glissante.
5. **Couverture.** « 6/6 » en grand, « des médias québécois en parlent », liste des six
   médias du panel avec « ✓ En Une » (ou grisé, « Pas en Une ») ; « En Une depuis … ».
   ARRÊTÉ.
6. **Classement (remplace « Course »).** Demande d'Adrien, 2026-09-16 : montrer
   **les TROIS nouvelles les plus saillantes de la journée et leur évolution**, plutôt
   que la première Une face à la deuxième. (Cinq a été essayé le même jour et écarté :
   trop dense, et les courbes du bas se confondent.) Titre « Les trois nouvelles les
   plus saillantes » ; légende affichée AVANT le tracé (pastille pictogramme, « N°1 ·
   enjeu » en mono, titre sur deux lignes au plus, échantillon du trait) ; courbes aux
   couleurs des enjeux ; **point au bout de chaque courbe, et pastille + valeur
   exactement à sa hauteur**, dans une gouttière à droite ; axe avec pictogrammes des
   moments. Même enjeu pour deux nouvelles : tirets, puis pointillé. ARRÊTÉ.
   - ⚠️ Le rang vient du **classement PUR** de l'indice (`rankTopUnes`, lu par
     `loadHeadlineEvents(cle, { classement: 5 })`), pas de la sélection du module :
     la page n'affiche que les Unes qui valent au moins la moitié du meneur (#430,
     B6) et en montre souvent deux. Montrer cinq nouvelles classées n'est donc pas
     affirmer que le module en afficherait cinq — d'où « nouvelles », jamais
     « Unes », dans le titre de la scène.
7. **~~Pendant ce temps, au Canada…~~ — PARTI dans son propre reel.** Essayé le
   2026-09-16 dans ce reel-ci, puis sorti le jour même : « un module, un post »
   (Jules et Adrien). Voir `deux-solitudes.ts` et la section 3. Ce qui avait été
   arrêté et qui a déménagé tel quel :
   - le radar des Deux solitudes, **anneaux RONDS** (les hexagones emboîtés se
     lisaient comme un cube en perspective) : balayage qui fait deux tours puis
     s'efface, les deux polygones éclosent depuis le centre (rouge Canada anglais,
     bleu Québec), pastille pictogramme au bout de chaque axe dans la couleur du camp
     qui le mène ;
   - le chiffre de **convergence**, lu **comme sur le site** : « 42 % de convergence »
     puis « 10 % plus divergent que d'habitude » (`relDiffPct` + `relLabel`, la phrase
     du hero du module) ;
   - **les trois nouvelles du Canada anglais**, les plus couvertes là-bas d'abord,
     chacune avec **deux barres** — part de l'attention des Unes canadiennes, part de
     l'attention des Unes québécoises — et son niveau de saillance. L'écart entre les
     deux barres EST la divergence : montrée, pas énoncée. ARRÊTÉ.
   - Le module ne chiffre QUE la convergence : `divPct` existe pour l'axe, il n'a
     aucun libellé public. Ne jamais écrire « X % de divergence ».
8. **Fin (commune à tous les reels, `sceneFin` dans `lib/reel.ts`).** **Logo de la
   Vitrine** à la place de la fleur de lys (demande d'Adrien, 2026-09-16), la
   signature du module, vitrinedemocratique.com, bandeau à la couleur du module « Six éditions par jour » avec les six
   pictogrammes et l'édition en cours en surbrillance. ARRÊTÉ.

**Légende Instagram** (`.txt`) : titre de l'édition, titre et résumé de la Une,
« 6/6 des médias québécois en parlent : … », niveau de saillance, autres Unes, lien.
Mots-clics `#polqc #QC2026 #VitrineDémocratique` : À VALIDER.

### Rejeté (ne pas réintroduire)

- ~~Ligne reliant le sommet des barres de la trajectoire.~~ **Renversé par Adrien le
  2026-09-16** : elle est maintenant demandée, avec une flèche (voir la scène 3).
- Cinq nouvelles au classement : trop dense, les courbes du bas se confondent (Adrien,
  2026-09-16). Trois.
- Deux scènes pour le Canada : une seule, radar et nouvelles ensemble (Adrien, 16-09).
- Radar en hexagone : rond (Adrien, 16-09).
- Étiquettes de fin posées à une hauteur « de rangement » : elles doivent tomber
  exactement sur le point d'arrivée de leur courbe (Adrien, 16-09).
- Tuiles noires pour les médias.
- Grille de 10×10 cases pour le centile (peu parlante).
- Couleurs de courbes par rang sans légende ni pictogramme (incompréhensibles).
- « 92 % plus saillante que toutes les Unes de l'année » (faux : c'est un rang).
- **Un lit sonore fabriqué par nous** (accord tenu en sinusoïdes, essayé le
  2026-09-16) : « c'est pas d'la musique ». La musique vient du catalogue de la
  plateforme.
- « Illustration générée par IA · Anorak Studio » ; crédit en petites capitales mono
  posé sur l'image (trop visible).
- Éléments pleine page qui débordent de l'encadré.
- Valeurs de fin posées à GAUCHE du dernier point : la courbe n°1, qui redescend,
  passait au travers de son propre chiffre. Elles vont dans une gouttière à droite.
- Radar à quatre anneaux : l'emboîtement se lit comme un cube isométrique.
- Pictogramme d'enjeu posé DANS le `<svg>` du radar : le composant du site rend un
  `<svg>` complet, qui ne s'affiche pas imbriqué. Les pastilles sont en HTML, par
  ‑dessus le graphique.
- 🪤 **Animation `pop` (ou toute keyframe à `transform`) directement sur un élément
  SVG** : la transformation CSS REMPLACE l'attribut `transform` et se calcule depuis
  l'origine du SVG — la flèche de la trajectoire partait dans le coin haut-gauche et
  sortait du cadre. Mettre le placement sur un `<g>` parent et l'animation sur
  l'enfant, avec `transform-box:fill-box;transform-origin:center`.

## 3. Deux solitudes (`deux-solitudes.ts`)

Thème : **le Québec et le Canada anglais regardent-ils la même journée ?**

- **ARRÊTÉ · Un seul plan, pas des slides** (Jules Piral et Adrien, 2026-09-16).
  Le radar tourne d'un bout à l'autre du reel, comme un sonar ; il n'y a pas de
  scènes qui se succèdent, sauf la fin.
- **ARRÊTÉ · Le balayage détecte.** Chaque tour du rayon fait apparaître un sujet :
  deux points sur son axe — rouge pour la part d'attention du Canada anglais, bleu
  pour celle du Québec — et la pastille de son enjeu au bout de l'axe. Une carte, en
  bas, nomme le sujet détecté et porte ses deux barres.
- **ARRÊTÉ · Synchronisme.** Un tour dure `TOUR` secondes, il y a autant d'axes que
  de sujets : le sujet k est détecté à `T0 + k·(TOUR + TOUR/n)`, donc exactement
  quand le rayon passe sur son axe. Changer `TOUR` ou l'ordre des axes sans refaire
  ce calcul casse l'effet.
- **ARRÊTÉ · Les deux solitudes apparaissent à la fin, pas au début.** Une fois les
  six sujets détectés, on relie les points : les deux polygones se dessinent, puis
  le chiffre de **convergence** (« 42 % de convergence · 10 % plus divergent que
  d'habitude ») et la phrase éditoriale du site.
- **ARRÊTÉ · Anneaux ronds**, quatre, en pointillé sauf le dernier : c'est un sonar.
- **ARRÊTÉ · Pas de légende sous le radar** (Adrien, 2026-09-16) : rouge = Canada,
  bleu = Québec, c'est évident et la place va à la carte du sujet.
- **ARRÊTÉ · UN SUJET À LA FOIS** (retour d'Adrien, 2026-09-16 : « les points qui
  apparaissent, c'est cool, mais un peu mêlant »). Pendant sa fenêtre, le sujet
  détecté tient tout : sa tranche du radar s'éclaire, son rayon s'épaissit, ses
  deux points sont pleins. Au sujet suivant, tout ça s'estompe — les points
  restent en retrait, pour que les deux formes se dessinent à la fin.
- **ARRÊTÉ · Radar petit, détections rapides** (même retour) : `TOUR = 2,1 s`, six
  sujets en ~15 s, rayon 228. La carte du bas, elle, est grande : titre sur trois
  lignes, deux barres, et les médias qui l'avaient en Une.
- **ARRÊTÉ · Six pastilles** sous la carte disent combien de sujets sont passés et
  lesquels sont menés par le Québec (bleu) ou par le Canada anglais (rouge).
- 🪤 Une opacité posée en ATTRIBUT (`opacity=".12"`) est écrasée par une animation
  CSS d'opacité : la tranche devenait un aplat plein. Passer par `fill-opacity`.

## 4. Partis et couverture (`partis.ts`)

Thème : **de quel parti parlent les Unes, dans quel média, sur quel ton.** Données :
`loadParties` (la section du site, y compris sa ventilation par média). Décisions
de Jules Piral, 2026-09-16. Règle de la série : **des titres qui disent le
résultat, AUCUN sous-titre**, à la couleur du module (orange brûlé, 17-09), rien qui attire l'œil sans servir.

1. **Accroche (résultat + visuel).** « Le PQ » en très grand, « est le parti dont on
   parle le plus aujourd'hui », petit vumètre des cinq partis. ARRÊTÉ.
2. **Jour.** « Le PQ est le parti dont on parle le plus aujourd'hui » ; vumètre par
   parti, temps en Une depuis minuit. ARRÊTÉ.
3. **Playlist par média.** Les médias se dévoilent un à un, lentement ; barre
   empilée par parti, sigle seulement au-delà de 12 %, **pas de pourcentages** ;
   à droite, le parti en tête dans ce média (« Surtout le PCQ », « X et Y à
   égalité »). ARRÊTÉ.
4. **Ton.** « Un ton défavorable pour 4 partis, favorable pour QS » ; un cadran par
   parti, rouge à gauche, vert à droite. ARRÊTÉ.
5. **Campagne.** « Depuis le début de la campagne, c'est la CAQ qui mène » ; barres
   sur une échelle ABSOLUE (une barre à 100 % laissait croire à un monopole). ARRÊTÉ.
6. **Fin commune.**

**Versions courtes** (`npm run reel:partis-court`, Jules Piral, 2026-09-17 ; la
longue est gardée). À VALIDER. Règles communes (moteur `partis-court/plan.ts`) :
- **12 secondes au plus, fin comprise** ; **un seul plan, pas des slides** : le
  visuel reste à l'écran, la caméra bouge, deux phrases se succèdent par-dessus ;
- **deux informations au plus**, en **phrases qu'on comprend du premier coup** ;
- au moins une **statistique inédite**, calculée à partir du module et jamais
  affichée telle quelle sur le site ;
- une analyse qui ne s'applique pas aux données du jour est **sautée** : on ne
  force jamais une histoire. `-- --liste` dit lesquelles s'appliquent.

Les dix analyses (`partis-court/analyses/`, un fichier chacune) :

| id | L'histoire | Le visuel |
|---|---|---|
| `record` | « 2 fois sur 3, c'est le PQ » ; record : du jamais vu depuis le début de la campagne | barres, la ligne du meilleur jour d'un autre parti, un éclair |
| `reunis` | le parti en tête pèse plus que les 4 autres réunis | une colonne contre la pile des autres |
| `horloge` | temps en Une en heures et minutes, contre les autres réunis | deux rubans d'heures qui se remplissent |
| `bascule` | le meneur depuis lundi n'est plus le meneur aujourd'hui | les barres de la semaine se transforment en barres du jour |
| `calendrier` | une case par journée de campagne ; aucun parti n'en mène la moitié | calendrier qui se colore |
| `ton` | défavorable pour 4 partis sur 5 ; un seul s'en tire | cinq cadrans dont les aiguilles s'agitent puis se posent |
| `medias` | « quand Le Devoir parle d'un parti, 97 % du temps c'est le PQ » ; en tête dans N médias | barres par média, les autres pâlissent |
| `oublie` | le parti dont on parle le moins, N fois moins que le premier | zoom de caméra sur sa barre |
| `remontee` | en une semaine, qui gagne le plus de points, qui en perd le plus | deux traits qui se croisent |
| `multiple` | d'habitude X %, aujourd'hui N fois plus | une barre découpée en blocs de sa moyenne |

⚠️ « Aujourd'hui » = depuis minuit : un record à 8h peut encore bouger. Les
minutes en Une s'additionnent sur tous les médias (« tous médias confondus »).
Rejeté le 17-09 : cinq scènes en slides, puis deux slides chiffre + record.

**Légende** : Instagram seulement pour l'instant (`_instagram.txt`), en récit suivi :
meneur et suivants, meneur par média, ton, campagne, puis le lien et les mots-clics.
Les autres réseaux (`lib/reseaux.ts`) sont écrits pour la Une des Unes : À FAIRE.

### Rejeté (ne pas réintroduire)

- Gros vinyle dans l'accroche, vinyles qui tournent : attirent l'œil, ne disent rien.
- Accroche en question ou en texte : trop de texte.
- Sous-titres de scène : rendent la lecture plus confuse.
- Pourcentages dans la playlist ; scène « par média » séparée (redondante).
- Pochettes d'album des partis : une seule par jour (bloc de 20h), pas fiables à
  chaque édition.

## 5. Présentation de la Vitrine (`vitrine.ts`)

Message : **« 6 modules pour mieux comprendre la démocratie au Québec »** (Jules
Piral, 2026-09-16). Ce reel EXPLIQUE : pas de résultat du jour, donc il reste vrai
d'une édition à l'autre. À VALIDER.

1. **Accroche** (refaite le 2026-09-17 : « plus catchy et belle », « un peu plus
   lentement », « le logo plus proéminent »). Le logo, centré, est dans un encadré en
   haut dès l'ouverture ; six bandes verticales aux papiers des modules partent du
   bas de cet encadré (jamais derrière le logo) ; six questions passent une à une (~1,3 s chacune),
   sur une carte crème, dans l'encre de leur module, pendant que sa bande s'éclaire
   (« Qu'est-ce qui fait la Une ? » … « Qui parle au Salon bleu ? ») ; les bandes
   s'effacent, le logo arrive SEUL et en grand (800 px), puis « 6 modules / pour
   mieux comprendre la démocratie au Québec » et un trait de chacune des six encres.
   Rejeté : question dans la même couleur que la bande qu'elle croise (illisible).
2. **D'où viennent les données.** Trois sources : 13 médias québécois et canadiens
   (leurs Unes, six fois par jour), l'Assemblée nationale (chaque jour de débat), les
   promesses électorales (leur écho dans les médias, avec le Polimètre). Puis, en
   encadré, **« Des modèles locaux, entraînés, validés et conservés à l'Université
   Laval »** — l'emphase est sur LOCAL, pas sur « IA » (Jules Piral, 2026-09-17 ;
   rejeté : le grand « IA »). « Gratuit, sans publicité, méthodologie publique ».
3. **Un module par scène**, sur son papier : « Module n sur 6 » et six points, le nom
   à la couleur du module, la QUESTION à laquelle il répond, **l'élément distinctif
   du module** (Jules Piral, 2026-09-16), puis « Sur le site : » ce qu'on y trouve.
   ARRÊTÉ :
   - Une des Unes : l'échelle de **saillance** à six bandes (couleurs et libellés du site) ;
   - Deux solitudes : le **radar** (anneaux ronds, polygones Québec bleu / Canada anglais rouge, balayage) ;
   - 12 enjeux : la **bourse** (mosaïque de tuiles aux couleurs et pictogrammes des enjeux, flèches ▲▼) ;
   - Partis et couverture : le **vu-mètre** (une colonne de segments par parti, qui bouge) ;
   - Polimètre+ : les **promesses** (pastille de rang à l'anneau du verdict, étiquette de verdict) ;
   - Assemblée : les **cartes de hockey** (cadre du parti, portrait, position = enjeu, macaron).

   Ces éléments sont redessinés SANS DONNÉES : aucune valeur, aucun nom, aucun
   rang, portraits en silhouette. Rejeté : les schémas génériques du premier jet
   (pile de journaux, cercles qui se recoupent, grille de pictogrammes, cadran,
   hémicycle), qui ne rappelaient pas le module. Piège : deux triangles opposés sur
   le radar dessinent une étoile à six branches — garder des formes irrégulières.
4. **Récapitulatif** : le message et la liste des six modules.
5. **Fin commune**, sans édition en surbrillance.

Légende Instagram : le message, la collecte, les six questions, le lien.

## 6. Les 12 enjeux · évolution de la semaine (`enjeux-semaine.ts`)

Thème : **comment le classement des douze enjeux a évolué pendant les sept
derniers jours.** Les rangs, parts d’attention et dates viennent de
`loadTreemap(...).week`, le même calcul que la vue « Semaine » du site.

1. **Accroche commune.** Les trois lignes du module et une miniature des douze
   trajectoires réelles de la semaine.
2. **Classement animé.** Les douze enjeux changent de rang, jour après jour. Une
   ligne porte toujours son rang, son pictogramme, son libellé court et son
   déplacement total sur la fenêtre.
3. **Bilan.** L’enjeu en tête, sa part d’attention, le nombre de jours passés au
   premier rang et les six déplacements les plus grands en valeur absolue.
4. **Fin commune.** Signature « Les 12 enjeux, jour après jour ».

Le Reel emploie une semaine glissante de sept jours, comme le site. Aucun rang
ni pourcentage n’est écrit à la main.

Repris le 17-09 après mesure au simulateur d'iPhone : la ligne qui double une
autre passe DEVANT, avec une ombre le temps du dépassement (sinon deux lignes
qui se croisent se lisent l'une sur l'autre), et la miniature de l'accroche
remonte au-dessus de la légende d'Instagram.

## 6 bis. La colonne, et la symétrie (17-09)

Deux défauts revenaient à chaque relecture de Jules Piral : « tout est pogné en
moton / en pain » et « à droite il y a un gros vide ».

**La colonne.** Chaque bloc d'une scène portait un `top` fixe, hérité d'un
cadrage plus haut : tout se tassait dans le tiers supérieur et le bas restait
vide. Une classe commune, `.zone-utile` (`lib/reel.ts`), va de `CONTENT_TOP`
(274) au BAS DU CARRÉ CENTRAL (1500) et répartit les blocs qu'on lui donne. Une
scène y met son titre, son graphique et sa légende ; `.grandir` marque le bloc
qui prend la place restante. Les scènes de `partis.ts`, `une-des-unes.ts` et le
reel de présentation sont passées dessus. Elle s'arrête à 1500 et non à 1540 :
ce qui porte `data-cle` doit tenir dans le carré vu dans la grille du profil.

⚠️ Le nom est long exprès. Une première version s'appelait `.colonne`, puis
`.pile` : ces deux noms existaient déjà dans des scènes (le vumètre, le duel des
reels courts), et une classe globale en `position:absolute` empilait tous leurs
éléments au même endroit.

**La symétrie.** Trois blocs étaient ancrés de x 30 à x 900, donc décalés à
gauche, avec 180 px de papier nu sur la droite : le bandeau de l'accroche, la
boîte des partenaires et le logo de l'accroche. Tout est maintenant à 180 px des
deux bords. La boîte des partenaires ne descend plus jusqu'en bas non plus :
elle porte elle-même le fond, donc elle épouse ses logos, titre compris.

**Le texte qui ne tient pas.** Le titre de la Une n'a pas de longueur fixe ; à
82 px, un titre de six lignes poussait les statistiques sous la légende
d'Instagram. Le corps suit la longueur (82 / 72 / 62 px). Même principe partout :
un bloc de taille fixe qui reçoit un texte variable finit par déborder.

**Le vérificateur.** `checkFrame` inspecte maintenant quatre moments par scène,
et il intersecte chaque ligne de texte avec l'ancêtre qui la ROGNE (`overflow`,
`-webkit-line-clamp`, ellipsis). Sans ça, un titre coupé à deux lignes était
signalé comme empilé sur ce qui suit, alors qu'à l'écran il n'y a rien.

**La zone descend (17-09, soir).** « Baisse le tout vers le bas, on perd trop
d'espace pour les slides sur les analyses. » La réserve du bas passe de 380 à
350 px : la zone sûre s'arrête maintenant à y 1570, douze pixels avant la
légende d'Instagram en plein écran (mesurée à y 1582), au lieu de 1540. La
hauteur utile d'une scène passe de 1226 à 1296 px. Ce qui porte `data-cle` doit
toujours tenir dans le carré central (1500) : un bloc clé placé en dernier dans
la colonne garde automatiquement 70 px de marge basse.

## 7. Points ouverts

- **Phrase de tendance du site** (« L'attention est retombée depuis 16h cet après-midi
  (Sommet ce midi) ») : maladroite, affichée en grand ; à corriger dans le site
  (`lib/data/headlineEvents.ts`), le reel suivra.
- **Les reels restants** (Polimètre+, Assemblée
  nationale) : reprennent toutes les règles de la section 1.
- **UN MODULE, UN POST** (Jules et Adrien, 2026-09-16) : un reel ne mélange pas deux
  modules. Le Canada était entré dans la Une des Unes le 16-09 ; il en est ressorti
  le jour même pour devenir le reel Deux solitudes. Seul le reel global les traverse
  tous, et c'est Jules qui le travaille.
- **Durée.** ~70 s avec les scènes 6 et 7 (contre ~46 s au départ). À valider :
  Instagram accepte 90 s, mais la rétention chute. Si on coupe, couper la scène 4
  (centile) avant les nouvelles.
