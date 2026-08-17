# Direction de l'API payante — décisions arrêtées, construction reportée

**Statut :** décisions d'architecture prises le 2026-08-17. **Rien n'est construit.**
Ce document existe pour qu'on ne se ferme pas de portes en attendant, pas pour
décrire un produit existant.

Le projet compte à terme vendre l'accès à des endpoints API. La priorité reste
la mise en marché du site public ; l'API vient après. Trois choix, en revanche,
coûtent presque rien aujourd'hui et très cher à rattraper, d'où leur inscription
ici.

## 1. Surface : un sous-domaine

`api.vitrinedemocratique.com`, servi par son propre Worker Cloudflare.

Pas `vitrinedemocratique.com/api/...`. Le sous-domaine sépare nettement
l'authentification, les quotas, la documentation et le CORS, et surtout il
**découple l'API de l'hébergement du site** : le site reste un export statique
sur Cloudflare Pages, l'API vit à côté. Le dépôt fait déjà tourner un Worker
autonome (`workers/report-issue/`) — c'est le même patron.

## 2. Stockage de service : Postgres (Supabase), jamais Athena

**Athena n'est pas un backend d'API.** Latence à froid de plusieurs secondes,
facturation au téraoctet scanné, concurrence limitée par workgroup. Mettre des
clients payants devant, c'est acheter une panne et une facture.

Il faut donc un stockage requêtable entre les refiners et les endpoints.
Candidat retenu : **Supabase Postgres**, alimenté par les mêmes refiners qui
publient déjà dans les datamarts.

**Règle dure, valable dès maintenant :** aucun endpoint ne requête Athena
directement, et aucun endpoint ne lit les JSON du site. Ce sont deux chemins
distincts qui partagent une source, pas un chemin réutilisé.

```
refiners (R/Lambda) ─┬─→ Athena/datamarts ─→ fetch_data.R ─→ JSON ─→ build ─→ site statique
                     └─→ Postgres (Supabase) ─────────────────────→ Worker ─→ API payante
```

### Pourquoi le site, lui, ne passe pas par Postgres

Le site inline ses données dans le HTML prérendu au build. C'est précisément ce
qui lui permet d'encaisser un afflux de visiteurs à coût nul : le nombre de
visiteurs n'a **aucun** effet sur AWS. Y insérer une base de données à
l'exécution échangerait cette propriété contre une dépendance, de la latence et
un plafond de connexions. On ne le fera pas.

## 3. `scripts/tables.json` est un contrat de schéma

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

## À trancher avant tout revenu, pas après

Trois questions juridiques, à porter au CLESSN / à l'Université Laval :

1. **Droits de rediffusion** des données dérivées de manchettes de presse
   moissonnées.
2. **Conditions d'utilisation commerciale** d'OpenAI et de Replicate, qui
   couvrent l'illustration et la musique générées.
3. **Propriété institutionnelle** des extrants.
