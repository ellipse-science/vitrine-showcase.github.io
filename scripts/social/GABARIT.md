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
- **ARRÊTÉ · Tout est lisible sur un téléphone.** Toute information (texte, chiffre,
  graphique) tient dans la ZONE SÛRE `SAFE`, selon la convention des **Reels organiques** :
  220 px en haut (nom du compte), 400 px en bas (légende, musique), 60 px à gauche,
  120 px à droite **à partir de y 640** (colonne de boutons, qui commence au tiers de
  l'écran ; au-dessus, 60 px suffisent). Seul le décor marqué `data-deco`
  (illustration, bandeaux) en sort. La zone des **publicités** Meta (14 % haut, jusqu'à
  35 % bas, 6 % côtés) n'est PAS retenue : trop d'espace perdu, et nos reels ne sont pas
  sponsorisés. Sources consultées le 2026-09-16 : guides Kreatli, Pod2Reels, Outfy
  (organique), Billo et Behaviour Digital (publicités). La vignette de la grille du
  profil est recadrée en 3:4 (bande y 240 → 1680) : l'accroche y tient.
- **ARRÊTÉ · Taille minimale du texte : 26 px** (`MIN_FONT`), soit ~9,5 points sur un
  téléphone, où le reel s'affiche à ~36 %.
- **ARRÊTÉ · Vérification automatique.** `checkFrame` contrôle les trois règles (cadre,
  zone sûre, taille) sur chaque scène ; `--mp4` refuse de produire la vidéo au moindre
  écart. L'aperçu montre les mêmes zones (bouton « Zones Instagram »).
- **ARRÊTÉ · Remplir l'espace de la zone sûre.** Pas de grands vides dans la partie visible ;
  mais pas de compactage non plus (la couverture resserrée a été rejetée).
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
  l'image. L'illustration n'apparaît que si elle correspond à la Une n°1 ET que le site
  l'affiche (juste après une nouvelle édition, l'image peut encore être l'ancienne).
- **ARRÊTÉ · Listes plutôt que tuiles.** Pour énumérer (médias…), une liste
  typographique ; pas de blocs noirs.

## 2. La Une des Unes (`une-des-unes.ts`)

Titre : **« Les faits saillants au Québec »** (accroche, fin et légende ; arrêté le
2026-09-16, remplace « Ce qui domine l'actualité du Québec en ce moment »).
Ordre des scènes :

1. **Accroche.** « Les faits saillants au Québec » en très grand (« Québec » en bleu) ;
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
4. **Centile.** « **Cette actualité est plus saillante que** / **92 %** / **des nouvelles de
   la dernière année** » : la phrase a le même poids que le chiffre (Playfair gras 52 px,
   une ligne chacune ; la version en petit italique gris a été rejetée, on voyait le
   92 % sans savoir de quoi il parlait) ; échelle HORIZONTALE de 100 graduations fines (1 graduation =
   1 % des nouvelles ; moins saillantes à gauche, plus saillantes à droite) qui se
   remplit ; trait « *Cette actualité* » ; annotations de part et d'autre :
   **« 92 % des nouvelles de la dernière année ont été moins saillantes »** (gauche) et
   **« 8 % des nouvelles de la dernière année ont été plus saillantes »** (droite).
   ARRÊTÉ. L'échelle verticale a été couchée pour tenir dans la zone sûre.
   - Note de source « Nouvelles : les Unes des médias québécois suivis, sur une année
     de référence » : À VALIDER. Raison : la référence est une période fixe
     (17 mai 2025 → 7 août 2026, bientôt l'année civile 2025), pas une année glissante.
5. **Couverture.** « 6/6 » en très grand (270 px), lignes aérées (128 px), « des médias québécois en parlent », liste des six
   médias du panel avec « ✓ En Une » (ou grisé, « Pas en Une ») ; « En Une depuis … ».
   ARRÊTÉ.
6. **Course.** Titre explicite (« La première Une face à la deuxième ») ; légende
   affichée AVANT le tracé (pastille pictogramme, « Une n°1 · enjeu », titre) ; courbes
   aux couleurs des enjeux ; pastille pictogramme + valeur dans une colonne à droite du tracé, face au bout de chaque
   courbe et écartées même quand les valeurs sont proches (empilées sur les courbes à 20h
   le 2026-09-16 : rejeté) ;
   axe avec pictogrammes des moments. Même enjeu pour deux Unes : seconde courbe en
   pointillé. ARRÊTÉ.
7. **Fin.** Fleur de lys, « Les faits saillants au Québec »,
   vitrinedemocratique.com, bandeau bleu « Six éditions par jour » avec les six
   pictogrammes et l'édition en cours en surbrillance. ARRÊTÉ.

**Légende Instagram** (`.txt`) : un **récit suivi**, puis le lien, puis les mots-clics.
ARRÊTÉ (format). Quatre paragraphes :

1. « {Jour date}, édition de {heure}. L'histoire qui domine l'actualité au Québec :
   « {titre} ». » suivi du résumé du site.
2. Apparition à la Une ; couverture sur 24 heures (« les 6 médias québécois que nous
   suivons en ont tous fait leur Une (…) », ou « {n} des 6 … », ou « {média} est le seul
   … ») ; niveau et rang (« Sa saillance sur 24 heures est {niveau} : elle est plus
   saillante que {c} % des nouvelles de la dernière année ») ; état de l'attention selon
   la situation du site (nouvelle, sommet, remonte, baisse, retour, retombée, stable).
   Quand l'histoire a quitté les Unes de l'édition : « Elle ne fait plus la Une à {heure},
   mais reste l'histoire la plus saillante des 24 dernières heures, avec un sommet atteint
   {moment} » — jamais une phrase qui contredit « domine l'actualité ».
3. Les autres Unes, titres entre guillemets (guillemets intérieurs en “ ”).
4. « Les faits saillants au Québec, six fois par jour : vitrinedemocratique.com », puis
   les mots-clics.

Les gabarits de phrases sont listés dans `une-des-unes.ts` (fonctions `*Sentence`) :
À VALIDER par Adrien (AGENTS.md, règle 7). Mots-clics `#polqc #QC2026
#VitrineDémocratique` : À VALIDER.

### Rejeté (ne pas réintroduire)

- Ligne reliant le sommet des barres de la trajectoire.
- Tuiles noires pour les médias.
- Grille de 10×10 cases pour le centile (peu parlante).
- Couleurs de courbes par rang sans légende ni pictogramme (incompréhensibles).
- « 92 % plus saillante que toutes les Unes de l'année » (faux : c'est un rang).
- « Illustration générée par IA · Anorak Studio » ; crédit en petites capitales mono
  posé sur l'image (trop visible).
- Éléments pleine page qui débordent de l'encadré.
- Informations dans les zones cachées par Instagram ; étiquettes sous 26 px.
- Légende en fiche à puces (« 6/6 des médias… », « Aussi à la Une : · … ») : on veut un récit.
- Zone sûre des publicités Meta (250 px haut, 480 px bas) : trop d'espace perdu.
- Liste des médias resserrée (lignes de 106 px) : trop compacte.

## 3. Points ouverts

- **Phrase de tendance du site** (« L'attention est retombée depuis 16h cet après-midi
  (Sommet ce midi) ») : maladroite, affichée en grand ; à corriger dans le site
  (`lib/data/headlineEvents.ts`), le reel suivra.
- **Les six autres reels** (Deux solitudes, 12 enjeux, Partis et couverture,
  Polimètre+, Assemblée nationale, global) : reprennent toutes les règles de la
  section 1.
