import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

// La garde s'exécute sur un dépôt, pas sur une chaîne : elle marche depuis
// `process.cwd()`, lit sa dette dans `scripts/` et rend son verdict par un code
// de sortie. On la teste donc telle qu'elle tourne en CI — un faux dépôt jetable
// et un vrai `spawn` — plutôt qu'en exportant ses fonctions internes, ce qui
// aurait figé une découpe que le prochain correctif voudra peut-être bouger.
const GARDE = fileURLToPath(new URL("../scripts/garde_redaction.mjs", import.meta.url));

// `fichiers()` fait un `readdirSync` sur chacun des cinq dossiers surveillés :
// tous doivent exister, même vides, sinon la garde meurt avant d'analyser quoi
// que ce soit et le test passerait au vert pour la mauvaise raison.
const DOSSIERS = ["app", "components", "lib", "static-content", "public"];

function garde(fichiers: Record<string, string>): { code: number; sortie: string } {
  const racine = mkdtempSync(join(tmpdir(), "garde-redaction-"));
  try {
    for (const d of [...DOSSIERS, "scripts"]) mkdirSync(join(racine, d));
    writeFileSync(join(racine, "scripts/garde_redaction.baseline.json"), "[]\n");
    for (const [nom, contenu] of Object.entries(fichiers)) {
      writeFileSync(join(racine, nom), contenu);
    }
    const r = spawnSync(process.execPath, [GARDE], { cwd: racine, encoding: "utf8" });
    return { code: r.status ?? -1, sortie: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
}

const NB = " ";

// La primitive fautive telle qu'elle a été écrite dans `TreemapClient.tsx` :
// un littéral gabarit dont TOUT le texte lisible tient dans l'interpolation,
// et dont le seul caractère affiché après l'espace est le signe lui-même.
const formatPct = (espace: string) =>
  "function formatPct(value: number): string {\n" +
  '  return `${value.toFixed(1).replace(".", ",")}' +
  espace +
  '%`;\n' +
  "}\n";

// Régression du 2026-08-30 : l'insécable de `formatPct` a été remplacée par une
// espace ordinaire, `npm run garde-redaction` a répondu « rien de neuf », et la
// faute n'a été vue qu'à la relecture des octets. Cause : le span n'était pas
// jugé « prose », faute d'une lettre APRÈS l'espace — donc aucune règle ne le
// lisait, celle du pourcent comprise.
describe("garde-redaction — le texte affiché tient parfois tout entier dans l'interpolation", () => {
  it("mord sur une espace ordinaire avant « % » dans un littéral gabarit", () => {
    const { code, sortie } = garde({ "components/Treemap.tsx": formatPct(" ") });
    expect(sortie).toContain("espace ordinaire avant « % »");
    expect(code).toBe(1);
  });

  it("laisse passer la même primitive écrite avec une insécable", () => {
    const { code, sortie } = garde({ "components/Treemap.tsx": formatPct(NB) });
    expect(sortie).toContain("rien de neuf");
    expect(code).toBe(0);
  });

  it("mord sur une espace avant « ? » quand le mot vient de l'interpolation", () => {
    const { code, sortie } = garde({
      "components/Question.tsx": "const q = `${nom} ?`;\n",
    });
    expect(sortie).toContain("espace avant « ; », « ? » ou « ! »");
    expect(code).toBe(1);
  });

  // Trou distinct, trouvé en vérifiant si le premier valait pour les autres
  // signes : ici le span ÉTAIT retenu, mais la règle des deux-points n'acceptait
  // qu'une lettre avant l'espace, jamais le caractère qui remplace une
  // interpolation — alors que celle du pourcent, elle, l'acceptait déjà.
  it("mord sur une espace ordinaire avant « : » précédée d'une interpolation", () => {
    const { code, sortie } = garde({
      "components/Sommet.tsx": "const titre = `${label} : ${valeur}`;\n",
    });
    expect(sortie).toContain("espace ordinaire avant « : »");
    expect(code).toBe(1);
  });
});

// L'élargissement doit rester une affaire de TEXTE. Une garde qui se met à
// dénoncer du code est une garde qu'on finit par désarmer.
describe("garde-redaction — ce qui n'est pas du texte affiché reste hors de portée", () => {
  it("ne dénonce ni un modulo, ni une largeur CSS, ni un nom de classe conditionnel", () => {
    const { code, sortie } = garde({
      "lib/calculs.ts":
        "const reste = total % 2;\n" +
        'const style = "width: 100%";\n' +
        "const cls = `gt-tile ${actif ? \"on\" : \"off\"}`;\n",
    });
    expect(sortie).toContain("rien de neuf");
    expect(code).toBe(0);
  });
});
