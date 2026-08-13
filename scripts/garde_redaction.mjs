#!/usr/bin/env node
// Garde-fou typographique — AGENTS.md règle #7.
//
// La règle de rédaction existait depuis le 14 juillet, mais rien ne la
// vérifiait : ni CI, ni hook, ni test. Résultat mesuré le 2026-08-10 sur le
// site rendu — 27 heures espacées, 272 tirets cadratins, 424 deux-points sans
// insécable. La PR #434, mergée la veille, en avait ajouté sa part. Cette garde
// existe pour que la prochaine PR ne puisse plus en réintroduire.
//
// CE QU'ELLE LIT : le texte que NOUS écrivons — littéraux de chaîne et nœuds de
// texte JSX de `app/`, `components/`, `lib/`, plus le HTML de `static-content/`
// et de `public/` (page Méthodologie et docs vivantes du pipeline, que la règle
// dure #6 interdit de laisser périmer). Pas le rendu (`out/`), qui contient les
// manchettes des médias : celles-là ne sont pas de notre plume et se
// normalisent au rendu, pas à la source.
//
// SOURCE DE VÉRITÉ des règles : la page Notion « Guide de rédaction
// CAPP/CLESSN », dont `.claude/skills/redaction-editoriale/SKILL.md` est le
// miroir. On n'ajoute pas une règle ici sans qu'elle existe là-bas.
//
// DETTE EXISTANTE : `scripts/garde_redaction.baseline.json` fige les violations
// déjà en place le jour de l'installation. La garde échoue sur toute violation
// NOUVELLE, et échoue AUSSI si le fichier de dette contient des entrées
// obsolètes — pour que la dette ne puisse que rétrécir (cliquet).

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RACINE = process.cwd();
const BASELINE = "scripts/garde_redaction.baseline.json";

const DOSSIERS = ["app", "components", "lib", "static-content", "public"];
const EXTENSIONS = [".ts", ".tsx", ".html"];

// `changelog.json` est de l'HISTORIQUE : ses notes sont écrites dans le corps
// des PR et ajoutées sur `main` par un workflow, jamais relues dans une PR. La
// garde ne peut donc rien y empêcher — c'est un trou connu, documenté dans la
// PR d'installation, pas un oubli.
const EXCLUS = [/node_modules/, /\.next/, /changelog\.json$/];

const ESPACES = "\\u0020\\u00a0\\u202f\\u2009";

// Caractère de remplissage des interpolations `${…}` (voir `analyse`). Le
// contenu d'une interpolation est du CODE, mais ce qu'elle PRODUIT est du
// texte affiché : une règle qui suit un nombre doit donc pouvoir s'accrocher
// à ce caractère, sinon `${part} %` échappe à la garde alors que `95 %` est
// pris. Nommé ici parce que les règles et le masquage doivent parler du même
// caractère.
const MASQUE = "·";

// ── Les règles ────────────────────────────────────────────────────────────────
// `exemple` sert au message d'erreur : on montre la forme correcte, sinon la
// personne qui lit l'échec doit aller chercher la règle ailleurs.
const REGLES = [
  {
    code: "heure-espacee",
    motif: new RegExp(`\\d[${ESPACES}]+h\\b`, "u"),
    quoi: "heure avec une espace avant le « h »",
    exemple: "« 16h », « 14h30 » — jamais « 16 h ». Écart à l'OQLF ASSUMÉ par le guide Notion.",
  },
  {
    code: "tiret-cadratin",
    motif: /—/u,
    quoi: "tiret cadratin (—)",
    exemple: "deux phrases, un deux-points ou des parenthèses (anti-style IA, demande d'Adrien 2026-07-13).",
  },
  {
    code: "insecable-deux-points",
    motif: new RegExp(`\\p{L}[\\u0020]:(?=[${ESPACES}]|$)`, "u"),
    quoi: "espace ordinaire avant « : »",
    exemple: "une insécable — `&nbsp;` en HTML/JSX, `\\u00a0` dans une chaîne.",
  },
  {
    // Le nombre est presque toujours INTERPOLÉ dans ce repo (`${part} %`) : à
    // n'accepter qu'un chiffre littéral, la règle ratait 16 spans sur 22.
    // D'où `MASQUE`, le caractère qui remplace une interpolation. Surtout pas
    // « n'importe quoi sauf une espace » : ça attraperait un modulo.
    code: "insecable-pourcent",
    motif: new RegExp(`[\\d${MASQUE}][\\u0020]%`, "u"),
    quoi: "espace ordinaire avant « % »",
    exemple: "une insécable — `&nbsp;%`.",
  },
  {
    code: "insecable-guillemets",
    motif: new RegExp(`«[\\u0020]\\S|\\S[\\u0020]»`, "u"),
    quoi: "espace ordinaire dans des guillemets français",
    exemple: "des insécables des deux côtés, sinon un « ou un » se retrouve seul en début de ligne (issue #384).",
  },
  {
    // L'autre moitié de la règle #7, jamais outillée jusqu'ici : l'insécable
    // avant `:` et `%` l'était, « pas d'espace avant `; ? !` » non. Toute
    // espace est fautive, y compris l'insécable — c'est la norme québécoise,
    // à l'inverse de la France. En HTML l'insécable s'écrit `&nbsp;`, une
    // ENTITÉ : la classe de caractères ne la voit pas, il faut la nommer.
    code: "espace-avant-ponctuation",
    motif: new RegExp(`(?:[${ESPACES}]|&nbsp;|&#160;|&#xa0;|&thinsp;|&#8201;|&#8239;|&#x202f;)[;?!]`, "iu"),
    quoi: "espace avant « ; », « ? » ou « ! »",
    exemple: "rien du tout avant le signe : « Deux solitudes? », « 1972; Iyengar ». Norme québécoise, pas française.",
  },
  {
    // Les bornes excluent `-` et `_` : `unes-jour` et `une-des-unes` sont des
    // noms de classe CSS et d'ancre, pas de la prose. Le « à » accepte les deux
    // casses, sinon le « À la une » du treemap passait sous le radar.
    code: "une-minuscule",
    motif: /(?<![\p{L}\-_])(unes|[àÀ] la une)(?![\p{L}\-_])/u,
    quoi: "« une / unes » en minuscule",
    exemple: "« Une », « les Unes », « à la Une ». Arbitrage d'Adrien du 2026-08-10 : la locution prend aussi la majuscule.",
  },
];

