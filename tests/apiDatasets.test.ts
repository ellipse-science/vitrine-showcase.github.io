import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * LES DEUX LISTES BLANCHES DU WORKER DOIVENT BOUGER ENSEMBLE.
 *
 * `TABLES` (workers/api/src/tables.ts) dit ce que le Worker SYNCHRONISE
 * d'Athena vers Neon. `DATASETS` (workers/api/src/index.ts) dit ce que l'API
 * SERT. Rien ne les reliait, et elles ont divergé : cinq tables du module des
 * partis étaient synchronisées puis jamais servies. `/v1/datasets/<nom>`
 * répondait 404, et le site retombait sur les fichiers du dépôt — un
 * `console.warn` au build, invisible partout ailleurs. Le module lisait donc
 * deux sources à la fois sans que rien ne le dise.
 *
 * Le contrat public est `scripts/tables.json` : ce qui y est `enabled` et que
 * le Worker synchronise doit être servi.
 */

const racine = process.cwd();
const lire = (p: string) => readFileSync(path.join(racine, p), "utf8");

/** Les `name` de TABLES, lus dans la source — le fichier est du JSON inséré
 *  dans un littéral TypeScript, donc une regex suffit et évite d'importer du
 *  code Worker dans l'environnement de test. */
function nomsSynchronises(): string[] {
  const src = lire("workers/api/src/tables.ts");
  return [...src.matchAll(/"name":\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
}

/** Les clés de l'objet `DATASETS`. */
function nomsServis(): string[] {
  const src = lire("workers/api/src/index.ts");
  const bloc = src.match(
    /const DATASETS: Record<[^>]+> = \{([\s\S]*?)\n\}/,
  );
  if (!bloc) throw new Error("bloc DATASETS introuvable dans workers/api/src/index.ts");
  return [...bloc[1].matchAll(/^\s{2}([a-z0-9_]+):\s*\{/gm)].map((m) => m[1]);
}

/** Les tables que le site déclare lire : `tables[]`, celles `enabled`.
 *  Le fichier est un objet dont plusieurs clés sont des métadonnées
 *  (`_comment`, `_contract`, …) ; la liste vit sous `tables`. */
function nomsDuContrat(): string[] {
  const brut = JSON.parse(lire("scripts/tables.json")) as {
    tables?: Array<{ name?: string; enabled?: boolean }>;
  };
  const tables = brut.tables ?? [];
  if (tables.length === 0) throw new Error("scripts/tables.json : `tables` vide ou absent");
  return tables.filter((t) => t.name && t.enabled !== false).map((t) => t.name as string);
}

describe("listes blanches du Worker", () => {
  it("toute table synchronisée ET au contrat public est servie par l'API", () => {
    const synchronisees = new Set(nomsSynchronises());
    const servies = new Set(nomsServis());
    const contrat = nomsDuContrat();

    const muettes = contrat
      .filter((n) => synchronisees.has(n) && !servies.has(n))
      .sort();

    expect(
      muettes,
      `Synchronisées vers Neon et déclarées dans scripts/tables.json, mais absentes de DATASETS : ` +
        `/v1/datasets répondra 404 et le site retombera sur les fichiers en silence.\n  ${muettes.join("\n  ")}`,
    ).toEqual([]);
  });

  it("l'API ne sert rien qui ne soit pas synchronisé", () => {
    const synchronisees = new Set(nomsSynchronises());
    const orphelines = nomsServis()
      .filter((n) => !synchronisees.has(n))
      .sort();
    expect(
      orphelines,
      `Servies par l'API mais jamais synchronisées vers Neon : la table sera vide ou périmée.\n  ${orphelines.join("\n  ")}`,
    ).toEqual([]);
  });

  it("les cinq tables du module des partis sont servies (régression)", () => {
    const servies = new Set(nomsServis());
    for (const t of [
      "provincial_parties_salient_shadow_intraday",
      "provincial_parties_salient_shadow_by_media_day",
      "provincial_parties_salient_shadow_by_media_week",
      "provincial_parties_salient_shadow_by_media_month",
      "parties_issues_salient_shadow_day",
    ]) {
      expect(servies.has(t), `${t} doit être dans DATASETS`).toBe(true);
    }
  });
});
