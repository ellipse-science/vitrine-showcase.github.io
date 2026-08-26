# Direction de l'API payante — décisions arrêtées, construction reportée

**Statut :** décisions d'architecture prises le 2026-08-17. **Rien n'est construit.**
Ce document existe pour qu'on ne se ferme pas de portes en attendant, pas pour
décrire un produit existant.

Le projet compte à terme vendre l'accès à des endpoints API. La priorité reste
la mise en marché du site public ; l'API vient après. Quelques choix, en
revanche, coûtent presque rien aujourd'hui et très cher à rattraper, d'où leur
inscription ici.

Le budget n'est pas la contrainte : la question posée était « quelle est la
solution optimale », pas « quelle est la moins chère ». La réponse se trouve
quand même être bon marché — c'est une conséquence de la taille des données
(§ 3), pas un compromis.

## 1. Surface : un sous-domaine

`api.vitrinedemocratique.com`, servi par son propre Worker Cloudflare.

Pas `vitrinedemocratique.com/api/...`. Le sous-domaine sépare nettement
l'authentification, les quotas, la documentation et le CORS, et surtout il
**découple l'API de l'hébergement du site** : le site reste un export statique
sur Cloudflare Pages, l'API vit à côté. Le dépôt fait déjà tourner un Worker
autonome (`workers/report-issue/`) — c'est le même patron.

## 2. Ce qui est vendu : les agrégats dérivés

Arrêté le 2026-08-17 : l'API vend **les indicateurs produits par les refiners** —
saillance des enjeux, couverture des partis, polimètre, agora — sous forme de
séries temporelles. **Pas** le corpus brut de manchettes.

Cette phrase décide de tout le reste. Des agrégats, c'est petit, structuré, et
déjà calculé. Si un jour le corpus brut entre dans l'offre (recherche plein
texte, regroupements arbitraires sur des millions de lignes), Postgres devient la
mauvaise forme et il faudra rouvrir la question — ClickHouse ou Tinybird sont
faits pour ça. **Tant qu'on vend des agrégats, ce document tient.**

## 3. Le pont Athena → API

**Athena n'est pas un backend d'API.** Latence à froid de plusieurs secondes,
facturation au téraoctet scanné, concurrence limitée par workgroup. Chaque
requête d'un client se traduirait en octets scannés facturés au projet : on
achèterait à la fois la panne et la facture imprévisible.

```
Athena (calcul, 4 h) ─→ synchro ─→ Postgres (service) ─→ Worker + Hyperdrive ─→ cache CF (TTL 4 h) ─→ client
                                        ↑
                            clés d'API, quotas, compteurs d'usage
```

**Le fait dominant : les données sont minuscules et lentes.** ~15 Mo publiés,
recalculés toutes les 4 h. Ce n'est pas un problème de volume mais de latence, de
prévisibilité et de facturation à l'usage. Le budget n'est pas la contrainte ; la
simplicité d'exploitation l'est.

**Postgres comme stockage de service** — non parce qu'il serait « assez rapide »
(à cette taille, tout l'est), mais parce que c'est **le même endroit où doivent
vivre les clés d'API, les quotas par clé, les compteurs d'usage et les
enregistrements de facturation**. Un système à exploiter et à sauvegarder, pas
deux. Neon ou Supabase conviennent : Neon est plus sobre si on écrit sa propre
authentification, Supabase démarre plus vite (PostgREST et RLS fournis).

**La synchro est plus petite qu'il n'y paraît, parce que `fetch_data.R` la fait
déjà.** Ce script interroge déjà les 21 tables Athena toutes les 4 h et porte
déjà la liste blanche de colonnes qui EST le contrat de schéma public (§ 4). Le
pont, c'est une étape de plus dans un travail déjà planifié : un UPSERT vers
Postgres à côté de l'écriture des JSON. Athena reste la source de vérité unique,
rien n'est écrit deux fois, et une réexécution est idempotente.

**Le cache est la pièce qui rend l'ensemble optimal** plutôt que simplement
correct : un TTL de 4 h au Worker, calé sur le cycle de rafraîchissement.
Postgres ne voit alors qu'une poignée de requêtes par fenêtre, que l'API serve
dix clients ou dix mille. L'API monte en charge comme un CDN tout en se
comportant comme une base de données.

Ordre de grandeur : ~25–70 $/mois de Postgres, 5 $/mois de Workers, Hyperdrive
inclus. Le coût n'est pas un sujet à cette échelle — c'est en soi le résultat
utile.

**Règle dure, valable dès maintenant :** aucun endpoint ne requête Athena
directement, et aucun endpoint ne lit les JSON du site. Ce sont deux chemins
distincts qui partagent une source, pas un chemin réutilisé.

### Écartés, et pourquoi

- **D1 (Cloudflare)** — tentant car collé au Worker, mais l'écriture depuis des
  Lambdas AWS est malcommode et l'agrégation analytique y est faible.
- **Pré-calcul de toutes les réponses sur R2** — réellement optimal *si* l'espace
  des requêtes est énumérable, et quasi gratuit. Écarté pour l'instant : cela
  figerait des schémas d'usage qu'on n'a pas encore observés. Reste ajoutable
  plus tard comme couche de cache.
- **ClickHouse / Tinybird** — la bonne réponse à une autre question (corpus brut,
  cf. § 2).

### Pourquoi le site, lui, ne passe pas par Postgres

Le site inline ses données dans le HTML prérendu au build. C'est précisément ce
qui lui permet d'encaisser un afflux de visiteurs à coût nul : le nombre de
visiteurs n'a **aucun** effet sur AWS. Y insérer une base de données à
l'exécution échangerait cette propriété contre une dépendance, de la latence et
un plafond de connexions. On ne le fera pas.

## 4. `scripts/tables.json` est un contrat de schéma

Le fichier liste déjà en liste blanche les tables et colonnes extraites
d'Athena. Le jour où l'API existe, ces noms de colonnes deviennent **publics** :
les renommer cassera des clients payants. Tout renommage demandera dès lors une
période de dépréciation, pas un simple commit.

## Ce qu'il reste à faire (non planifié)

- Le Worker lui-même : authentification par clé, quotas, facturation, versionnage
  (`/v1/`), documentation.
- Le pipeline refiners → Postgres.
- Reprendre le classement Flappy derrière un Worker : `lib/flappyLeaderboard.ts`
  n'a plus de chemin d'écriture depuis la révocation du jeton Upstash exposé.
  C'est une répétition générale à faible enjeu de la forme Worker + base.

## Questions juridiques — feu vert donné le 2026-08-18

Les trois questions ci-dessous conditionnaient toute mise en marché. **Mathieu
Foisy a donné son accord le 2026-08-18** pour que le projet avance sur cette
base.

1. **Droits de rediffusion** des données dérivées de manchettes de presse
   moissonnées.
2. **Conditions d'utilisation commerciale** d'OpenAI et de Replicate, qui
   couvrent l'illustration et la musique générées.
3. **Propriété institutionnelle** des extrants.

⚠️ **Ce que cette section établit, et ce qu'elle n'établit pas.** Elle
enregistre une décision de projet, prise par la personne qui le dirige. Elle ne
remplace pas un avis du contentieux de l'Université Laval ni un écrit du CLESSN.
Avant de facturer un premier client — et non avant d'ouvrir l'API à un
partenaire — il vaut la peine d'obtenir cet accord par écrit auprès de
l'institution : c'est elle, et non le projet, qui porterait un litige sur des
données dérivées de contenus de presse.

Ce qui est noté ici suffit pour avancer ; ce qui manque se demande une fois, et
protège durablement.
