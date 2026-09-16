# Gabarit des reels : décisions arrêtées

Ce fichier fixe le gabarit visuel et éditorial des reels Instagram de la Vitrine.
**On ne le renégocie pas à chaque publication** : un reel se produit en lançant le
script, pas en retouchant les visuels. Toute modification du gabarit passe par ce
fichier d'abord, puis par le code.

Décisions de Jules Piral, séance du 2026-09-16, sur le reel « La Une des Unes ».
État de chaque point : **ARRÊTÉ** (validé), **À VALIDER** (en place, pas encore
confirmé), **REJETÉ** (essayé puis écarté : ne pas réintroduire).

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

1. **Accroche.** « Ce qui domine l'actualité du Québec en ce moment » en très grand ;
   bandeau noir en bas où montent les barres de saillance de la journée ; édition et
   date. ARRÊTÉ.
2. **Une n°1.** Illustration en haut, étiquette « Une n°1 », enjeu, titre, puis deux
   chiffres : niveau de saillance (« Saillance sur 24 heures ») et
   **« 6/6 des médias québécois en parlent »**. ARRÊTÉ.
3. **Trajectoire (scène vedette).** Kicker « Saillance · 24 dernières heures » ; **titre
   de la Une** avec le pictogramme de son enjeu ; compteur géant qui suit la valeur ;
   étiquette de niveau qui change de couleur à chaque édition ; barres qui montent une
   à une, valeurs dans les barres, « Sommet » marqué, barre rayée pour « Hors des
   Unes » ; pictogramme + heure + moment sous chaque barre ; phrase de tendance du
   site en bas. ARRÊTÉ.
4. **Centile.** « *Cette actualité est plus saillante que* / **92 %** / des nouvelles de
   la dernière année » ; échelle de 100 graduations fines (1 graduation = 1 % des
   nouvelles, plus saillantes en haut) qui se remplit ; trait « *Cette actualité* » ;
   annotations **« 8 % des nouvelles de la dernière année ont été plus saillantes »**
   et **« 92 % ont été moins saillantes »**. ARRÊTÉ.
   - Note de source « Nouvelles : les Unes des médias québécois suivis, sur une année
     de référence » : À VALIDER. Raison : la référence est une période fixe
     (17 mai 2025 → 7 août 2026, bientôt l'année civile 2025), pas une année glissante.
5. **Couverture.** « 6/6 » en grand, « des médias québécois en parlent », liste des six
   médias du panel avec « ✓ En Une » (ou grisé, « Pas en Une ») ; « En Une depuis … ».
   ARRÊTÉ.
6. **Classement (remplace « Course »).** Demande d'Adrien, 2026-09-16 : montrer
   **les cinq nouvelles les plus saillantes de la journée et leur évolution**, plutôt
   que la première Une face à la deuxième. Titre « Les cinq nouvelles les plus
   saillantes » ; légende affichée AVANT le tracé (pastille pictogramme, « N°1 ·
   enjeu » en mono, titre sur deux lignes au plus, échantillon du trait) ; courbes aux
   couleurs des enjeux ; pastille + valeur **dans une gouttière à droite du dernier
   point** ; axe avec pictogrammes des moments. Même enjeu pour deux nouvelles :
   tirets, puis pointillé pour la troisième. ARRÊTÉ.
   - ⚠️ Le rang vient du **classement PUR** de l'indice (`rankTopUnes`, lu par
     `loadHeadlineEvents(cle, { classement: 5 })`), pas de la sélection du module :
     la page n'affiche que les Unes qui valent au moins la moitié du meneur (#430,
     B6) et en montre souvent deux. Montrer cinq nouvelles classées n'est donc pas
     affirmer que le module en afficherait cinq — d'où « nouvelles », jamais
     « Unes », dans le titre de la scène.
7. **Pendant ce temps, au Canada… (module 2).** Demande d'Adrien, 2026-09-16. Le
   radar des Deux solitudes : balayage qui fait deux tours, puis les deux polygones
   qui éclosent depuis le centre (rouge Canada anglais, bleu Québec), pastille
   pictogramme au bout de chaque axe dans la couleur du camp qui le mène ; sous le
   radar, le chiffre de **convergence** et son niveau, puis la phrase éditoriale du
   site. ARRÊTÉ.
   - Le module ne chiffre QUE la convergence : `divPct` existe pour l'axe, il n'a
     aucun libellé public. Ne jamais écrire « X % de divergence ».
   - Deux anneaux (50 %, 100 %), pas quatre : quatre hexagones emboîtés se lisent
     comme un cube en perspective.
8. **Ce que le Québec en a retenu.** Les nouvelles du Canada anglais, les plus
   couvertes là-bas d'abord, chacune avec **deux barres** — part de l'attention des
   Unes canadiennes, part de l'attention des Unes québécoises — et son niveau de
   saillance. L'écart entre les deux barres EST la divergence : montrée, pas
   énoncée. ARRÊTÉ.
9. **Fin.** Fleur de lys, « Ce qui domine l'actualité du Québec »,
   vitrinedemocratique.com, bandeau bleu « Six éditions par jour » avec les six
   pictogrammes et l'édition en cours en surbrillance. ARRÊTÉ.

**Légende Instagram** (`.txt`) : titre de l'édition, titre et résumé de la Une,
« 6/6 des médias québécois en parlent : … », niveau de saillance, autres Unes, lien.
Mots-clics `#polqc #QC2026 #VitrineDémocratique` : À VALIDER.

### Rejeté (ne pas réintroduire)

- Ligne reliant le sommet des barres de la trajectoire.
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

## 3. Points ouverts

- **Phrase de tendance du site** (« L'attention est retombée depuis 16h cet après-midi
  (Sommet ce midi) ») : maladroite, affichée en grand ; à corriger dans le site
  (`lib/data/headlineEvents.ts`), le reel suivra.
- **Zones de l'interface Instagram** (en-tête, légende, boutons) : visibles dans
  l'aperçu (bouton « Zones Instagram »), pas encore imposées au gabarit.
- **Les six autres reels** (Deux solitudes, 12 enjeux, Partis et couverture,
  Polimètre+, Assemblée nationale, global) : reprennent toutes les règles de la
  section 1. ⚠️ Le reel « Deux solitudes » devra tenir compte des scènes 7 et 8
  ci-dessus, qui en montrent déjà le radar et les nouvelles canadiennes.
- **Durée.** Le reel passe de ~46 s à ~75 s avec les scènes 6 à 8. À valider :
  Instagram accepte 90 s, mais la rétention chute. Si on coupe, couper la scène 4
  (centile) avant les nouvelles.
