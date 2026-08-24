# Les trois environnements, et où travailler

Document de référence. En cas de contradiction avec un autre document, c'est
celui-ci qui fait foi pour l'hébergement et le déploiement.

## En une phrase

**On travaille sur `dev.vitrinedemocratique.com`** (Cloudflare, protégé par mot
de passe). GitHub Pages tourne encore, mais **ne sert plus de référence**.

## Les adresses

| Adresse | Rôle | Branche | Accès |
|---|---|---|---|
| `vitrinedemocratique.com` | **production**, publique | `prod` | ouvert |
| `dev.vitrinedemocratique.com` | **miroir de travail** | `main` | Cloudflare Access |
| `api.vitrinedemocratique.com` | API de lecture | — (Worker) | clé d'API |
| `api.vitrinedemocratique.com/admin` | gestion des clés | — (Worker) | Cloudflare Access |
| `ellipse.science/vitrine-showcase.github.io` | ancien miroir | `main` | ouvert |

### Pourquoi l'ancien miroir existe encore

GitHub Pages est conservé comme **chemin de retour arrière** : si la chaîne
Cloudflare tombe, il reste un site debout, construit par un chemin indépendant.
Il se déploie donc toujours à chaque poussée sur `main`.

**Mais on ne s'y réfère plus.** Une capture d'écran, un rapport de bogue ou une
recette qui viendraient de là décrivent un site que personne ne surveille. Deux
conséquences pratiques :

- il sert le **même contenu** que `dev.vitrinedemocratique.com` (parité
  vérifiée : mêmes sections, même texte visible) mais **sans mot de passe**, ce
  qui rend la protection du dev symbolique tant qu'il vit ;
- il lit les **JSON commités**, là où le dev Cloudflare lit l'**API**. Un écart
  entre les deux est donc un signal utile, pas un bogue à corriger au hasard.

Il sera débranché quand l'équipe le décidera. D'ici là : **travailler sur
Cloudflare**.

## Comment le code circule

```
                    ┌── deploy.yml ─────────────→ GitHub Pages   (filet)
   PR ──→ main ─────┤
                    └── deploy-dev-cloudflare ──→ dev.vitrinedemocratique.com

   main ──(fusion délibérée)──→ prod ──→ deploy-prod ──→ vitrinedemocratique.com
```

**`prod` n'avance que de deux façons :**

1. **les données**, automatiquement — `refresh-data.yml` y recopie
   `public/data/` et `public/audio/` toutes les 4 h ;
2. **le code**, uniquement par une **fusion délibérée `main → prod`**.

⚠️ **Le piège à connaître.** Le code fusionné dans `main` n'est PAS en
production. Oublier la promotion laisse la prod tourner sur du vieux code
pendant que les données, elles, continuent d'arriver — c'est arrivé le soir du
lancement, la prod servant des en-têtes de cache corrigés la veille sur `main`.
Le symptôme est trompeur : le site a l'air vivant, ses données sont fraîches,
seul son comportement est ancien.

`prod` est protégé par un ruleset : PR + une approbation + contrôles verts,
**sans dérogation administrateur**. Seule la clé de déploiement passe outre,
pour que la synchro des données continue.

