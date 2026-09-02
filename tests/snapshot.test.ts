import { describe, expect, it } from "vitest";

// Importé depuis ./snapshot-logic, PAS depuis ./snapshot — même raison que
// tests/sync-athena.test.ts : ce fichier est compilé par le tsconfig de la
// RACINE, et passer par snapshot.ts tirerait les types Workers (R2Bucket) et
// `@neondatabase/serverless` dans une compilation qui ne les a pas.
import {
  castValue,
  cycleId,
  cyclesToPrune,
  hasColumnTypes,
  manifestIsFresh,
  resolveSnapshotKey,
  rowsToObjects,
  tableKey,
} from "@/workers/api/src/snapshot-logic";
import { COLUMN_TYPES } from "@/workers/api/src/column-types";
import { TABLES } from "@/workers/api/src/tables";

/**
 * Instantané R2 — le chemin qui sort Postgres du build (incident du
 * 2026-08-26, transfert Neon épuisé par ~85 builds/jour).
 *
 * L'INVARIANT QUE CES TESTS PROTÈGENT : un instantané doit être
 * INTERCHANGEABLE avec la réponse de /v1/datasets. Les loaders du site
 * analysent des nombres ; si la conversion depuis les chaînes d'Athena
 * dérive, les modules se brisent en silence plutôt que bruyamment.
 */
describe("instantané — conversion des types", () => {
  it("rend les colonnes numériques en NOMBRES, pas en chaînes", () => {
    expect(castValue("0.1981", "number", "t", "c")).toBe(0.1981);
    expect(castValue("231", "number", "t", "c")).toBe(231);
    expect(castValue("-3.5e2", "number", "t", "c")).toBe(-350);
  });

  it("préserve les nulls sans les convertir en zéro", () => {
    // `Number(null)` vaut 0 : la confusion silencieuse que ce test interdit.
    expect(castValue(null, "number", "t", "c")).toBeNull();
    expect(castValue(null, undefined, "t", "c")).toBeNull();
  });

  it("laisse les colonnes textuelles intactes, dates comprises", () => {
    // Règle 1 de generate_pg_schema.mjs : la forme LEXICALE d'origine doit
    // survivre à l'aller-retour, les trois graphies de date incluses.
    for (const v of ["2026-06-12", "2026-07-31T20:01:35Z", "2025-05-28 16:13"]) {
      expect(castValue(v, undefined, "t", "c")).toBe(v);
    }
    expect(castValue("0042", undefined, "t", "c")).toBe("0042");
  });

  it("ÉCHOUE sur une valeur numérique irreprésentable plutôt que de la nullifier", () => {
    // LE TEST CENTRAL. `JSON.stringify(NaN)` écrit `null` : sans cette levée,
    // une colonne polluée en amont produirait un instantané silencieusement
    // vide, là où le chemin Postgres aurait REFUSÉ l'insertion et fait
    // échouer la table — ce qui retient les Deploy Hooks et préserve la
    // donnée déjà servie.
    expect(() => castValue("abc", "number", "issues_score_day", "economy_and_labour")).toThrow(
      /economy_and_labour/,
    );
    expect(() => castValue("Infinity", "number", "t", "c")).toThrow();
    expect(() => castValue("NaN", "number", "t", "c")).toThrow();
  });

  it("convertit les booléens et refuse ce qui n'en est pas un", () => {
    expect(castValue("true", "boolean", "t", "c")).toBe(true);
    expect(castValue("f", "boolean", "t", "c")).toBe(false);
    expect(() => castValue("oui", "boolean", "t", "c")).toThrow();
  });
});

describe("instantané — lignes en objets", () => {
  it("reproduit la forme servie par /v1/datasets", () => {
    const rows = rowsToObjects(
      "provincial_parties_score_day",
      ["party", "date_utc", "date_montreal_tz", "weighted_mentions", "weighted_tone", "pass"],
      [["CAQ", "2026-08-26", "2026-08-26", "12.5", "-0.3", "am"]],
    );
    expect(rows).toEqual([
      {
        party: "CAQ",
        date_utc: "2026-08-26",
        date_montreal_tz: "2026-08-26",
        weighted_mentions: 12.5,
        weighted_tone: -0.3,
        pass: "am",
      },
    ]);
    // La forme sérialisée est ce que le build recevra : les nombres ne
    // doivent pas ressortir entre guillemets.
    expect(JSON.stringify(rows)).toContain('"weighted_mentions":12.5');
  });

  it("laisse en chaîne une colonne textuelle qui ressemble à un nombre", () => {
    // `pass` est du texte : « 2 » doit rester « 2 ». C'est la conversion PAR
    // COLONNE DÉCLARÉE, jamais par apparence de la valeur, qui l'assure.
    const rows = rowsToObjects(
      "provincial_parties_score_day",
      ["party", "pass", "weighted_mentions"],
      [["CAQ", "2", "2"]],
    );
    expect(rows[0].pass).toBe("2");
    expect(rows[0].weighted_mentions).toBe(2);
  });
});

