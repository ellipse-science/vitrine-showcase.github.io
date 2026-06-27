# Evals — pratiques vibe coding (NordAI)

Point de départ d'evals pour mesurer la qualité des **skills candidats** du repo.
Source : NordAI (William Garneau), 2026-06-25. Format : `skills` / `query` / `files` /
`expected_behavior`. Complémentaire à l'évaluation technique du code.

## Pourquoi
Règle « évaluer d'abord » : avant d'écrire un skill, on fait tourner l'agent **sans** le
skill sur des tâches représentatives et on note où il échoue. Ces échecs deviennent la
base de référence et dictent le contenu minimal du skill (ni plus, ni moins).

## Protocole baseline
1. Lancer l'agent **sans** le skill sur la `query`.
2. Comparer le comportement réel aux `expected_behavior` ; noter chaque écart.
3. Écrire le skill minimal qui comble ces écarts.
4. Relancer **avec** le skill (instance fraîche) ; mesurer l'amélioration.
5. Itérer (Claude A / Claude B). Cible : ≥ 3 scénarios par skill avant de le juger fiable.

Pas de moteur d'eval intégré : scénarios exécutés à la main (ou via sous-agents en
contexte neuf). Résultats consignés dans `baseline-results.md`.

## Fichiers
- `vibe-coding-evals.json` — les 4 evals (1 par skill candidat).
- `baseline-results.md` — résultats de la baseline (étape 3).

## Portée
`vitrine-showcase` uniquement pour l'instant. L'eval `gestion-horaires-raffineurs` touche
`aws-infra` → Phase B.
