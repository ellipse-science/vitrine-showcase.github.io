# Travailler avec un agent sur la Vitrine

Comment confier du travail à un agent (Claude Code ou autre) sur ce projet sans
casser la production, et en obtenant quelque chose de vérifiable.

Public visé : toute personne de l'équipe, agent compris. Un agent qui lit ce
document doit pouvoir travailler seul jusqu'à la PR.

## Le principe qui gouverne tout le reste

**Un agent ne prouve rien en relisant son propre code.** Sur ce projet, chaque
bogue sérieux a été trouvé en *exécutant* quelque chose, jamais en relisant :

- les règles `_headers` se concaténaient en directives de cache contradictoires
  — vu seulement après un vrai déploiement ;
- la route `/v1/datasets` avalait `/v1/datasets/{nom}` — vu seulement en
  appelant l'API ;
- la synchro mourait à la 6ᵉ table sur quinze, en répondant « succès » — vu
  seulement en comptant les lignes en base ;
- l'aller-retour par Postgres changeait le format des dates — vu seulement en
  comparant ligne à ligne avec les fichiers publiés.

Aucun de ces bogues n'était visible à la lecture. **Exiger la preuve, pas la
description.** Une PR qui dit « vérifié » sans chiffre ni sortie de commande
n'est pas vérifiée.

## Où travailler

| Ce que vous touchez | Dépôt | Branche de départ | Cible |
|---|---|---|---|
| Site, modules, API | `vitrine-showcase.github.io` | `develop` | `develop` |
| Mise en production | `vitrine-showcase.github.io` | `develop` | `main` |
| Raffineurs (R) | `aws-refiners` | `develop` | `develop` |
| Infrastructure AWS | `aws-infra` | `develop` | `develop` |

⚠️ **`aws-infra` et `aws-refiners` ont leurs propres règles.** Les branches y
prennent le préfixe **`feature/`** — une branche `feat/` voit sa PR fermée. Et
`aws-infra` déploie `develop` **directement en production** : sauf intention
explicite, viser `develop`.

**Le miroir de travail est `dev.vitrinedemocratique.com`**, pas GitHub Pages.
Voir [`environnements.md`](./environnements.md).

## La boucle de travail

1. **Lire d'abord.** `AGENTS.md` (règles dures), `environnements.md` (où va
   quoi), et le module concerné. Les commentaires de ce dépôt expliquent le
   *pourquoi* : ils valent mieux qu'une relecture du code seul.
2. **Une branche par intention.** Pas de fourre-tout : la règle des PR courtes
   (hard rule #9) suppose qu'une PR se lise en une minute.
3. **Vérifier localement** : `npm run type-check`, `npm test`,
   `npm run build`, `node scripts/garde_redaction.mjs`. Les quatre, avant de
   pousser — la CI les rejouera de toute façon.
4. **Prouver le changement.** Selon la nature : appeler l'endpoint, comparer
   deux builds, compter les lignes en base, mesurer un temps de réponse.
5. **PR courte**, gabarit rempli, mesures dans l'issue liée et non dans le
   corps de la PR.
6. **Dire ce qui n'a PAS été vérifié.** C'est la section la plus utile d'une
   PR d'agent. Un relecteur ne peut pas deviner qu'une page n'a jamais été
   ouverte dans un navigateur.

## Ce qu'un agent ne peut pas faire seul

À demander à un humain, sans tourner autour :

- **Ouvrir une page derrière Cloudflare Access** (`/admin`, le miroir dev) : il
  faut une session interactive. Un agent peut éprouver les routes en local en
  injectant l'identité, pas la page dans un navigateur.
- **Approuver une PR.** Hard rule #9 : une IA seule ne review pas. `main` et
  `aws-refiners` l'imposent techniquement.
- **Vérifier un rendu visuel** sur plusieurs tailles d'écran.
- **Décider d'un compromis** entre fraîcheur, coût et complexité.

## Les gardes qui refuseront votre PR

Elles sont automatiques, et toutes ont une raison écrite quelque part.

| Garde | Refuse | Remède |
|---|---|---|
| `typographie` | Tiret cadratin, espace ordinaire avant `: ; ! ?` | Deux phrases, ou insécable ` ` |
| `attribution-humaine` | `Co-Authored-By` vers une IA | Trailer français `Assisté par : …` |
| `impact-methodologie` | Case non cochée quand la métho peut bouger | Cocher en **nommant les trois documents** |
| `note-publique` | Note de journal absente | Une ou deux phrases grand public |
| `check-source-branch` (aws-infra) | Préfixe autre que `feature/` | Renommer la branche |
| `sur-pr` (aws-infra) | Swimlanes divergents de `refiners.ts` | Mettre la page à jour |

## Secrets et identifiants

- **Ne jamais écrire un identifiant dans le dépôt**, même privé : il finit dans
  l'historique Git et dans les images ECR, où on ne peut plus le révoquer. Le
  projet en a un exemple vivant — un jeton Upstash publié dans le bundle client
  (issue #499).
- Les secrets vivent dans les réglages GitHub, les secrets Worker, ou AWS
  Secrets Manager. Jamais dans un commit, jamais dans un message.
- **Un agent ne devrait pas manipuler d'identifiants de déploiement.** Les deux
  dépôts AWS se déploient par OIDC, sans clé de longue durée : c'est le bon
  modèle, il n'y a rien à donner à un agent.

## Recettes utiles

```bash
# La prod tourne-t-elle sur le dernier code ? (vide = oui)
git log --oneline origin/main..origin/main -- app lib components

# Fraîcheur des données de l'API
curl -s https://api.vitrinedemocratique.com/v1/health | python3 -m json.tool | head

# Comparer un build sur fichiers et un build sur API
VITRINE_DATA_SOURCE=files npm run build && cp out/index.html /tmp/a.html
VITRINE_DATA_SOURCE=api VITRINE_API_KEY=… npm run build && cp out/index.html /tmp/b.html
# puis comparer le TEXTE VISIBLE : le flux RSC diffère sans que rien ne change
# à l'écran, et le buildId de Next est tiré au hasard à chaque build.

# Éprouver le gestionnaire de cron sans attendre l'heure
cd workers/api && npx wrangler dev --test-scheduled --local
curl "http://localhost:8787/__scheduled"   # SYNC_FORCE=1 dans .dev.vars
```

## Quand quelque chose casse en production

1. **Regarder la fraîcheur avant le code** : `/v1/health` et la dernière
   exécution de `refresh-data`. La cause la plus fréquente n'est pas une
   régression, c'est un rafraîchissement qui n'a pas tourné.
2. **Vérifier que `main` porte bien le code attendu** (commande ci-dessus). Un
   correctif fusionné dans `develop` n'est pas déployé.
3. **Distinguer les pannes**. Le 2026-08-18, deux choses sont arrivées le même
   jour — un `Setup R` annulé et une bascule de source de données — et il était
   tentant de n'y voir qu'un seul incident. Chercher la deuxième cause.
4. **Revenir en arrière avant de comprendre.** Le retour au chemin connu est
   presque toujours d'une ligne ; l'enquête peut se faire ensuite, hors
   pression.
