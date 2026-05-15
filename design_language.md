# Design Language — La Vitrine démocratique

L'esthétique du site s'inspire du **journal imprimé classique** : papier jauni, encre sèche, règles fines, typographie editoriale rigoureuse. Chaque décision de design renforce cette métaphore — c'est une manchette, pas un dashboard.

---

## 1. Palette de couleurs

Toutes les couleurs sont définies comme CSS custom properties dans `:root` dans `app/globals.css`. Ne pas introduire de nouvelles valeurs hexadécimales en dehors de ce bloc.

### Couleurs de surface

| Token | Hex | Usage |
|-------|-----|-------|
| `--paper` | `#F3ECDD` | Fond de page principal — papier journal ivoire |
| `--paper-deep` | `#ECE3CF` | Fonds secondaires (pulse-band, encadrés, solitudes) |
| `--ink` | `#1C1917` | Texte primaire, bordures lourdes |
| `--ink-soft` | `#433F38` | Texte secondaire, deks, bylines |
| `--ink-softer` | `#6E685F` | Métadonnées, labels discrets, placeholders |
| `--rule` | `#C8BDA6` | Filets horizontaux standards |
| `--rule-faint` | `#DED3B9` | Filets très discrets, icônes inactives |

### Couleurs d'accent

| Token | Hex | Usage |
|-------|-----|-------|
| `--cordovan` | `#6B1E2A` | Accent principal : labels de section, tags, saillance, points live, éléments actifs |
| `--brass` | `#A07A3D` | Accent secondaire : tag « Expert », filets de résonance internationale |
| `--red` | `#A8302C` | Alertes, erreurs |
| `--green` | `#3D6B3A` | États de succès |
| `--amber` | `#B88A3D` | Usage ponctuel |

### Tags d'annotation

| Token | Valeur | Usage |
|-------|--------|-------|
| `--tag-new-bg` | `#6B1E2A` | Fond du badge « Nouveau » |
| `--tag-new-fg` | `#F3ECDD` | Texte du badge « Nouveau » |
| `--tag-keep-fg` | `#6B1E2A` | Texte du badge « Récurrent » (fond transparent) |
| `--tag-expert-fg` | `#A07A3D` | Texte du badge « Expert » (fond transparent, bordure brass) |

### Règles

- Pas de mode sombre. Le site est entièrement en mode papier clair.
- La couleur cordovan est **l'unique accent actif**. Brass sert de couleur tertiaire pour des cas précis (tag expert, résonance internationale).
- Les couleurs d'enjeu (treemap, `.une-enjeu`) passent via `--c` — une CSS variable locale définie par composant/data, jamais hardcodée dans le CSS global.
- Ne pas introduire de nouvelles couleurs sans discussion.

---

## 2. Typographie

Trois familles de polices, chacune avec un rôle strict. Toutes sont chargées depuis Google Fonts dans `app/layout.tsx`.

### Polices

| Police | Rôle | Caractéristiques |
|--------|------|-----------------|
| **Playfair Display** | Headlines, grands chiffres, drop caps | Serif d'affichage, 700–900, tracking négatif serré |
| **Source Serif 4** | Corps de texte, deks, captions | Serif de lecture, 400–700, italic disponible |
| **IBM Plex Mono** | UI labels, bylines, section labels, tags, métadonnées | Monospace, uppercase obligatoire, letter-spacing fort |

### Hiérarchie typographique

| Élément | Police | Taille | Poids | Notes |
|---------|--------|--------|-------|-------|
| Une principale (h1) | Playfair Display | 72px | 900 | `letter-spacing: -1.2px`, `line-height: 1.0` |
| Une secondaire (h2) | Playfair Display | 19–38px selon saillance | 700 | `letter-spacing: -0.1px à -0.5px` |
| Dek (chapeau) | Source Serif 4 | 19px | 400 italic | `line-height: 1.45`, `color: var(--ink-soft)` |
| Dek secondaire | Source Serif 4 | 14.5px | 400 italic | |
| Drop cap (lettrine) | Playfair Display | 56px | 900 | `color: var(--cordovan)`, `line-height: 0.85`, flottant à gauche |
| Grand chiffre (stat) | Playfair Display | 48px | 900 | `color: var(--cordovan)`, `letter-spacing: -1.1px` |
| Corps de texte | Source Serif 4 | 16px | 400 | `line-height: 1.5` |
| Caption italique | Source Serif 4 | 11–12px | 400 italic | `color: var(--ink-soft)` |
| Section label | IBM Plex Mono | 10px | 500 | uppercase, `letter-spacing: 0.3em`, cordovan |
| Byline / meta | IBM Plex Mono | 9–10px | 400 | uppercase, `letter-spacing: 0.12–0.22em` |
| Tags / badges | IBM Plex Mono | 8.5–10.5px | 500 | uppercase, `letter-spacing: 0.22–0.26em` |
| Labels UI (toggle) | IBM Plex Mono | 10px | 500 | uppercase, `letter-spacing: 0.22em` |

### Règles

- IBM Plex Mono est **toujours uppercase** avec un fort letter-spacing. Ne jamais l'utiliser en casse mixte pour les labels UI.
- Playfair Display est réservé à l'affichage éditorial (headlines, chiffres héro, drop caps). Pas pour les labels.
- Source Serif 4 en italic signale un dek, une citation ou une légende — jamais du texte de navigation.
- Fallback stack : `Georgia, 'Times New Roman', serif` pour le corps ; `monospace` pour IBM Plex Mono.

