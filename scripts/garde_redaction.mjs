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
// texte JSX de `app/`, `components/`, `lib/`, plus le HTML de `static-content/`.
// Pas le rendu (`out/`), qui contient les manchettes des médias : celles-là ne
// sont pas de notre plume et se normalisent au rendu, pas à la source.
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

const DOSSIERS = ["app", "components", "lib", "static-content"];
const EXTENSIONS = [".ts", ".tsx", ".html"];

// `changelog.json` est de l'HISTORIQUE : ses notes sont écrites dans le corps
// des PR et ajoutées sur `main` par un workflow, jamais relues dans une PR. La
// garde ne peut donc rien y empêcher — c'est un trou connu, documenté dans la
// PR d'installation, pas un oubli.
const EXCLUS = [/node_modules/, /\.next/, /changelog\.json$/];

const ESPACES = "\\u0020\\u00a0\\u202f\\u2009";

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
    code: "insecable-pourcent",
    motif: new RegExp(`\\d[\\u0020]%`, "u"),
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
    // Les bornes excluent `-` et `_` : `unes-jour` et `une-des-unes` sont des
    // noms de classe CSS et d'ancre, pas de la prose. Le « à » accepte les deux
    // casses, sinon le « À la une » du treemap passait sous le radar.
    code: "une-minuscule",
    motif: /(?<![\p{L}\-_])(unes|[àÀ] la une)(?![\p{L}\-_])/u,
    quoi: "« une / unes » en minuscule",
    exemple: "« Une », « les Unes », « à la Une ». Arbitrage d'Adrien du 2026-08-10 : la locution prend aussi la majuscule.",
  },
];

// ── Extraction du texte que nous écrivons ────────────────────────────────────

/** Retire les commentaires. Ce qui est dans un commentaire n'est pas affiché,
 *  donc la typographie n'y est pas une faute — et les commentaires de ce repo
 *  sont longs et pleins de « 24 h » et de tirets. Les remplacer par des espaces
 *  (et non les supprimer) préserve les numéros de ligne. */
function sansCommentaires(src, estHtml) {
  const vide = (m) => m.replace(/[^\n]/g, " ");
  if (estHtml) return src.replace(/<!--[\s\S]*?-->/g, vide);
  return src
    .replace(/\/\*[\s\S]*?\*\//g, vide)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + vide(m.slice(p.length)));
}

/** Les spans de texte que le visiteur peut lire : littéraux de chaîne et nœuds
 *  de texte JSX. Travailler sur des SPANS et non sur des lignes entières est ce
 *  qui rend la règle « insécable avant : » utilisable — sinon chaque ternaire
 *  `cond ? a : b` et chaque annotation TypeScript la ferait hurler. */
function spansDeTexte(src, estHtml) {
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
    const estCode = /\)\s*[;,]|=>|\]\s*[);]|\bif\s*\(|\breturn\b|\b(const|let|function)\s/u.test(texte);
    if (estProse && !estCode) spans.push({ texte, index });
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
  for (const m of src.matchAll(/>([^<>{}]+)</g)) pousse(m[1], m.index + 1);
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

  for (const span of spansDeTexte(nettoye, estHtml)) {
    const numero = ligneDe(nettoye, span.index);
    if (estDerogee(lignes, numero)) continue;
    // Le contenu d'une interpolation `${…}` est du CODE, pas du texte affiché :
    // le `:` de `${n > 1 ? "s" : ""}` n'a jamais besoin d'insécable. On le
    // neutralise avant d'appliquer les règles, sans changer la longueur du span.
    const prose = span.texte.replace(/\$\{[^{}]*\}/gu, (m) => "·".repeat(m.length));
    for (const regle of REGLES) {
      const m = prose.match(regle.motif);
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
  const dette = toutes.map(cle).sort();
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
const corrigees = dette.filter((k) => !vues.has(k));

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
