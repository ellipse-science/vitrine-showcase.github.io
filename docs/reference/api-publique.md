# API de la Vitrine démocratique

Documentation destinée aux personnes à qui l'on donne une clé. Elle peut être
transmise telle quelle.

**Base** : `https://api.vitrinedemocratique.com`

## Ce que l'API sert

Les **indicateurs dérivés** produits par la Vitrine démocratique : saillance des
enjeux, couverture des partis, polimètre, activité parlementaire. Ce sont les
mêmes chiffres que ceux affichés sur `vitrinedemocratique.com`.

Elle ne sert **pas** le corpus brut de manchettes.

Les données sont recalculées **toutes les 4 heures**.

## Authentification

Toute lecture d'un jeu de données demande une clé, en en-tête :

```bash
curl -H "Authorization: Bearer VOTRE_CLÉ" \
  "https://api.vitrinedemocratique.com/v1/datasets/issues_score_week?limit=5"
```

Un paramètre `?api_key=` est accepté là où poser un en-tête est malcommode (un
tableur, un carnet de notes). Il est **moins sûr** : la clé se retrouve alors
dans les journaux de serveur et l'historique du navigateur.

Deux routes restent ouvertes, parce qu'elles ne livrent aucune donnée :
`/v1/health` et `/v1/datasets`.

## Routes

### `GET /v1/health`

Fraîcheur de chaque table. C'est ici qu'on vérifie que la donnée est à jour
avant de s'en servir.

```json
{
  "status": "ok",
  "tables": 15,
  "oldest_sync": "2026-08-18T18:28:42Z",
  "sync_state": [
    { "table_name": "issues_score_week", "synced_at": "…", "row_count": 1782 }
  ]
}
```

### `GET /v1/datasets`

Les jeux disponibles et les filtres acceptés par chacun.

### `GET /v1/datasets/{nom}`

Les lignes. **Clé requise.**

| Paramètre | Effet | Défaut |
|---|---|---|
| `limit` | lignes par réponse (max 5000) | 1000 |
| `offset` | pagination | 0 |
| `from`, `to` | bornes sur la colonne de tri | — |
| filtres du jeu | `party`, `deputy`, `period_type`… | — |

```bash
curl -H "Authorization: Bearer VOTRE_CLÉ" \
  "https://api.vitrinedemocratique.com/v1/datasets/provincial_parties_score_day?party=caq&from=2026-08-01&limit=100"
```

Réponse :

```json
{
  "dataset": "provincial_parties_score_day",
  "synced_at": "2026-08-18T18:28:42Z",
  "total_rows": 9365,
  "count": 100,
  "limit": 100,
  "offset": 0,
  "rows": [ … ]
}
```

`synced_at` dit **quand la donnée a été chargée**, `total_rows` combien il y en
a en tout — de quoi paginer sans deviner.

### Tout récupérer

`limit` plafonne à 5000 ; les jeux plus gros se paginent :

```bash
offset=0
while : ; do
  page=$(curl -s -H "Authorization: Bearer $CLE" \
    "https://api.vitrinedemocratique.com/v1/datasets/issues_score_day?limit=5000&offset=$offset")
  n=$(printf '%s' "$page" | python3 -c "import sys,json;print(json.load(sys.stdin)['count'])")
  printf '%s\n' "$page"
  [ "$n" -lt 5000 ] && break
  offset=$((offset + 5000))
done
```

## Codes de réponse

| Code | Sens | Que faire |
|---|---|---|
| `200` | | |
| `401` | clé absente, inconnue ou révoquée | vérifier l'en-tête, demander une nouvelle clé |
| `403` | la clé n'a pas accès à ce jeu | demander l'ajout du jeu à votre clé |
| `404` | jeu inconnu | voir `/v1/datasets` |
| `429` | quota quotidien atteint | il repart à minuit UTC |
| `500` | erreur interne | signaler, en indiquant l'heure |

Les erreurs portent un message en clair :

```json
{ "error": "Cette clé n'a pas accès au jeu « issues_score_day »." }
```

## Portées et quotas

Une clé donne accès à **une liste précise de jeux** et, éventuellement, à un
nombre de requêtes par jour. Les deux se demandent à l'équipe et se modifient
sans changer la clé.

Le quota se compte par jour **UTC**, toutes routes confondues.

## Ce qu'il faut savoir avant de bâtir dessus

**Mettez en cache.** Les données ne bougent que toutes les 4 h : interroger plus
souvent consomme votre quota sans rien apporter. `synced_at` indique quand
recharger.

**Les noms de colonnes sont un contrat.** Ils viennent de `scripts/tables.json`
dans le dépôt public. Un renommage passera par une période de dépréciation, pas
par un simple changement.

**Une clé n'est affichée qu'une fois.** Elle est conservée hachée : personne, y
compris l'équipe, ne peut la relire. Une clé perdue se remplace, ne se retrouve
pas.

**Si une clé fuit**, prévenez : la révocation est immédiate.

## Limites connues

- Lecture seule. Aucune écriture n'est exposée.
- Pas de webhooks : c'est à vous d'interroger.
- Pas de format autre que JSON.
- Le corpus brut de manchettes n'est pas offert.

## Contact

Par une issue sur le dépôt public, ou par la personne qui vous a remis la clé.