describe("instantané — table des types", () => {
  it("ignore les types déclarés pour des colonnes que la synchro ne lit pas", () => {
    // Les deux artefacts n'ont pas le même millésime : column-types.ts est
    // inféré des données publiées, tables.ts a été figé le 2026-08-19. La
    // première en connaît donc davantage (p. ex. `total_raw_score`, présent
    // dans les fichiers mais absent de tables.ts).
    //
    // C'EST SANS CONSÉQUENCE, ET CE TEST LE PROUVE : la conversion parcourt
    // `cols`, jamais la table des types. Un type en trop est inerte ; c'est
    // un type MANQUANT qui serait dangereux, et c'est le test suivant qui
    // garde ce côté-là.
    const rows = rowsToObjects(
      "provincial_parties_salient_shadow_day",
      ["party", "weighted_mentions"],
      [["CAQ", "1.5"]],
    );
    expect(Object.keys(rows[0])).toEqual(["party", "weighted_mentions"]);
    expect(rows[0].weighted_mentions).toBe(1.5);
  });

  it("couvre toutes les tables synchronisées, sauf les omissions connues", () => {
    // LE TROU QU'ON FERME ICI. La première version lisait sql/schema.sql, un
    // artefact commité qui avait trois tables de retard : leurs colonnes
    // numériques seraient parties en chaînes, sans un mot. Ce test échoue
    // désormais si une table synchronisée perd ses types.
    //
    // `agora_decideurs_qc_affiliations` est la seule omission admise : son
    // fichier de données n'existe pas dans le dépôt, donc aucun type n'est
    // inférable. Elle reste hors instantané et se lit dans son fichier —
    // c'est-à-dire, aujourd'hui, nulle part. Le jour où le fichier arrive,
    // régénérer suffit et cette ligne saute.
    const OMISSIONS_CONNUES = new Set(["agora_decideurs_qc_affiliations"]);
    const sansTypes = TABLES.filter((t) => !hasColumnTypes(t.name)).map((t) => t.name);
    expect(sansTypes.filter((n) => !OMISSIONS_CONNUES.has(n))).toEqual([]);
  });

  it("REFUSE de convertir une table dont les types sont inconnus", () => {
    // Ne rien servir vaut mieux que servir des chaînes déguisées en nombres :
    // la synchro attrape cette levée et laisse la table hors instantané.
    expect(hasColumnTypes("table_qui_n_existe_pas")).toBe(false);
    expect(() => rowsToObjects("table_qui_n_existe_pas", ["a"], [["1"]])).toThrow(
      /types de colonnes inconnus/,
    );
  });
});

describe("instantané — clés et cycles", () => {
  it("date le cycle en UTC, triable lexicographiquement", () => {
    expect(cycleId(new Date("2026-08-26T12:56:03Z"))).toBe("20260826T1256Z");
    // L'ordre lexicographique DOIT coïncider avec l'ordre chronologique :
    // c'est ce dont dépend le ménage des vieux cycles.
    const a = cycleId(new Date("2026-08-26T08:10:00Z"));
    const b = cycleId(new Date("2026-08-26T12:56:00Z"));
    expect(a < b).toBe(true);
  });

  it("compose la clé d'une table sous le préfixe de données", () => {
    expect(tableKey("20260826T1256Z", "polimetre_plus")).toBe(
      "data/snapshot/20260826T1256Z/polimetre_plus.json",
    );
  });

  it("REFUSE tout chemin qui sortirait du préfixe d'instantané", () => {
    // Le bucket contient aussi les illustrations de la Une : un chemin
    // deviné ne doit jamais pouvoir les atteindre par cette route.
    expect(resolveSnapshotKey(["manifest.json"])).toBe("data/snapshot/manifest.json");
    expect(resolveSnapshotKey(["20260826T1256Z", "polimetre_plus.json"])).toBe(
      "data/snapshot/20260826T1256Z/polimetre_plus.json",
    );
    for (const bad of [
      ["..", "art"],
      ["20260826T1256Z", "../../art/latest.png"],
      ["20260826T1256Z", "latest.png"],
      ["pas-un-cycle", "polimetre_plus.json"],
      ["20260826T1256Z", "Polimetre.json"],
      [],
      ["manifest.json", "extra"],
    ]) {
      expect(resolveSnapshotKey(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("ne garde que les cycles les plus récents", () => {
    const cycles = ["20260826T0010Z", "20260826T0410Z", "20260826T0810Z", "20260826T1256Z"];
    expect(cyclesToPrune(cycles, 3)).toEqual(["20260826T0010Z"]);
    expect(cyclesToPrune(cycles, 10)).toEqual([]);
  });
});

describe("instantané — fraîcheur", () => {
  const base = { cycle: "20260826T1256Z", source: "cf-athena", tables: {} };
  const now = Date.parse("2026-08-26T13:10:00Z");
  const max = 45 * 60 * 1000;

  it("accepte un manifeste récent", () => {
    expect(manifestIsFresh({ ...base, generated_at: "2026-08-26T12:56:00Z" }, now, max)).toBe(true);
  });

  it("refuse un manifeste périmé, absent ou mal daté", () => {
    // Un instantané figé ressemble à un instantané vivant : sans ce contrôle,
    // le site publierait indéfiniment le dernier cycle réussi.
    expect(manifestIsFresh({ ...base, generated_at: "2026-08-26T10:00:00Z" }, now, max)).toBe(false);
    expect(manifestIsFresh(null, now, max)).toBe(false);
    expect(manifestIsFresh({ ...base, generated_at: "pas une date" }, now, max)).toBe(false);
  });
});
