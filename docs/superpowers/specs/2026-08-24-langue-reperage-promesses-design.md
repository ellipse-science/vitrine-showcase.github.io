# Design : langue du repérage de promesses (Polimètre+ mode « campagne »)

**Date :** 2026-08-24
**Statut :** DÉCIDÉ — français seulement. Aucune implémentation requise (la
décision consacre le comportement actuel et ferme la question).
**Portée :** raffineur `polimetre-promesses-neuves` (aws-refiners), et tout
classifieur de repérage de promesses qui viendra le remplacer.

## Question

Faut-il repérer les promesses sur des textes anglophones autant que
francophones — donc ré-entraîner le repérage et choisir une proportion de
textes anglais — ou rester au français seulement ?

L'argument pour l'anglais est la cohérence : d'autres modules de la Vitrine
lisent la *Montreal Gazette*, et un corpus bilingue serait plus complet.

## Décision

**Français seulement**, pour le repérage comme pour l'appariement médiatique.
La limite est documentée dans la méthodologie. L'extension à l'anglais reste
ouverte, mais devient un chantier à part entière (voir « Ce qu'il faudrait
pour ouvrir l'anglais »).

## Pourquoi — le fait qui tranche

Le garde-fou d'attribution du raffineur
(`refiners/polimetre-promesses-neuves/runtime.R`, `attribution_valide`) suit
une règle volontairement conservatrice :

- aucun parti nommé dans le texte → **on garde** ;
- le parti de la promesse est nommé → on garde ;
- seuls des rivaux sont nommés → on rejette.

Il repose entièrement sur `PARTI_MENTIONS`, un jeu de regex **françaises et
sans accents**. Confrontées aux formes anglaises courantes :

| Forme anglaise | Motif visé | Reconnu |
|---|---|---|
| « Coalition Avenir Québec » | `coalition avenir` | oui |
| « Parti Québécois » | `parti quebecois` | oui |
| « Québec Solidaire » | `quebec solidaire` | oui |
| « the **Liberals** » | `liberaux` | **non** |
| « **Conservative Party** of Quebec » | `parti conservateur du quebec` | **non** |

Les patronymes de chefs (`legault`, `frechette`, `st-pierre plamondon`,
`pspp`, `ghazal`, `duhaime`) rattrapent une part des cas, la presse anglophone
les employant tels quels.

Le trou est donc **asymétrique** : le PLQ et le PCQ perdent leur poignée de nom
de parti en anglais, les trois autres la conservent.

Combiné à la règle « aucun parti nommé → on garde », l'effet n'est pas que les
textes anglais seraient écartés. Il est **pire** : ils tomberaient dans la
branche permissive. Le garde-fou ne rejetterait rien — il **cesserait
silencieusement de garder**, pour deux partis sur cinq, sans qu'aucune erreur
ne remonte.

Sur un module dont l'objet est de mesurer la couverture partisane, c'est
exactement la classe d'erreur que ce garde-fou a été écrit pour empêcher : le
2026-08-20, une promesse de Québec solidaire avait été appariée à onze articles
portant tous sur le Parti québécois. Le commentaire du code le dit — « attribuer
à un parti la couverture d'un rival est l'erreur à ne pas commettre ».

Ouvrir l'anglais sans refaire `PARTI_MENTIONS` d'abord, ce n'est pas élargir la
couverture : c'est désarmer la vérification, de façon inégale entre les partis.

## Pourquoi le gain attendu est faible

Le repérage lit `a-qc-press-releases` — les **communiqués des cinq partis
suivis**. Ces communiqués sont émis en français. L'anglais entre dans le
pipeline du côté de la **reprise médiatique**, pas de la formulation des
promesses. Le corpus à ré-étiqueter ne serait donc pas bilingue de façon
symétrique : la promesse resterait française, seul l'appariement gagnerait des
articles.

## Ce qui est perdu, et assumé

Les reprises de promesses parues **uniquement** dans la presse anglophone ne
sont pas comptées dans la saillance. La saillance du mode « campagne » se lit
donc comme une saillance **dans la couverture francophone**, et la méthodologie
doit le dire en ces termes — pas comme une mesure de couverture totale.

C'est cohérent avec la limite déjà assumée du garde-fou lexical
(`preuve_lexicale`) : « un appariement absurde publié coûte plus cher à la
crédibilité du module qu'une reprise manquée ».

## Ce qu'il faudrait pour ouvrir l'anglais (VISION — non planifié)

Dans cet ordre, aucune étape n'étant sautable :

1. Refaire `PARTI_MENTIONS` en bilingue, avec les formes anglaises réelles des
   cinq partis et de leurs chefs. Prérequis absolu : sans ça, l'ouverture
   dégrade le garde-fou au lieu d'élargir la mesure.
2. Vérifier que le préfiltre lexical et `preuve_lexicale` (2 mots de contenu
   communs) tiennent entre une promesse **française** et un paragraphe
   **anglais** — ils ne tiennent probablement pas : les mots de contenu ne se
   recoupent pas d'une langue à l'autre. C'est un second chantier, distinct du
   premier, et vraisemblablement le vrai coût.
3. Seulement ensuite : choisir la proportion de textes anglophones du corpus
   d'entraînement et d'évaluation du classifieur.

Le point 2 est la raison de fond pour ne pas traiter l'anglais comme un
paramètre du classifieur : l'appariement promesse↔article est **lexical et
monolingue par construction**. Le rendre bilingue demande un appariement
translingue, pas un corpus plus grand.

## Rejeté

- **Corpus bilingue au niveau du classifieur seul.** Ne règle ni le garde-fou
  d'attribution (point 1) ni l'appariement lexical (point 2) : on obtiendrait
  un repérage qui reconnaît des promesses dans des textes que la suite du
  pipeline ne sait pas rattacher correctement.
- **Traduire les promesses françaises vers l'anglais avant appariement.**
  Introduit une couche de traduction automatique entre la mesure et sa preuve :
  le verbatim publié ne serait plus celui du communiqué.

## Effet sur les autres chantiers

- **Classifieur de repérage de promesses** : à entraîner et à évaluer sur du
  français seulement. La proportion de textes anglophones n'est plus une
  question ouverte.
- **Validation F1** (classifieur et LLM génératif) : jeu d'évaluation
  francophone, à geler **avant** l'entraînement.
- **Méthodologie** : la section du Polimètre+ doit qualifier la saillance du
  mode « campagne » comme mesurée sur la couverture francophone.
