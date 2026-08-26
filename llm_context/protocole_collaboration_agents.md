# Protocole de Collaboration "Vibe Coding" (Agents & Humains)

Ce document définit les règles de synchronisation stricte pour le développement en parallèle de la maquette par **Etienne**, **Laurence** et leurs agents respectifs.

## 1. Cycle de Synchronisation Pré-Modification (Pull & Review)
Avant toute modification de code ou de documentation, l'agent doit :
1.  **Récupérer les changements :** Faire un `git fetch` et `git pull origin main`.
2.  **Analyser le travail de Laurence :** Examiner les derniers commits (`git log`) et les nouveaux composants créés.
3.  **Vérifier les PRs :** Lister les Pull Requests GitHub (`gh pr list`). Si une PR est assignée, l'analyser et la fusionner si elle ne crée pas de conflits.

## 2. Développement et Standardisation
1.  **Respecter les styles :** Utiliser exclusivement les variables CSS définies dans `design_language.md` et le système 8pt de Laurence.
2.  **Modularité :** Ne pas modifier les fichiers en cours d'édition par l'autre binôme (si possible) et privilégier la création de nouveaux composants ou fichiers de contexte.

## 3. Cycle de Publication Post-Modification (Commit & PR)
Après chaque modification (atomique si possible) :
1.  **Commit clair :** Faire un commit avec un message descriptif.
2.  **Pull Request (PR) :** Créer une branche pour la tâche et ouvrir une PR sur GitHub.
3.  **Assignation :** Assigner systématiquement **Laurence** (ou Etienne selon le cas) à la PR.
4.  **Explication contextuelle :** Fournir une explication détaillée des changements, des fichiers touchés et de l'impact visuel pour que l'autre agent puisse s'ajuster immédiatement.

## 4. Communication Inter-Agents
Les agents doivent être proactifs dans la détection des changements de structure (ex: renommage de classes CSS, modification du hook de données `useVitrineSnapshot`) et mettre à jour leurs propres tâches en conséquence.

## 5. Validation des Skills par Evals (NordAI)
Avant d'ajouter ou de modifier un skill sous `.claude/skills/`, on suit la démarche d'evals décrite dans [`evals/README.md`](../evals/README.md) :
1.  **Baseline sans skill :** faire tourner l'agent (sous-agent en contexte neuf) sur une tâche représentative (`query` de `evals/vibe-coding-evals.json`), sans le skill candidat, et noter les écarts par rapport au `expected_behavior`.
2.  **Skill minimal :** écrire le skill le plus mince possible pour combler ces écarts précis (principe NordAI « minimum d'instructions », pas de ré-explication de ce que l'agent fait déjà bien).
3.  **Re-run avec skill :** relancer le même scénario, skill injecté, instance fraîche ; comparer l'amélioration.
4.  **Itération Claude A / Claude B :** cible ≥ 3 scénarios par skill avant de le considérer fiable ; les résultats sont consignés dans `evals/baseline-results.md`.

Cette démarche est complémentaire à l'évaluation technique du code (CI type-check + build) — elle porte sur la fiabilité du *déclenchement* et du *contenu* des skills, pas sur la correction du code applicatif.