// Les noms de projets ne prennent JAMAIS l'italique (guide Notion, entrée « Les
// projets de la CLESSN » : « Ne jamais mettre les projets en italique »).
//
// Cette règle ne peut PAS se juger sur un span de texte, contrairement à toutes
// les autres : l'italique est porté par le BALISAGE, que l'extraction de spans
// retire justement. Elle a donc sa propre passe, sur la source.
//
// ⚠️ Conflit connu avec une autre règle du même guide : l'entrée « Citations et
// bibliographie » impose le style APA, qui met le titre de l'œuvre en italique.
// Une référence bibliographique correcte déclenche donc cette règle à tort —
// d'où la dérogation `garde-redaction: ok (…)` posée sur la citation de la page
// Méthodologie. Si le cas se répand, c'est le guide qu'il faut trancher.
const PROJETS = [
  "La Vitrine démocratique",
  "Vitrine démocratique",
  "Projet Quorum",
  "Datagotchi",
  "Déméter",
  "Radar\\+",
  "Civimètre\\+",
  "Agora\\+",
  "Polimètre",
  "Global-ES",
];
const PROJET_ITALIQUE = new RegExp(`<(em|i)\\b[^>]*>[^<]*(?:${PROJETS.join("|")})[^<]*</\\1>`, "giu");

// ── Extraction du texte que nous écrivons ────────────────────────────────────

/** Retire les commentaires. Ce qui est dans un commentaire n'est pas affiché,
 *  donc la typographie n'y est pas une faute — et les commentaires de ce repo
 *  sont longs et pleins de « 24 h » et de tirets. Les remplacer par des espaces
 *  (et non les supprimer) préserve les numéros de ligne. */
function sansCommentaires(src, estHtml) {
  const vide = (m) => m.replace(/[^\n]/g, " ");
  // En HTML, `<script>` et `<style>` tombent avec les commentaires : leur
  // contenu vit entre un `>` et un `<`, donc l'extracteur le prend pour du
  // texte affiché. Un `!important` de CSS et un ternaire de JavaScript
  // deviennent alors des fautes de typographie qu'on ne peut pas corriger.
  if (estHtml) {
    return src
      .replace(/<!--[\s\S]*?-->/g, vide)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, vide)
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, vide);
  }
  return src
    .replace(/\/\*[\s\S]*?\*\//g, vide)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + vide(m.slice(p.length)));
}

/** Neutralise les interpolations `${…}` sans changer la longueur du texte. Ce
 *  qu'elles contiennent est du CODE (le `:` de `${n > 1 ? "s" : ""}` n'a jamais
 *  besoin d'insécable), mais ce qu'elles PRODUISENT est du texte affiché : d'où
 *  un caractère de remplissage auquel une règle peut encore s'accrocher, et non
 *  une suppression. */
