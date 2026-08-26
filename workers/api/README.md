# vitrine-api

Worker Cloudflare qui sert les indicateurs de la Vitrine depuis Postgres (Neon).
Destiné à `api.vitrinedemocratique.com`.

Conception et décisions : `docs/reference/api-direction.md`.

## État

**Déployé et fonctionnel**, en lecture seule et **sans authentification**. Les
clés d'API, quotas et facturation viendront quand il y aura des clients — les
inventer avant serait deviner.

URL de travail : `https://vitrine-api.vitrine-api-worker.workers.dev`
(le domaine `api.vitrinedemocratique.com` reste à attacher).

## Endpoints

| Route | Rôle |
|---|---|
| `GET /` | Ce que l'API est, et ses routes |
| `GET /v1/health` | Fraîcheur par table, depuis `vitrine.sync_state` |
| `GET /v1/datasets` | Jeux de données exposés et filtres acceptés |
| `GET /v1/datasets/{nom}` | Les lignes |
| `GET /v1/snapshot/manifest.json` | Cycle courant de l'instantané R2 (sous `SNAPSHOT_TOKEN`) |
| `GET /v1/snapshot/{cycle}/{table}.json` | Les lignes du cycle, depuis R2, **sans toucher Postgres** |

`/v1/snapshot` sert le BUILD DU SITE, pas les clients de l'API. La synchro y
dépose les lignes au moment où elle les écrit dans Postgres, et le build les
lit là. Auparavant chaque build redescendait jusqu'à Postgres par
`/v1/datasets` : à ~85 builds par jour, cela a épuisé les 5 Go mensuels de
transfert de Neon en huit jours et mis la base hors service (2026-08-26).
Rien sur ce chemin ne touche Postgres — y compris la vérification du jeton,
sans quoi une base indisponible casserait à nouveau le build. Voir
`src/snapshot.ts`.

Paramètres de `/v1/datasets/{nom}` : `from`, `to` (bornes sur la colonne de tri),
les filtres déclarés du jeu (`party`, `deputy`, `period_type`…), `limit`
(défaut 1000, max 5000), `offset`.

```
/v1/datasets/provincial_parties_score_day?party=caq&from=2026-08-01&limit=2
```

## Trois propriétés à ne pas perdre

**On ne requête jamais Athena.** Latence de plusieurs secondes à froid,
facturation au téraoctet scanné : chaque appel client deviendrait une facture
imprévisible. Postgres répond ici en moins d'une milliseconde.

**Liste blanche explicite** (`DATASETS` dans `src/index.ts`), et non lecture du
catalogue Postgres : une table ajoutée au schéma ne doit pas devenir publique par
accident. Les identifiants de colonnes viennent de cette liste, jamais de l'URL ;
seules les *valeurs* passent en paramètres liés. Aucune entrée utilisateur n'est
concaténée dans le SQL.

**Cache de 4 h**, calé sur la cadence de rafraîchissement. Postgres ne voit
qu'une poignée de requêtes par fenêtre quel que soit le trafic : l'API monte en
charge comme un CDN tout en se comportant comme une base de données.

## Pilote

`@neondatabase/serverless` parle **HTTP**, pas TCP : ni `nodejs_compat`, ni
Hyperdrive, ni pooler à configurer. C'est ce qui rend ce Worker déployable sans
autre infrastructure.

## Déploiement

```sh
npm install
npm run type-check
npx wrangler secret put DATABASE_URL   # l'URL Neon, hors du dépôt
npm run deploy
```

## Alimentation

Les tables sont remplies par la synchro Athena → Postgres. Le schéma est généré
depuis `scripts/tables.json` (`node scripts/generate_pg_schema.mjs`), et
`scripts/load_pg.mjs` charge un jeu depuis les JSON publiés — c'est ce qui a servi
à valider le schéma. La synchro périodique reste à construire.
