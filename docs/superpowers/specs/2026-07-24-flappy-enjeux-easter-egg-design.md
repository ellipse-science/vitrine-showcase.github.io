# Flappy Enjeux — easter egg (design)

Date : 2026-07-24
Module : « De quoi parle-t-on? » (enjeux saillants) — `components/interactive/TreemapClient.tsx`

## But

Un easter egg caché : quand le module est à l'écran, le **code Konami**
(↑ ↑ ↓ ↓ ← → ← → B A) déverrouille un « mode secret ». La vue bascule sur l'onglet
**Ce mois**, dont le panneau se transforme en niveau de **Flappy Bird** où les obstacles
sont les 12 enjeux du module. Game over → saisie de **3 initiales** façon arcade →
**tableau des meilleurs scores local** (top 10). Aucun comportement normal n'est modifié
tant que le code n'est pas saisi.

## Décisions (validées avec l'utilisateur)

- **Déclencheur** : code Konami, actif tant que `TreemapClient` est monté.
- **Thème** : les obstacles (tuyaux) sont les 12 enjeux — couleur de l'enjeu + nom court
  (`tile.issueFr`) — parcourus en boucle. L'oiseau est l'emoji **📰**.
- **Scores** : **local uniquement** (`localStorage`), pas de backend. Site en export statique
  (GitHub Pages / Cloudflare Pages) — un tableau global nécessiterait un datastore externe,
  écarté. 3 initiales A–Z, top 10.

## Architecture (isolation)

- **`components/interactive/FlappyEnjeux.tsx`** (nouveau, client) — possède le jeu (canvas +
  boucle rAF), l'écran de game over, la saisie des initiales et le tableau des scores.
  Reçoit `tiles: TreemapIssueTile[]` (pour couleurs + noms) et `onExit: () => void`.
- **`components/interactive/useKonamiCode.ts`** (nouveau) — hook : écoute `keydown` sur
  `window`, matche la séquence, appelle `onUnlock`. Nettoyé au démontage.
- **`TreemapClient.tsx`** — modifications minimales : état `secret` ; `useKonamiCode(() => {
  setPeriod("month"); setSecret(true); })` ; quand `secret && period === "month"`, rendre
  `<FlappyEnjeux tiles={current.tiles} onExit={() => setSecret(false)} />` à la place de
  `<IssuesRankChart/>`. `Échap` ou un bouton « Quitter ✕ » en jeu appelle `onExit`.
- **`lib/flappy.ts`** (nouveau) — helpers **purs** et testables, sans React ni DOM :
  - `matchKonami(buffer: string[]): boolean` (ou un petit réducteur d'index de séquence)
  - `stepPhysics(state, dt, flap): state` — gravité, impulsion, avance des tuyaux
  - `hitTest(bird, pipes, bounds): boolean` — collision tuyau / sol / plafond
  - `insertScore(board, entry): Board` — insertion triée décroissante, top 10
  - `sanitizeInitials(raw): string` — 3 lettres A–Z majuscules, petite liste anti-grossièretés
- **`app/globals.css`** — règles préfixées `.flappy-*`, dimensionnées comme le panneau du
  bump chart pour un remplacement « sur place ». Aucune dépendance nouvelle.

## Rendu

Un seul `<canvas>` + `requestAnimationFrame` (mouvement continu fluide, une surface de dessin)
plutôt que des nœuds DOM/SVG. Le canvas vit dans le composant client. **SSR-safe** : tout accès
à `window` / `localStorage` / `canvas` est gardé (effets, jamais au rendu serveur). L'oiseau 📰
est dessiné via `ctx.fillText`.

## Jeu

- Oiseau 📰 : la gravité le fait descendre ; **battre d'aile** (Espace / ↑ / clic / tap) donne
  une impulsion vers le haut. Mobile = tap sur le canvas.
- Tuyaux : défilent de droite à gauche avec un intervalle (gap) ; chaque paire est peinte
  d'une couleur d'enjeu et étiquetée du nom court, en cyclant sur les 12. Franchir une paire = +1.
- Collision (tuyau, sol, plafond) → game over. Bouton « Rejouer » relance.
- Boucle : `rAF` avec `dt` borné ; en pause quand `document.hidden`. Respecte
  `prefers-reduced-motion` en affichant un court avertissement mais laisse jouer.

## Game over + tableau des scores (local)

- Afficher le score ; s'il entre dans le top 10 local, demander **3 lettres**
  (`sanitizeInitials`). Enregistrer dans `localStorage["vitrine-flappy-scores"]` =
  `[{ initials, score, date }]`, trié décroissant, coupé à 10 (`insertScore`).
- Afficher le classement (rang · initiales · score), en surlignant l'entrée fraîche.
- `localStorage` illisible/plein → dégrade en tableau de session (try/catch), le jeu reste jouable.

## Accessibilité

- Canvas avec `role="img"` + `aria-label` décrivant l'état ; instructions textuelles visibles
  (« Espace / tap pour voler, Échap pour quitter »). Saisie des initiales = `<input>` réel
  (clavier, `maxLength=3`, filtré), pas seulement un sélecteur canvas. Bouton « Quitter » focusable.

## Tests (vitest)

`lib/flappy.ts` couvert unitairement : `matchKonami` (bonnes/mauvaises séquences, resets),
`stepPhysics` (gravité, impulsion, avance), `hitTest` (dans le gap vs collision, bords),
`insertScore` (tri, coupe à 10, égalités), `sanitizeInitials` (casse, non-lettres, filtre).
La boucle canvas et le rendu React ne sont pas testés unitairement (effets de bord visuels).

## Non-régression

- Ne rend le jeu que sous mode secret ; écouteur `keydown` nettoyé au démontage ; aucune
  dépendance ajoutée ; vues par défaut et données du mois (backfill) inchangées.
- Périmètre : nouveaux fichiers + une greffe minimale dans `TreemapClient` + un bloc CSS `.flappy-*`.

## Livraison

Branche `feat/easter-egg-flappy-enjeux`, PR vers `main`. Vérifs : `tsc --noEmit`,
`next build`, `vitest run`, essai manuel (Konami → jeu → score → tableau), desktop + mobile.
Étiquettes module/signalement selon le protocole du dépôt ; provenance IA (trailer `Assisted-by`),
jamais de co-auteur. Registre méthodologie : easter egg sans impact données → aucune mise à jour métho.