**Et depuis le 2026-08-19, la promotion exige une vérification sur dev**
(règle dure #10, `AGENTS.md`) : la PR de promotion doit contenir la ligne
« `- [x] Vérifié sur dev le AAAA-MM-JJ : <ce qui a été observé>` », bloquée
mécaniquement par le check `garde-promotion` sinon. Un agent sans accès
Cloudflare Access fait sa vérification sur le miroir GitHub Pages (même
contenu que dev) et le précise dans la ligne. Les poussées de données
automatiques (`[prod data sync]`) ne sont pas concernées.

## D'où viennent les données

```
raffineurs (R, AWS Lambda) ──→ Athena
                                 │
      GitHub Actions : fetch_data.R (toutes les 4 h, déclenché par cron-job.org)
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
      JSON commités dans le dépôt        POST /v1/sync ──→ Postgres (Neon)
                 │                                            │
                 │                                            ▼
      GitHub Pages lit les JSON               dev et prod lisent l'API
```

**L'ordre compte, et il est garanti.** `refresh-data` recharge Postgres *après*
avoir commité sur `main` et *avant* de pousser sur `prod` — c'est cette poussée
qui déclenche le déploiement. Sans cet ordre, le build lirait l'API pendant
qu'elle contient encore le cycle précédent : c'est la régression du
2026-08-18, où le site affichait des données de plusieurs heures plus anciennes
que celles qui venaient d'être publiées.

**Deuxième ligne de défense** : `lib/data/source.ts` interroge `/v1/health`
avant de se fier à l'API. Si la table la plus en retard dépasse 45 minutes, le
build repart des JSON commités, frais par construction.

**Le site reste un export statique.** L'API est lue **au build**, jamais par le
navigateur d'un visiteur. C'est ce qui permet au site d'encaisser un afflux sans
effet sur AWS ni sur Postgres : le nombre de visiteurs n'a aucune influence sur
le coût. **Ne jamais appeler l'API depuis un composant client.**

## L'API

- Lecture seule. `/v1/health` et `/v1/datasets` sont ouverts ; **tout jeu de
  données demande une clé**.
- Clés stockées **hachées** (SHA-256). Personne ne peut relire une clé
  existante : on révoque et on réémet. Elle n'est affichée qu'à sa création.
- Portées par jeu de données, quota quotidien facultatif, usage compté par
  clé / jour / jeu.
- `/admin` vérifie la **signature** du jeton Cloudflare Access, pas seulement
  l'en-tête courriel : retirer l'application Access ne suffirait pas à ouvrir
  l'émission de clés.

Conception et décisions : [`api-direction.md`](./api-direction.md).

## Les pièges déjà payés

Chacun a coûté du temps ; ils sont listés pour qu'ils ne le coûtent qu'une fois.

| Piège | Ce qui se passe | Ce qu'il faut faire |
|---|---|---|
| **`main` ≠ prod** | La prod tourne sur du vieux code, données fraîches | Fusionner `main → prod` |
| **`NEXT_PUBLIC_BASE_PATH` absente** | Tous les actifs en 404 sur la prod | La poser **vide**, pas l'omettre (`??` ne se déclenche que sur `undefined`) |
| **`NEXT_PUBLIC_SITE_ORIGIN` oubliée** | URL canoniques et cartes de partage pointent vers le dev | La poser sur chaque environnement |
| **Branches `aws-infra`** | PR fermée sans explication | Préfixe **`feature/`**, jamais `feat/` |
| **`aws-infra` cible `main`** | Déploiement direct en **production** | Cibler **`develop`** |
| **CPU des Workers** | La synchro meurt à la 6ᵉ table, en silence | `fetch` = 10 ms de CPU, `scheduled` = 30 s. Travailler par tranches |
| **Cron en UTC** | L'horaire dérive à chaque changement d'heure | Déjà réglé dans le code (`schedule.ts`) — ne pas « simplifier » |
| **Tiret cadratin** | La garde `typographie` refuse la PR | Deux phrases, ou un deux-points |
| **`Setup R`** | Le rafraîchissement se bloque ou s'annule | Aléa GitHub Actions connu, pas une régression du code |

## Vérifier qu'un environnement va bien

```bash
# Production : doit répondre 200 et servir Cloudflare
curl -sI https://vitrinedemocratique.com | grep -iE 'HTTP/|server'

# Fraîcheur des données servies à l'API
curl -s https://api.vitrinedemocratique.com/v1/health | python3 -m json.tool | head -20

# Le dev répond 302 vers Access : c'est le comportement attendu
curl -sI https://dev.vitrinedemocratique.com | head -1

# La prod porte-t-elle le dernier code ? (doit être vide)
git log --oneline origin/prod..origin/main -- app lib components
```

Cette dernière commande est la plus utile : **si elle affiche des commits, la
production tourne sur du code plus ancien que `main`.**
