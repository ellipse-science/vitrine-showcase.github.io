# Design : actualisation automatique du navigateur au cycle de données

**Date :** 2026-08-19
**Statut :** approuvé (comportement hybride choisi), implémentation dans la même PR.

## Objectif

Quand le site se redéploie (cycle de données de 4 h, ou promotion de code), le
navigateur d'un visiteur déjà sur la page doit le refléter sans F5 manuel.

## Contrainte non négociable

Le navigateur n'appelle JAMAIS `api.vitrinedemocratique.com` (règle du coût
nul sous afflux). La détection passe donc par un fichier statique servi par le
même CDN que la page.

## Mécanisme

1. **`out/build-id.json`** (~100 octets), écrit par `scripts/postbuild.mjs` à
   chaque build : `{ "id": "<sha7>-<horodatage>", "builtAt": "<ISO>" }`.
   L'horodatage fait partie de l'identifiant : un rebuild « données seulement »
   (même commit, nouvelles données) change l'identifiant quand même.
2. **`public/_headers`** : `Cache-Control: no-store` sur `/build-id.json`
   (règle cumulative avec les en-têtes de sécurité de `/*`, qui ne porte aucun
   Cache-Control : pas de concaténation contradictoire).
3. **`components/interactive/ActualisationAuto.tsx`** (client, monté dans le
   layout à côté de `ServiceWorkerRegistration`) :
   - au chargement, lit l'identifiant courant (baseline) ;
   - toutes les 10 min quand l'onglet est visible, relit ; identifiant
     différent en pleine lecture = bandeau discret « De nouvelles données sont
     disponibles / Actualiser » (jamais de rechargement sous les yeux) ;
   - au retour d'onglet (`visibilitychange`), relit ; identifiant différent =
     rechargement immédiat (l'utilisateur ne lisait pas : indolore) ;
   - toute erreur de sonde = silence (hors ligne, bloqueur : le site
     fonctionne comme avant).
4. Le service worker est réseau-d'abord hors `/_next/static` : la sonde
   `cache: "no-store"` atteint toujours le réseau quand en ligne. Sur le
   miroir GitHub Pages (qui ignore `_headers`), le CDN peut retarder la
   détection de quelques minutes : acceptable pour un filet.

## Rejeté

- **SSE/WebSocket** : exige un serveur de connexions persistantes, réintroduit
  un coût proportionnel au trafic.
- **`meta http-equiv=refresh`** : recharge aveuglément, même en pleine lecture.
- **Rechargement automatique systématique** : interrompt la lecture d'un
  graphique ; le mode hybride ne recharge que quand c'est indolore.

## Acceptation

1. `npm run build` produit `out/build-id.json` et le type-check passe.
2. En servant `out/` localement puis en modifiant `build-id.json` à la main :
   retour d'onglet = rechargement ; onglet resté visible = bandeau, clic =
   rechargement.
3. Aucune requête vers l'API depuis le navigateur (inchangé).
4. Passage sur dev avant toute promotion (règle dure #10).