---

## 3. Filets et bordures

Les filets sont le langage structurel du journal imprimé. Leur poids et couleur signalent la hiérarchie.

| Usage | Valeur |
|-------|--------|
| Séparateur de section majeur (dessus de la une) | `border-top: 2px solid var(--ink)` |
| Double filet (`.dbl-rule`) | `border-top: 0.5px solid var(--rule); border-bottom: 0.5px solid var(--rule); height: 4px` |
| Filet standard entre colonnes | `border-right: 0.5px solid var(--rule)` |
| Filet d'enjeu coloré (`.une-enjeu`) | `border-bottom: 2px solid var(--c)` — couleur issue data |
| Filet résonance internationale | `border-bottom: 2px solid var(--brass)` |
| Bordure d'encadré discret | `border: 0.5px solid var(--rule)` |
| Toggle tab actif | `background: var(--ink); color: var(--paper)` — fond encre sur papier |

- Pas de `border-radius` sur les éléments éditoriaux (cartes, encadrés, tags saillance). Les coins sont droits — c'est délibéré.
- Pas de `box-shadow`. Le journal n'a pas d'ombre portée.

---

## 4. Composants récurrents

### Section label (`.section-label`)

IBM Plex Mono, 10px, `letter-spacing: 0.3em`, uppercase, `color: var(--cordovan)`. Marge top importante (52px) pour respirer. Contient parfois une date à droite (Playfair Display 700, 15px) et un toggle.

### Toggle de période (`.legend-toggle.inline`)

Bordure `0.5px solid var(--rule)`. Fond transparent, texte `var(--ink-soft)` au repos. Actif : `background: var(--ink); color: var(--paper)`. Pas d'arrondi.

### Tags d'annotation (`.anno`)

Trois variantes inline :
- `.anno.keep` — bordure `0.5px solid var(--rule)`, texte `var(--ink-softer)`
- `.anno.new` — fond cordovan, texte paper
- `.anno.expert` — bordure brass, texte brass

### Tags de saillance (`.saillance-tag`)

Trois niveaux :
- `.major` — fond `var(--ink)`, texte `var(--paper)`
- `.fort` — fond `var(--cordovan)`, texte `var(--paper)`
- `.notable` — fond `var(--brass)`, texte `var(--paper)`

IBM Plex Mono, 10.5px, `letter-spacing: 0.26em`, uppercase. Coins droits, pas de bordure.

### Dots de saillance (`.saillance-dots`)

Petits cercles 7×7px. `.d` = rempli cordovan (score atteint). `.e` = transparent avec bordure `var(--rule)` (score vide). Réduits à 5×5px dans les colonnes secondaires.

### Byline (`.byline`)

IBM Plex Mono, 10px, uppercase, `color: var(--ink-soft)`. Liens avec `border-bottom: 0.5px solid transparent` → hover `var(--cordovan)`. Séparateur `.sep` en `var(--rule)`.

### Pulse band (`.pulse-band`)

Fond `var(--paper-deep)`, filets `0.5px solid var(--rule)` haut et bas, centré, padding 22px / 19px. Contient le décompte live + icônes célestes.

### Décompte live (`.pulse-countdown`)

- Chiffre principal : Source Serif 4, 17px, `color: var(--cordovan)`, `font-variant-numeric: lining-nums tabular-nums`
- Secondes : IBM Plex Mono, 9px, `color: var(--ink-soft)`
- Point live : cercle 5×5px cordovan, animation `cd-pulse` 1s infini

### Drop cap / lettrine (`.dek-with-cap::first-letter`)

Playfair Display 900, 56px, `color: var(--cordovan)`, `line-height: 0.85`, flottant à gauche avec `padding: 6px 10px 0 0`.

---

## 5. Animations

| Élément | Animation | Durée | Easing |
|---------|-----------|-------|--------|
| Point live / musique | `cd-pulse` : `opacity 1→0.3`, `scale 1.05→0.6` | `1s` | `ease-in-out infinite` |
| Transitions de lien | `color`, `border-color` | `0.15s` | `ease` |
| Symboles « deux solitudes » | `left` (position horizontale) | `0.6s` | `ease` |

- Pas d'animations d'entrée (fade-in, slide-in) au chargement.
- Pas d'animations de scroll.
- Les seules transitions continues sont les points live.

---

## 6. Mise en page

- **Largeur max** : `1180px`, centré, `padding: 32px 60px 80px`
- **Grille une principale** (`.hero-trio`) : `2fr 1fr` en deux colonnes, séparées par `0.5px solid var(--rule)`
- La colonne principale (`.une-main`) occupe les deux rangées en `grid-area: main`
- Colonnes secondaires avec `border-left: 0.5px solid var(--rule)` et `padding-left: 26px`
- Pas de framework CSS. Toute la mise en page est en CSS natif dans `app/globals.css`

---

## 7. Ce qu'il ne faut pas faire

- Pas de coins arrondis (`border-radius`) sur les éléments éditoriaux
- Pas de `box-shadow`
- Pas de couleurs en dehors de la palette définie
- Pas d'IBM Plex Mono en casse mixte pour les labels
- Pas de polices de substitution (pas de system-ui, pas de sans-serif en display)
- Pas de mode sombre
- Pas de `transition: all` — toujours spécifier la propriété exacte
