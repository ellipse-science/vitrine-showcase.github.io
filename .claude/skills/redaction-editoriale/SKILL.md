---
name: redaction-editoriale
description: Règles de rédaction de TOUT texte public de la Vitrine — libellés de modules, phrases éditoriales (générées ou non), infobulles, page Méthodologie, billets, textes d'interface. À charger AVANT d'écrire ou de modifier le moindre texte affiché sur le site, y compris dans une maquette destinée à devenir le site.
---

# Rédaction éditoriale — règles de la Vitrine démocratique

> **ÉTAT : V1 (DRAFT) — rédigée le 2026-07-13** à partir du corpus existant du
> site, du rapport red-team du Module 2 (`docs/red-team-convergence-module2-2026-06-05.md`),
> du design language **et du Guide de rédaction CAPP/CLESSN** (Notion,
> 2020-2024 — voir la section Héritage pour le tri repris/adapté/à réviser). **À valider et amender par Helena (contenu
> éditorial) et Adrien avant de retirer ce bandeau.** Ce fichier est la
> copie canonique unique des règles de rédaction (corollaire de la règle
> métho : une seule source, jamais de copies).

## Voix et ton

- **Sobre, factuel, éditorial.** On raconte ce que les données montrent,
  jamais plus. Le registre de référence : légende de figure d'un grand
  quotidien, pas manchette de tabloïd.
- **Une idée par phrase.** Les phrases éditoriales affichées font une à
  deux lignes, maximum une trentaine de mots.
- Les questions rhétoriques sont permises avec parcimonie dans les titres
  (« Deux solitudes ? ») — jamais dans le corps.
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

## Français et typographie

- Français québécois soigné ; anglicismes évités (« infolettre », pas
  « newsletter » ; « à la une », pas « en headline »).
- **Typographie française** : espace insécable avant `%`, `:`, `;`, `?`,
  `!` et à l'intérieur des guillemets « … » ; nombres : espace insécable
  comme séparateur de milliers.
- Heures : `8 h`, `16 h – 20 h` (h minuscule, espaces, tiret demi-cadratin
  pour les plages). Dates : `13 juillet`, sans zéro initial.
