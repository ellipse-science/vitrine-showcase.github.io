import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Exception d'environnement par table (scripts/tables.json, clé `env`) : une
// table lue dans un datamart précis quel que soit DATAMART_ENV. Le cas :
// polimetre-promesses-neuves n'est pas activé en PROD, ses tables n'existent
// qu'en DEV, et le site les affiche déjà — sans l'exception, la bascule du site
// sur PROD faisait disparaître le mode « campagne » le jour même.

const lire = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
type Entry = { name: string; enabled: boolean; env?: string; api?: boolean };
const tables = (JSON.parse(lire("scripts/tables.json")) as { tables: Entry[] }).tables;
const fetchData = lire("scripts/fetch_data.R");

describe("exception d'environnement par table", () => {
  it("`env` ne prend que DEV ou PROD", () => {
    for (const t of tables) {
      if (t.env !== undefined) expect(["DEV", "PROD"]).toContain(t.env);
    }
  });

  it("polimetre_promesses_neuves est lue en DEV tant que le raffineur n'est pas activé en PROD", () => {
    const t = tables.find((x) => x.name === "polimetre_promesses_neuves");
    expect(t?.enabled).toBe(true);
    expect(t?.env).toBe("DEV");
    // Et pas par le Worker : lui n'a qu'un environnement.
    expect(t?.api).toBe(false);
  });

  it("fetch_data.R lit `env` par table, bascule les clés le temps de l'appel, et refuse un env inconnu", () => {
    expect(fetchData).toMatch(/env_de_table <- function\(entry, datamart_env\)/);
    expect(fetchData).toMatch(/fetch_table\(connexion_pour\(env_table\), entry\)/);
    expect(fetchData).toMatch(/avec_cles_de\(env_table,/);
    expect(fetchData).toMatch(/env inconnu pour/);
  });
});
