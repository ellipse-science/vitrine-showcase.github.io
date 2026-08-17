---
name: redaction-editoriale
description: Règles de rédaction de TOUT texte public ou d'équipe de la Vitrine — libellés de modules, phrases éditoriales (générées ou non), infobulles, étiquettes/titres/légendes de graphiques, page Méthodologie, billets, textes d'interface. Miroir de la page Notion « Guide de rédaction CAPP/CLESSN ». À charger AVANT d'écrire ou de modifier le moindre texte affiché, y compris dans un graphique ou une maquette destinée à devenir le site.
---

# Rédaction éditoriale — règles de la Vitrine démocratique

> **Source de vérité : la page Notion [Guide de rédaction CAPP/CLESSN](https://app.notion.com/p/clessn/Guide-de-r-daction-CAPP-CLESSN-3b17f2f4adeb4f829d23fd281d6c92c8).**
> Ce fichier en est le **miroir opérationnel**, chargé par Claude à chaque
> rédaction : texte de site, phrase générée, infobulle, **étiquette, titre ou
> légende de graphique**. On suit la **section Générale** de Notion pour le canon
> partagé du CAPP et la **section Vitrine** pour les spécificités du projet ; les
> règles propres à notre code (honnêteté red-team, phrases générées) sont ajoutées
> plus bas.
>
> **Gouvernance — processus figé pour toute l'équipe :**
> - Pour changer une règle, on l'édite **dans Notion d'abord**, puis on prévient
>   Claude, qui la répercute ici par une petite PR. **Jamais l'inverse.**
> - Quand Claude charge ce skill pour écrire, il **compare à la page Notion** et
>   **signale toute divergence** à Adrien, arbitre du contenu éditorial.
> - Typographie : **OQLF par défaut**, sauf exception explicitement décidée par
>   l'équipe (voir la PR #246).
> - Dernière synchro Notion → skill : **2026-08-13**.
> - **2026-08-14** — arbitrage d'Adrien (vitrine#477/#484) : règles « deux
>   moitiés », base de « que d'habitude » (année ancrée) et vocabulaire
>   histoires/sujets mises à jour ici, à répercuter dans Notion (section
>   Vitrine) — exception assumée au sens Notion-d'abord, décision prise sur
>   GitHub/chat le jour même.

## Voix et ton

- **Sobre, factuel, éditorial.** On raconte ce que les données montrent,
  jamais plus. Le registre de référence : légende de figure d'un grand
  quotidien, pas manchette de tabloïd.
- **Une idée par phrase.** Les phrases éditoriales affichées font une à
  deux lignes, maximum une trentaine de mots.
- Les questions rhétoriques sont permises avec parcimonie dans les titres
  (« Deux solitudes ? ») ; jamais dans le corps.
- Aucun vocabulaire de conflit pour décrire la divergence (pas de
  « fossé », « guerre », « fracture », « choc ») : les agendas
  « divergent », « se croisent », « convergent », « s'ignorent ».

## Anti-style IA (demande d'Adrien, 2026-07-13)

Le texte doit sonner comme celui de nos autres projets (Datagotchi,
Polimètre, Projet Quorum), pas comme une sortie de modèle. Marqueurs
bannis :

- **Le tiret cadratin (—)**, y compris pour les incises et les chutes de
  phrase. Le remplacer par deux phrases, un deux-points ou des
  parenthèses.
- Les constructions « ce n'est pas X, c'est Y » et « non seulement…
  mais aussi… » en cadence systématique.
- Les triades décoratives (« clair, précis et efficace ») quand une
  seule épithète suffit.
- Les intensificateurs creux : « véritable », « incontournable »,
  « fascinant », « crucial ».
- Les conclusions qui sur-expliquent (« en somme », « au final », « ce
  qui montre bien que »).

## Français et typographie (canon OQLF — section Générale de Notion)

- Français québécois soigné ; anglicismes évités (« infolettre », pas
  « newsletter » ; « à la une », pas « en headline »).
- **Espaces insécables.** En HTML/JSX, l'insécable s'écrit `&nbsp;` :
  - **avant** `:` et avant `%` ;
  - **à l'intérieur** des guillemets français : « exemple » ;
  - comme **séparateur de milliers** (`12 000`) ;
  - **PAS d'espace avant `;`, `?`, `!`** — norme québécoise, à l'inverse
    de la France. Les trois signes sont désormais dans l'entrée Notion
    « Espaces insécables » (ajout du `;` validé par Adrien le 2026-08-13 ;
    il ne venait que de la PR #246 jusque-là). Vérifié par la règle
    `espace-avant-ponctuation` de `scripts/garde_redaction.mjs`.
  - **PAS d'espace dans l'heure** : `16h`, `14h30` — **jamais** `16 h` ni
    `14 h 30`. L'entrée Notion « Espaces insécables » est explicite : *« L'OQLF
    dit d'en mettre, mais on ne le fait pas. »* C'est donc un écart ASSUMÉ à
    l'OQLF, pas un oubli — ne pas le « corriger » vers la norme.
- **Exceptions assumées** (PR #246) : le séparateur du `<title>` et la
  numérotation CSS de la table des matières gardent leur format.
- Heures : `8h`, `16h – 20h`, `14h30` (h minuscule, collé au chiffre, tiret
  demi-cadratin pour les plages). Dates : `13 juillet`, sans zéro initial.
- **Langage inclusif** (section Générale) : formulation neutre **courte** quand
  elle n'alourdit pas (« la population québécoise ») ; sinon `Québécois.es`,
  `Canadien.ne.s` ; tout le reste au masculin pluriel. Éviter les doublets
  longs (« Québécoises et Québécois »).
- **Italique** : termes techniques et termes anglais en italique (mais
  prioriser le français) ; **jamais** d'italique pour nos projets (Vitrine
  démocratique, Radar+…) ni les noms d'entreprises (GitHub, Slack…).
- Majuscules : « la Une » (l'objet de presse) prend la majuscule ; les noms de
  modules sont en romain sans guillemets dans le corps.
- Ton médiatique (module partis) : dire « ton favorable / défavorable », jamais
  « positif / négatif ».

## Lexique — général (source : section Générale de Notion)

Pour le canon partagé du CAPP, la **section Générale de Notion fait foi** (à
consulter, à ne pas dupliquer ici) : noms des projets, noms officiels des partis
(QC + Canada) et des partisans, sigles, vocabulaire de données. Rappels les plus
utiles côté Vitrine :

- **Projets CLESSN**, nommables et **jamais en italique** : Vitrine démocratique,
  Radar+, Agora+, Civimètre+, Projet Quorum, Datagotchi, Polimètre…
- **Trois piliers ↔ outils** : Médias = **Radar+** · Décideurs = **Agora+** ·
  Citoyens = **Civimètre+**. Côté Vitrine : *Radar+* se nomme (c'est le système
  qui capte les Unes, cf. métho) ; le module Assemblée se décrit
  **fonctionnellement** (« l'Assemblée nationale », « les débats », « les
  décideurs »). On ne sort pas le nom interne *Agora+*, et on dit « décideurs »,
  pas « décideurs publics ».
- **Partis (Québec)**, casse comprise : Coalition avenir Québec (CAQ), Parti
  libéral du Québec (PLQ), Québec solidaire (QS), Parti québécois (PQ), Parti
  vert du Québec (PVQ), Parti conservateur du Québec (PCQ). Jamais de surnom de
  campagne (« l'équipe François Legault »).
- **Sigles** : « Vitrine démocratique » (EN : *The Vitrine Démocratique*) ;
  CLESSN (majuscule à « la Chaire ») ; CAPP (majuscule au « Centre »).

## Les 12 catégories d'enjeux (entrée Notion « Catégories d'enjeux »)

Libellés **canoniques**, à reprendre au caractère près. Ils sont **partagés avec
le Digital Society Lab et l'Institut Donald J. Savoie** (Hamilton et Moncton,
Polimètres) : les changer unilatéralement casserait la comparabilité.

| Français | Anglais |
|---|---|
| Affaires internationales et défense | International Affairs and Defence |
| Culture et nationalisme | Culture and Nationalism |
| Droits, libertés, minorités et discrimination | Rights, Liberties, Minorities and Discrimination |
| Économie et travail | Economy and Labour |
| Éducation | Education |
| Environnement et énergie | Environment and Energy |
| Gouvernements et gouvernance | Governments and Governance |
| Immigration | Immigration |
| Loi et crime | Law and Crime |
| Santé et politiques sociales | Health and Social Policy |
| Technologie | Technology |
| Terres publiques et agriculture | Public Lands and Agriculture |

## Les projets ne prennent JAMAIS l'italique

Entrée Notion « Les projets de la CLESSN » : La Vitrine démocratique, Projet
Quorum, Datagotchi, Déméter, Radar+, Civimètre+, Agora+, Polimètre, Global-ES.
L'italique est réservé aux termes techniques et aux termes anglais ; les noms
d'entreprises (GitHub, Slack…) n'en prennent pas non plus.

⚠️ **Conflit connu avec l'entrée « Citations et bibliographie »**, qui impose le
style APA — lequel met le titre de l'œuvre en italique. Une référence
bibliographique correcte contredit donc la règle. Résolu au cas par cas avec une
dérogation `garde-redaction: ok (citation APA)` ; si le cas se répand, c'est le
guide qu'il faut trancher, pas le code. Vérifié par la règle `projet-italique`.

## Lexique — spécifique à la Vitrine

> ⚠️ Ce vocabulaire n'est pas encore dans la **section Vitrine** de Notion : à y
> remonter quand l'équipe le voudra (voir Gouvernance). En attendant, il fait foi
> ici.

| Terme | Usage | Ne JAMAIS dire |
|---|---|---|
| **bloc** (de quatre heures) | l'unité temporelle du pipeline | tranche, fenêtre, période (sauf générique) |
| **Une / les Unes** | ce qui est en tête des sites des médias | headline, manchette |
| **La Une des Unes** | le nom du Module 1 (« Une » avec un U majuscule) | « Unes des Unes » |
| **saillance / saillant** | l'importance mesurée d'un sujet | popularité, buzz, viralité |
| **événement** | un groupe d'articles sur une même histoire (clustering) | nouvelle, story |
| **sujet** | ce que mesure l'indice de convergence (personnes, lieux, organisations saillants) | thème (réservé aux enjeux CAP) |
| **enjeu** | une des 12 catégories CAP | sujet, thème (hors CAP) |
| **agenda médiatique** | ce qu'un espace médiatique met de l'avant | couverture (acceptable), narratif |
| **médias québécois / médias canadiens** | les deux panels comparés | **« ROC » est un terme INTERNE, jamais public** |

- Côté public, « Canada » signifie **Canada hors Québec, sans les États-Unis**
  (cf. bug #143) : si l'ambiguïté gêne, écrire « médias canadiens hors Québec »
  une fois, puis « au Canada ».

## Honnêteté méthodologique (issue du red-team — non négociable)

- Deux vocabulaires de convergence, à ne pas croiser : l'indice de
  convergence **par objets** mesure les « mêmes sujets saillants » ; la
  jauge du module Deux solitudes travaille **par histoires regroupées**,
  et « les mêmes histoires » y est le mot juste (métho § 04). La vieille
  interdiction absolue de « mêmes histoires » datait de la jauge par
  objets (précision du 2026-08-14, vitrine#477).
- **Les deux moitiés** (arbitrage d'Adrien, 2026-08-14, vitrine#477/#484) :
  au niveau des histoires, environ la moitié de l'attention va aux mêmes
  histoires, l'autre moitié reste d'un seul côté. Ne plus écrire « la
  divergence est la règle » ni « réelle et majoritaire » pour la jauge par
  histoires — la mesure d'année (médiane 52 %) ne le soutient plus. Pour
  les limites du clustering par objets, dire « sur-quantifiée par le
  clustering », jamais « artefact ».
- **Aucun chiffre inventé, arrondi trompeur ou superlatif non calibré** :
  « exceptionnel » et « rare » sont réservés aux vrais extrêmes de
  distribution (≥ p95 / ≤ p5 sur la fenêtre de calibration) ; « habituel »
  = autour de la médiane. Le mot suit le percentile, pas l'effet
  dramatique recherché.
- Toute comparaison relative précise sa base : « …que d'habitude » = la
  médiane d'une **année de référence complète, ancrée** (vitrine#477/#484,
  décision A0 — plus jamais une fenêtre glissante) ; « parmi les Unes de
  sa région » = distribution régionale.
- Corollaire FAIT vs VISION : un texte public ne décrit jamais une
  mécanique non déployée.

## Textes générés par règles (phrases éditoriales des modules)

- Chaque gabarit de phrase est **fini et relu** (pas de génération LLM en
  production) : lister toutes les variantes possibles dans le code, avec
  la condition de déclenchement en commentaire.
- Une variante = une seule affirmation vérifiable depuis les données du
  bloc (ex. « Aucun sujet ne figure à la fois parmi les Unes québécoises
  et canadiennes de ce bloc »).
- Les gabarits nouveaux ou modifiés sont **relus avant merge** (arbitre du
  contenu éditorial : Adrien).

## Checklist avant merge (tout texte public, y compris les graphiques)

- [ ] Insécables : `&nbsp;` avant `:` et `%`, dans « » ; **aucun espace avant
      `;` `?` `!`** ; **heures collées** (`16h`, `14h30`)
- [ ] Projets jamais en italique ; italique réservé aux termes techniques/anglais
- [ ] Langage inclusif (formulation neutre courte, sinon `.es`)
- [ ] Lexique respecté ; aucun « ROC » public ; « Une des Unes » (pas « Unes »)
- [ ] Formulations honnêtes (« sujets », « sur-quantifiée », superlatifs calibrés)
- [ ] Phrases générées : toutes les variantes listées + condition + relecture
- [ ] Cohérence avec la page Méthodologie (sinon → règle « Impact méthodologie »)
- [ ] Divergence repérée avec la page Notion → signalée à Adrien