- Majuscules : « la Une » (l'objet de presse) prend la majuscule ; les
  noms de modules sont en romain sans guillemets dans le corps.
- **Italique** (règle CAPP/CLESSN) : termes techniques et termes anglais
  en italique (mais prioriser le français) ; JAMAIS d'italique pour les
  noms de nos projets (Vitrine démocratique, Radar+) ni les noms
  d'entreprises (GitHub, Slack…).

## Lexique canonique (toujours ces mots, jamais leurs voisins)

| Terme | Usage | Ne JAMAIS dire |
|---|---|---|
| **bloc** (de quatre heures) | l'unité temporelle du pipeline | tranche, fenêtre, période (sauf générique) |
| **Une / les Unes** | ce qui est en tête des sites des médias | headline, manchette |
| **saillance / saillant** | l'importance mesurée d'un sujet | popularité, buzz, viralité |
| **événement** | un groupe d'articles sur une même histoire (clustering) | nouvelle, story |
| **sujet** | ce que mesure l'indice de convergence (personnes, lieux, organisations saillants) | thème (réservé aux enjeux CAP) |
| **enjeu** | une des 12 catégories CAP | sujet, thème (hors CAP) |
| **agenda médiatique** | ce qu'un espace médiatique met de l'avant | couverture (acceptable), narratif |
| **médias québécois / médias canadiens** | les deux panels comparés | **« ROC » est un terme INTERNE — jamais public** |

- Côté public, « Canada » signifie **Canada hors Québec, sans les
  États-Unis** (cf. bug #143) — si l'ambiguïté gêne, écrire « médias
  canadiens hors Québec » une fois, puis « au Canada ».

- **Noms officiels des partis (Québec)**, casse comprise (source :
  Élections Québec ; règle CAPP/CLESSN) : Coalition avenir Québec (CAQ),
  Parti libéral du Québec (PLQ), Québec solidaire (QS), Parti québécois
  (PQ), Parti vert du Québec (PVQ), Parti conservateur du Québec (PCQ).
  Jamais de surnom de campagne (« l'équipe François Legault »).
- **Noms institutionnels** : « Vitrine démocratique » (EN : *The Vitrine
  Démocratique*) ; CLESSN = Chaire de leadership en enseignement des
  sciences sociales numériques (majuscule à « la Chaire ») ; CAPP =
  Centre d'analyse des politiques publiques (majuscule au « Centre »).

## Honnêteté méthodologique (issu du red-team — non négociable)

- L'indice de convergence mesure les **mêmes sujets saillants**, jamais
  « les mêmes nouvelles » ni « les mêmes histoires ».
- La divergence est « réelle et majoritaire » ; si on parle de ses limites,
  dire « sur-quantifiée par le clustering », jamais « artefact ».
- **Aucun chiffre inventé, arrondi trompeur ou superlatif non calibré** :
  « exceptionnel » et « rare » sont réservés aux vrais extrêmes de
  distribution (≥ p95 / ≤ p5 sur la fenêtre de calibration) ; « habituel »
  = autour de la médiane. Le mot suit le percentile, pas l'effet
  dramatique recherché.
- Toute comparaison relative précise sa base : « …que d'habitude » =
  fenêtre glissante de six mois ; « parmi les Unes de sa région » =
  distribution régionale.
- Corollaire FAIT vs VISION : un texte public ne décrit jamais une
  mécanique non déployée.

## Textes générés par règles (phrases éditoriales des modules)

- Chaque gabarit de phrase est **fini et relu** (pas de génération LLM en
  production) : lister toutes les variantes possibles dans le code, avec
  la condition de déclenchement en commentaire.
- Une variante = une seule affirmation vérifiable depuis les données du
  bloc (ex. « Aucun sujet ne figure à la fois parmi les Unes québécoises
  et canadiennes de ce bloc »).
- Les gabarits nouveaux ou modifiés passent par une review de la
  propriétaire du contenu éditorial (Helena) avant merge.

## Héritage du Guide de rédaction CAPP/CLESSN (Notion, 2020-2024)

Source : [Guide de rédaction CAPP/CLESSN](https://app.notion.com/p/clessn/Guide-de-r-daction-CAPP-CLESSN-3b17f2f4adeb4f829d23fd281d6c92c8)
(fiches datées 2022-2023, page verrouillée). Tri fait le 2026-07-13 :

- **Repris tel quel** : nom du projet, italique, noms des partis, sigles
  CLESSN/CAPP (intégrés ci-dessus).
- **Adapté** : « Bourse de l'humeur : dire optimisme/pessimisme, jamais
  positif/négatif » — le module a disparu, mais l'esprit reste : pour le
  ton médiatique (module partis), dire « ton favorable/défavorable »,
  pas « positif/négatif ».
- **⚠️ À RÉVISER par Helena/Adrien** (fiches 2022 qui contredisent
  l'usage 2026) : « ne jamais utiliser Radar+ (dire : les médias) » —
  contredit radarplus.org et la communication actuelle ; « Civimètre+ →
  citoyens », « Agora+ → décideurs (jamais “décideurs publics”) » —
  toujours pertinents pour le module Assemblée ? Trancher, puis mettre à
  jour le Notion OU ce fichier (une seule source doit rester canonique).

## Checklist avant merge (tout texte public)

- [ ] Espaces insécables posées (`&nbsp;` en HTML/JSX) devant % : ; ? ! et dans « »
- [ ] Lexique canonique respecté (tableau ci-dessus) ; aucun « ROC » public
- [ ] Formulations honnêtes (« sujets », « sur-quantifiée », superlatifs calibrés)
- [ ] Phrases générées : toutes les variantes listées + condition + relecture éditoriale
- [ ] Cohérence avec la page Méthodologie (sinon → règle « Impact méthodologie »)
