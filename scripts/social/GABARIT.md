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

- **ARRÊTÉ · Même accroche partout** (`sceneIntro`, `lib/reel.ts`) : logo, filet et
  nom du module à la couleur du module, **trois lignes qui tombent une par une**
  (« pour appuyer chaque ligne »), un visuel propre au module dans le bandeau
  d'encre, puis l'édition. Seuls les lignes, le visuel et la couleur changent.
  - Une des Unes : « Les faits saillants / au Québec / en ce moment ».
  - Deux solitudes : « Québec / Canada / 2 solitudes ? » (Québec en bleu, Canada
    en rouge, la question à la couleur du module).
  - Les quatre autres sont déjà écrites dans `lib/modules.ts`.
- **ARRÊTÉ · Le logo est traversé par l'iridescence** (Adrien, 2026-09-16, d'après
  la version iridescente de « Vitrine — Image de marque » dans Notion) : une tache
  irisée floue respire derrière la marque, et une bande irisée traverse le logo,
  **découpée par le PNG lui-même** (`mask-image`) — seuls les traits s'allument, le
  papier autour ne bouge pas. Le PNG sert de gabarit : le calage est exact par
  construction, aucun tracé n'est redessiné. À l'accroche ET à la fin.
- **ARRÊTÉ · Même fin partout** (`sceneFin`) : logo, signature du module, adresse,
  bandeau des six éditions — le bandeau prend la couleur du module.
- **ARRÊTÉ · Une couleur par module**, définie une seule fois dans
  **`lib/modules.ts`**, lue par les reels ET par le site. Les six couleurs suivent
  les trois familles du banc d'essai (vitrine#715) mais donnent une nuance à
  CHAQUE module : le banc n'en donnait qu'une par famille, donc deux modules se
  ressemblaient. Aucune ne reprend une couleur d'enjeu (`lib/enjeux.ts`).
  🕑 **À trancher avec Yannick** : les six teintes elles-mêmes. Le mécanisme est
  posé, chaque couleur est une ligne à changer dans `lib/modules.ts`.
- ⚠️ Rappel de la règle d'Adrien du 3 sept. : **en ligne**, la Une des Unes garde
  le papier tel quel. L'accent colore les filets et les bandeaux, pas le fond.

## 1. Règles communes à tous les reels

### Production

- **ARRÊTÉ · Aperçu avant vidéo.** Le script ouvre d'abord un aperçu animé dans le
  navigateur ; la vidéo ne se produit qu'ensuite, avec `--mp4`, après relecture.
- **ARRÊTÉ · Format.** 1080×1920 (9:16), H.264, 30 images/s, piste audio muette
  (la musique s'ajoute dans Instagram).
- **ARRÊTÉ · Rythme.** Durées de base étirées par `SLOW = 1,4` (`lib/reel.ts`).
  La première version était jugée trop rapide.

### Mise en page

- **ARRÊTÉ · Rien ne dépasse du cadre.** Tout (illustration, bandeaux, graphiques,
  texte) reste à l'intérieur de l'encadré (30 px de chaque bord). `checkFrame`
  vérifie chaque scène ; `--mp4` refuse de produire la vidéo si un élément dépasse.
- **ARRÊTÉ · Remplir l'espace du cadre.** Pas de grands vides en bas de scène.
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
   Vitrine** à la place de la fleur de lys (demande d'Adrien, 2026-09-16), Fleur de lys, « Ce qui domine l'actualité du Québec »,
   vitrinedemocratique.com, bandeau bleu « Six éditions par jour » avec les six
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

## 4. Points ouverts

- **Phrase de tendance du site** (« L'attention est retombée depuis 16h cet après-midi
  (Sommet ce midi) ») : maladroite, affichée en grand ; à corriger dans le site
  (`lib/data/headlineEvents.ts`), le reel suivra.
- **Zones de l'interface Instagram** (en-tête, légende, boutons) : visibles dans
  l'aperçu (bouton « Zones Instagram »), pas encore imposées au gabarit.
- **Les reels restants** (12 enjeux, Partis et couverture, Polimètre+, Assemblée
  nationale, global) : reprennent toutes les règles de la section 1.
- **UN MODULE, UN POST** (Jules et Adrien, 2026-09-16) : un reel ne mélange pas deux
  modules. Le Canada était entré dans la Une des Unes le 16-09 ; il en est ressorti
  le jour même pour devenir le reel Deux solitudes. Seul le reel global les traverse
  tous, et c'est Jules qui le travaille.
- **Durée.** ~70 s avec les scènes 6 et 7 (contre ~46 s au départ). À valider :
  Instagram accepte 90 s, mais la rétention chute. Si on coupe, couper la scène 4
  (centile) avant les nouvelles.