function masqueInterpolations(texte) {
  // Du plus profond vers l'extérieur : `${a ? `${b}` : ""}` garde des accolades
  // après une seule passe, et son ternaire ressort en faute de typographie.
  let prose = texte;
  for (let i = 0; i < 5; i++) {
    const suivant = prose.replace(/\$\{[^{}]*\}/gu, (m) => MASQUE.repeat(m.length));
    if (suivant === prose) break;
    prose = suivant;
  }
  // L'appariement naïf des accents graves coupe parfois le span au milieu d'une
  // interpolation : la queue qui reste est du code privé de son `}`.
  return prose.replace(/\$\{[^{}]*$/u, (m) => MASQUE.repeat(m.length));
}

/** Les spans de texte que le visiteur peut lire : littéraux de chaîne et nœuds
 *  de texte JSX. Travailler sur des SPANS et non sur des lignes entières est ce
 *  qui rend la règle « insécable avant : » utilisable — sinon chaque ternaire
 *  `cond ? a : b` et chaque annotation TypeScript la ferait hurler. */
function spansDeTexte(src, estHtml, estJsx) {
  const spans = [];
  const pousse = (texte, index) => {
    if (!texte) return;
    // Du vrai texte, pas un identifiant : au moins une lettre et une espace, ou
    // un caractère typographique français. Écarte `className`, les chemins
    // d'import, les clés d'objet et les noms de classes CSS.
    const estProse = /[\p{L}].*[ ].*[\p{L}]/u.test(texte) || /[«»—]/u.test(texte);
    // L'appariement des accents graves est naïf : un littéral gabarit contenant
    // du code apparie parfois deux backticks qui n'ont rien à voir, et le span
    // avale des dizaines de lignes de JavaScript. Ces spans-là ne sont pas du
    // texte affiché, et les laisser passer produisait des faux positifs
    // impossibles à corriger pour qui lit l'échec.
    // Le test porte sur le texte INTERPOLATIONS MASQUÉES, jamais sur le brut :
    // `Son sommet : ${label ?? "plus tôt"}` est du texte affiché qui contient
    // du code, et le juger sur le brut le faisait disparaître de la garde avec
    // ses vraies fautes. Une fois masqué, il ne reste du code que dans les
    // spans qui n'étaient pas du texte du tout.
    // Les deux derniers motifs servent la règle « espace avant ; ? ! » : un
    // ternaire `x ? "a" : b` a une espace avant son `?`, et aucune des règles
    // précédentes ne s'y accrochait. Sans eux, la garde dénonce du code.
    const prose = masqueInterpolations(texte);
    const estCode =
      /\)\s*[;,]|=>|\]\s*[);]|\bif\s*\(|\breturn\b|\b(const|let|function)\s/u.test(prose) ||
      /&&|\|\||\?\?|===|!==/u.test(prose) ||
      /\?\s*["'][^"']*["']\s*:/u.test(prose);
    if (estProse && !estCode) spans.push({ texte, prose, index });
  };

  if (estHtml) {
    for (const m of src.matchAll(/>([^<>]+)</g)) pousse(m[1], m.index + 1);
    for (const m of src.matchAll(/(?:title|aria-label|alt|placeholder)="([^"]*)"/g)) {
      pousse(m[1], m.index);
    }
    return spans;
  }

  // Littéraux de chaîne, les trois formes, en tenant compte des échappements.
  for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/gs)) {
    pousse(m[1] ?? m[2] ?? m[3], m.index);
  }
  // Nœuds de texte JSX : `>texte<`. Grossier mais suffisant, et les faux
  // positifs (comparaisons `a > b < c`) ne ressemblent pas à de la prose.
  // Réservé aux `.tsx` : un `.ts` n'a pas de JSX, donc ce motif n'y récolte
  // QUE des comparaisons — d'où cinq ternaires dénoncés comme fautifs.
  if (estJsx) for (const m of src.matchAll(/>([^<>{}]+)</g)) pousse(m[1], m.index + 1);
  return spans;
}

/** Une PR peut avoir une raison légitime de déroger : le séparateur du
 *  `<title>` (exception ratifiée par la PR #246) ou le tiret employé comme
 *  glyphe de donnée absente. On l'écrit alors en toutes lettres, sur la ligne
 *  ou juste au-dessus : en JSX, un commentaire de fin de ligne oblige à une
 *  accolade d'expression qui casse la lecture du markup. La dérogation reste
 *  ainsi une décision lisible en revue, et non un contournement silencieux. */
const DEROGATION = /garde-redaction:\s*ok/;

function estDerogee(lignes, numero) {
  return DEROGATION.test(lignes[numero - 1] ?? "") || DEROGATION.test(lignes[numero - 2] ?? "");
}

function ligneDe(src, index) {
  return src.slice(0, index).split("\n").length;
}

