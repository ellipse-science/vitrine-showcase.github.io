---
name: verification-responsive
description: >
  Vérifier le rendu responsive AVANT de pousser toute modification frontend
  (composant, CSS, layout, template de section). À utiliser dès qu'une PR
  touche `components/`, `app/**/*.css`, `app/page.tsx` ou une page statique de
  `public/` : dérouler la checklist des viewports (desktop cibles, frontières
  de breakpoints, mobile 375), tester le débordement horizontal et TOUS les
  états dynamiques du composant, puis remplir la case « Vérification
  responsive » du template de PR. Déclencheurs : « vérifie le mobile »,
  « responsive », « breakpoint », « ça déborde », toute retouche de
  globals.css ou d'un composant de section.
---

# Vérification responsive (frontend)

Le site est consulté autant sur téléphone que sur les écrans cibles du projet
(MacBook 13,3" ≈ 1280-1440 logique, LG 23,5" 1920×1080 — cf. #124). Une modif
frontend n'est **pas terminée** tant qu'elle n'a pas été vue aux bons formats :
le bloc mobile de `globals.css` et les styles de base peuvent diverger sans
aucune erreur de build (piège de cascade documenté plus bas).

## Checklist minimale (à dérouler dans la preview, `npm run dev`)

1. **Viewports** — dans l'ordre :
   - 1440 (MacBook logique) puis 1920 si le layout est fluide ;
   - **les deux côtés de chaque breakpoint traversé** : 769 ET 767 (bloc
     mobile ≤768), 901 ET 899 (bloc en-tête ≤900). Un layout peut être
     correct à 375 et cassé À la frontière ;
   - 375 (mobile étroit).
2. **Débordement horizontal** — à chaque viewport :
   `document.documentElement.scrollWidth <= window.innerWidth`. Un dépassement
   de 1 px suffit à faire « flotter » la page au doigt.
3. **Tous les états dynamiques du composant**, pas seulement celui que les
   données du jour affichent. Pour la Une des Unes : 3/2/1 manchettes,
   traitement « breaking » noir, avec et sans illustration/audio. Forcer les
   états par une modif LOCALE temporaire (ex. `slice(0, 2)` dans le loader) —
   **jamais commitée** et **jamais** en éditant `public/data/` (règle dure #1).
4. **Empilement et alignements** : les colonnes deviennent une seule pile,
   les filets/séparateurs prévus pour le duo ne restent pas orphelins, les
   gauches s'alignent sur la Une principale.
5. **Interactions tactiles** si le composant en a (infobulles ⓘ, boutons de
   partage) : au minimum vérifier qu'elles restent atteignables (pas sous un
   overlay, pas hors écran).

## Pièges connus de ce repo

- **Ordre de cascade dans `globals.css`** (~4000 lignes, media queries
  dispersées) : une override mobile ne gagne que si elle est dans le **bloc
  `@media (max-width: 768px)` de fin de fichier** (il passe après les styles
  de base). Le bloc ≤900px du haut (~350) est AVANT la plupart des bases : n'y
  surcharger que ce qui est défini plus haut que lui.
- **`:first-child` ET `:last-child`** : un enfant devenu unique matche les
  deux règles du duo ; à spécificité égale, la déclarée en dernier gagne —
  imposer la propriété complète (pas seulement un côté du padding).
- **Captures d'écran flaky** dans la preview (compositing) : quand la capture
  sort vide, vérifier par le DOM et les styles calculés
  (`getComputedStyle(...)`, `getBoundingClientRect()`), et recharger la page
  avant de re-capturer depuis le haut.

## À la fin

- Cocher la case **« Vérification responsive »** du template de PR en listant
  les viewports et états testés (ex. « 1440/769/767/375 ; états 3-2-1 Unes »).
- Si un viewport n'a pas été testé, le dire explicitement dans la PR (FAIT vs
  VISION : ne jamais cocher une vérification non faite).
