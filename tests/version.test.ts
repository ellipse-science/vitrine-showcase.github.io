import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { formatVersion, VERSION_PLACEHOLDER } from "@/scripts/version.mjs";

import pkg from "../package.json";

const PUBLIC_DIR = path.resolve(process.cwd(), "public");

function htmlFiles(dir: string): string[] {
  // Trié : l'ordre de readdirSync() n'est pas garanti d'un système de
  // fichiers à l'autre, et il alimente it.each() plus bas — un ordre
  // instable ferait bouger les noms de cas de test sans raison.
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  return entries.flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(full);
    return e.name.endsWith(".html") ? [full] : [];
  });
}

describe("formatVersion", () => {
  it("montre le compteur bêta", () => {
    expect(formatVersion("2.23.0-beta.1")).toBe("Bêta v2.23.0 (b1)");
    expect(formatVersion("2.0.0-beta.3")).toBe("Bêta v2.0.0 (b3)");
  });

  it("tombe le préfixe hors bêta", () => {
    expect(formatVersion("2.23.0")).toBe("v2.23.0");
  });
});

// LE GARDE. Une page statique de public/ ne traverse pas React : rien ne peut y
// remplacer un numéro écrit en dur, et il se périme au premier bump sans que
// personne ne le voie. C'est arrivé — la page Méthodologie a annoncé
// « Bêta v1.9.7 » pendant que le site tournait en 2.23.0, soit treize versions
// mineures d'écart, sur la page qui EST le contrat public.
//
// Le garde porte donc sur la seule chose qui compte : plus aucun numéro de
// version en dur dans public/. Le jeton `__VERSION__` est substitué par
// scripts/postbuild.mjs après le build.
describe("aucune version en dur dans public/", () => {
  const fichiers = htmlFiles(PUBLIC_DIR);

  it("trouve bien des pages statiques à surveiller", () => {
    expect(fichiers.length).toBeGreaterThan(0);
  });

  it.each(fichiers.map((f) => path.relative(PUBLIC_DIR, f)))("%s", (rel) => {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, rel), "utf8");
    // « Bêta v1.9.7 », « v2.23.0 (b1) » — la forme que produit formatVersion.
    const enDur = html.match(/(?:Bêta\s+)?v\d+\.\d+\.\d+(?:\s+\(b\d+\))?/g);
    expect(enDur, `version en dur : utilisez ${VERSION_PLACEHOLDER}`).toBeNull();
  });

  it("la page Méthodologie porte le jeton", () => {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, "methodologie", "index.html"), "utf8");
    expect(html).toContain(VERSION_PLACEHOLDER);
  });
});

// La substitution elle-même, sur la version RÉELLE du dépôt : c'est elle qui
// atterrit dans out/, et un jeton qui traverserait le build sans être remplacé
// afficherait « __VERSION__ » en ligne — plus visible qu'un numéro périmé, mais
// pas plus juste.
describe("substitution", () => {
  it("remplace le jeton par la version du package", () => {
    const html = `<span>Édition Québec · ${VERSION_PLACEHOLDER}</span>`;
    const rendu = html.replaceAll(VERSION_PLACEHOLDER, formatVersion(pkg.version));
    expect(rendu).not.toContain(VERSION_PLACEHOLDER);
    expect(rendu).toContain(pkg.version.split("-")[0]);
  });
});