function analyse(chemin) {
  const src = readFileSync(chemin, "utf8");
  const estHtml = chemin.endsWith(".html");
  const nettoye = sansCommentaires(src, estHtml);
  const lignes = src.split("\n");
  const trouvailles = [];

  for (const span of spansDeTexte(nettoye, estHtml, chemin.endsWith(".tsx"))) {
    const numero = ligneDe(nettoye, span.index);
    if (estDerogee(lignes, numero)) continue;
    for (const regle of REGLES) {
      const m = span.prose.match(regle.motif);
      if (!m) continue;
      trouvailles.push({
        fichier: relative(RACINE, chemin),
        ligne: numero,
        code: regle.code,
        quoi: regle.quoi,
        exemple: regle.exemple,
        extrait: span.texte.trim().slice(0, 100),
      });
    }
  }

  // Passe HORS SPAN — voir PROJET_ITALIQUE : l'italique vit dans le balisage,
  // que `spansDeTexte` a retiré. Aucune règle par span ne peut le voir.
  for (const m of nettoye.matchAll(PROJET_ITALIQUE)) {
    const numero = ligneDe(nettoye, m.index);
    if (estDerogee(lignes, numero)) continue;
    trouvailles.push({
      fichier: relative(RACINE, chemin),
      ligne: numero,
      code: "projet-italique",
      quoi: "nom de projet en italique",
      exemple:
        "les projets ne prennent jamais l'italique (guide Notion). Exception : une référence bibliographique en style APA — dans ce cas, poser « garde-redaction: ok (citation APA) ».",
      extrait: m[0].trim().slice(0, 100),
    });
  }

  return trouvailles;
}

function fichiers(dossier) {
  const out = [];
  const marche = (d) => {
    for (const nom of readdirSync(d)) {
      const p = join(d, nom);
      if (EXCLUS.some((r) => r.test(p))) continue;
      if (statSync(p).isDirectory()) marche(p);
      else if (EXTENSIONS.some((e) => p.endsWith(e))) out.push(p);
    }
  };
  marche(dossier);
  return out;
}

// ── Cliquet ───────────────────────────────────────────────────────────────────
// L'identité d'une violation exclut le NUMÉRO DE LIGNE : sinon la moindre ligne
// ajoutée plus haut dans le fichier ferait « bouger » toute la dette et la
// garde crierait sur du code que personne n'a touché.
const cle = (t) => `${t.fichier}::${t.code}::${t.extrait}`;

const toutes = DOSSIERS.flatMap((d) => fichiers(join(RACINE, d))).flatMap(analyse);

if (process.argv.includes("--ecrire-baseline")) {
  // Dédupliquer : la clé exclut le numéro de ligne, donc deux occurrences de la
  // même chaîne dans un même fichier (« À la une » vu deux fois dans le
  // treemap) produisent la MÊME clé. Sans ce `Set`, le compteur « Dette figée »
  // annonce plus de violations qu'il n'y a d'entrées distinctes, et le cliquet
  // devient illisible : corriger l'une des deux occurrences ne fait rien
  // rétrécir. Mesuré à l'installation : 79 entrées pour 76 clés distinctes.
  const dette = [...new Set(toutes.map(cle))].sort();
  writeFileSync(join(RACINE, BASELINE), JSON.stringify(dette, null, 2) + "\n");
  console.log(`Dette figée : ${dette.length} violations dans ${BASELINE}`);
  process.exit(0);
}

let dette = [];
try {
  dette = JSON.parse(readFileSync(join(RACINE, BASELINE), "utf8"));
} catch {
  console.error(`Fichier de dette absent. Le créer : node scripts/garde_redaction.mjs --ecrire-baseline`);
  process.exit(1);
}
const detteSet = new Set(dette);
const vues = new Set(toutes.map(cle));

const nouvelles = toutes.filter((t) => !detteSet.has(cle(t)));
// Sur `detteSet` et non sur `dette` : une baseline écrite par une version
// antérieure du script peut porter des doublons, qui compteraient deux fois
// dans le message « n entrée(s) ne correspondent plus à rien ».
const corrigees = [...detteSet].filter((k) => !vues.has(k));

for (const t of nouvelles) {
  console.error(`✘ ${t.fichier}:${t.ligne} — ${t.quoi}`);
  console.error(`    ${t.extrait}`);
  console.error(`    Écrire plutôt : ${t.exemple}`);
}

if (corrigees.length) {
  console.error(`\n${corrigees.length} entrée(s) de dette ne correspondent plus à rien.`);
  console.error(`C'est une bonne nouvelle : régénérer le fichier pour que la dette rétrécisse.`);
  console.error(`  node scripts/garde_redaction.mjs --ecrire-baseline`);
}

if (nouvelles.length || corrigees.length) {
  console.error(
    `\nRègles : .claude/skills/redaction-editoriale/SKILL.md` +
      `\nDérogation légitime : ajouter « garde-redaction: ok (raison) » en commentaire sur la ligne.`
  );
  process.exit(1);
}

console.log(`Garde rédaction : rien de neuf. Dette restante : ${dette.length} violations à résorber.`);
