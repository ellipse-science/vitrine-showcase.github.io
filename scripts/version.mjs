// Source unique du LIBELLÉ de version affiché sur le site.
//
// `package.json` est la source de vérité de la version elle-même (bumpée en CI,
// cf. .github/workflows/version-bump.yml) ; ce module dit comment on l'écrit à
// l'écran, et il est partagé par les deux chemins de rendu :
//
//   · les pages Next  → components/sections/RawMaquette.tsx, qui substitue
//     `__VERSION__` dans les chunks de static-content/ au moment du rendu ;
//   · les pages HTML statiques de public/ → scripts/postbuild.mjs, qui fait la
//     même substitution dans out/ après `next build`.
//
// Les deux chemins existent parce que public/ est recopié VERBATIM par
// `output: export` : une page statique ne traverse jamais React, donc rien ne
// pouvait y remplacer quoi que ce soit. C'est ce trou qui a laissé la page
// Méthodologie afficher « Bêta v1.9.7 » pendant que le site était en 2.23.0.
//
//   2.0.0-beta.3 → « Bêta v2.0.0 (b3) »  (compteur bêta visible)
//   2.0.0        → « v2.0.0 »             (hors bêta)
/**
 * @param {string} version - semver de package.json (ex. "2.23.0-beta.1").
 * @returns {string} Le libellé affiché à l'écran (ex. "Bêta v2.23.0 (b1)").
 */
export function formatVersion(version) {
  const [core, pre] = version.split("-");
  const beta = pre?.match(/^beta\.(\d+)$/);
  return beta ? `Bêta v${core} (b${beta[1]})` : `v${core}`;
}

/** Le jeton que les gabarits portent en attendant le build. */
export const VERSION_PLACEHOLDER = "__VERSION__";
