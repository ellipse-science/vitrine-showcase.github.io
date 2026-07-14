---
name: redaction-methodologie
description: >
  Rédiger ou réviser la page Méthodologie PUBLIQUE
  (public/methodologie/index.html) au bon registre : pour le grand public,
  transparente et scientifique, mais SANS jargon interne (noms de raffineurs,
  de tables, de colonnes) ni détails qui exposeraient la propriété
  intellectuelle ou les droits des médias. À utiliser dès qu'on écrit,
  simplifie ou révise une section de la métho, ou qu'un passage est jugé « trop
  technique », « trop interne » ou « pas pour le public ». Complète
  synchro-methodologie (qui dit QUOI/QUAND mettre à jour ; celui-ci dit COMMENT
  l'écrire). Déclencheurs : « rédige la métho », « simplifie la métho », « c'est
  trop technique », « vulgarise cette section », « la métho parle aux devs ».
---

# Rédaction de la page Méthodologie (registre public)

La page Méthodologie est le **contrat public** du projet. Elle est lue par le
grand public sur le site Web. **Ce n'est PAS la documentation d'équipe.** Elle
doit être **transparente, complète et scientifique**, mais écrite pour des gens
qui ne connaissent ni le code ni l'infrastructure.

## Le principe central : deux registres à ne jamais confondre

| Doc d'ÉQUIPE (interne) | Page MÉTHO (publique) |
|---|---|
| Noms de raffineurs (`radar-event-salience`), de tables (`headline_events_4h`), de colonnes (`score_qc`, `storyline_id`, `media_ids_24h`) | Ce que le système **fait**, en français clair |
| Détails d'implémentation, chemins, workflows, blocs techniques | Le **principe** et la **logique**, pas la plomberie |
| Vise la reproduction du code | Vise la **compréhension** et la **confiance** du lecteur |

Règle d'or : **si une phrase ne parle qu'aux développeurs, elle n'a pas sa place
dans la métho.** On décrit le comportement, jamais le composant.

## Ce qu'on MONTRE (transparence + reproductibilité scientifique)

- Les **sources** : quels médias, quelle période, quelle fréquence de collecte.
- Les **concepts et définitions** (saillance, divergence, dimensions, niveaux).
- La **logique** des calculs et des seuils, en mots — assez pour qu'un chercheur
  comprenne et puisse discuter la démarche.
- Les **limites** connues et les choix assumés.

## Ce qu'on NE montre PAS

- Les **noms internes** : raffineurs, tables, colonnes, workflows, chemins.
- Le **détail exact** qui permettrait de **copier** la recette (protection de la
  propriété intellectuelle). On explique la démarche, pas la formule ligne à ligne.
- Le **texte intégral** des articles de médias : **toujours renvoyer au site du
  média** pour la lecture (respect des droits et des données des médias).

## Registre d'écriture

- Français clair, phrases simples, ton scientifique mais accessible.
- Nommer les choses par leur **sens**, pas par leur nom de code.
- Objectif double : un lecteur non technique comprend tout ; un chercheur trouve
  l'information méthodologique dont il a besoin pour évaluer la démarche.

## Exemples (avant → après)

- ❌ « Le raffineur `radar-event-salience` produit la table `headline_events_4h`
  avec `score_saillance` et `score_qc`. »
  ✅ « Le système regroupe les articles qui traitent du même événement et lui
  attribue un score de saillance — son importance médiatique — calculé
  globalement et spécifiquement pour le Québec. »

- ❌ « Suit chaque histoire par `storyline_id` d'un bloc de 4 h à l'autre et
  agrège `media_ids_24h`. »
  ✅ « Le système suit chaque nouvelle au fil de la journée et rassemble, sur
  24 heures, l'ensemble des médias qui l'ont mise en Une. »

## Procédure

1. Repérer la ou les sections concernées (mapping section ↔ comportement réel :
   voir **synchro-methodologie**).
2. Vérifier que le contenu est **vrai et actuel** (le comportement réel du
   système, pas une intention — cf. FAIT vs VISION).
3. Réécrire au **registre public** : retirer tout nom interne, garder le sens.
4. Vérifier qu'aucun détail ne compromet la **PI** ni les **droits des médias**
   (et qu'on renvoie bien au site du média pour les textes).
5. Vérifier le rendu en preview (HTML statique).

## Rappels

- La métho est du **HTML statique** (`public/methodologie/index.html`) — éditer
  directement, vérifier en preview (le reporter React n'y tourne pas).
- **Deux skills complémentaires** : `synchro-methodologie` (quoi/quand mettre à
  jour, véracité vs le code) et **celui-ci** (comment l'écrire pour le public).
  Les employer ensemble : synchro garantit que c'est **vrai**, rédaction
  garantit que c'est **lisible et approprié**.
- Ne **jamais** introduire un nom de raffineur, de table ou de colonne dans la
  métho.
