---
name: redaction-editoriale
description: Règles de rédaction de TOUT texte public de la Vitrine — libellés de modules, phrases éditoriales (générées ou non), infobulles, page Méthodologie, billets, textes d'interface. À charger AVANT d'écrire ou de modifier le moindre texte affiché sur le site, y compris dans une maquette destinée à devenir le site.
---

# Rédaction éditoriale — règles de la Vitrine démocratique

> **ÉTAT : V1 (DRAFT) — rédigée le 2026-07-13** à partir du corpus existant du
> site, du rapport red-team du Module 2 (`docs/red-team-convergence-module2-2026-06-05.md`)
> et du design language. **À valider et amender par Helena (contenu
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

## Français et typographie

- Français québécois soigné ; anglicismes évités (« infolettre », pas
  « newsletter » ; « à la une », pas « en headline »).
- **Typographie française** : espace insécable avant `%`, `:`, `;`, `?`,
  `!` et à l'intérieur des guillemets « … » ; tiret cadratin — avec
  espaces pour les incises ; nombres : espace insécable comme séparateur
  de milliers.
- Heures : `8 h`, `16 h – 20 h` (h minuscule, espaces, tiret demi-cadratin
  pour les plages). Dates : `13 juillet`, sans zéro initial.
- Majuscules : « la Une » (l'objet de presse) prend la majuscule ; les
  noms de modules sont en romain sans guillemets dans le corps.

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

## Checklist avant merge (tout texte public)

- [ ] Espaces insécables posées (`&nbsp;` en HTML/JSX) devant % : ; ? ! et dans « »
- [ ] Lexique canonique respecté (tableau ci-dessus) ; aucun « ROC » public
- [ ] Formulations honnêtes (« sujets », « sur-quantifiée », superlatifs calibrés)
- [ ] Phrases générées : toutes les variantes listées + condition + relecture éditoriale
- [ ] Cohérence avec la page Méthodologie (sinon → règle « Impact méthodologie »)
