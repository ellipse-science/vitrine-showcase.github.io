import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { TABLES } from "@/workers/api/src/tables";

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

/** Écarts de colonnes CONNUS entre scripts/tables.json et TABLES, laissés tels
 *  quels : rien ne garantit que Neon porte ces colonnes, et en ajouter une à
 *  TABLES sans elle fait échouer la synchro de la table entière
 *  (`recordDefinition`, workers/api/src/sync.ts).
 *
 *  ⚠️ Probablement un défaut ACTIF, du même type que `representative_url` :
 *  lib/data/assemblee.ts lit `deputy_id` et `district_id` par
 *  `readDatasetText`, donc par l'API en prod. Signalé le 2026-09-11. Le test
 *  compare à l'égalité : corriger l'écart oblige à le retirer d'ici. */
const ECARTS_DE_COLONNES_CONNUS = [
  "agora_decideurs_qc_deputes.deputy_id",
  "agora_decideurs_qc_deputes.district_id",
];

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

  it("toute table que le build demandera à l'API est servie — sinon `api: false` (régression du 2026-09-10)", () => {
    // Une table `enabled` sans `api: false` entre dans la correspondance de
    // lib/data/source.ts : en mode `api` ou `snapshot`, chaque instance du
    // build la demande, reçoit 404 et retombe sur le fichier. Ce repli est le
    // chemin le plus coûteux en mémoire : `radar_annotated`, entrée le 08-09
    // sans être servie, a fait mourir les builds prod du 10-09 (> 12 Go).
    const brut = JSON.parse(lire("scripts/tables.json")) as {
      tables?: Array<{ name?: string; enabled?: boolean; api?: boolean }>;
    };
    const servies = new Set(nomsServis());
    const demandeesPourRien = (brut.tables ?? [])
      .filter((t) => t.name && t.enabled !== false && t.api !== false && !servies.has(t.name))
      .map((t) => t.name as string)
      .sort();
    expect(
      demandeesPourRien,
      `Déclarées dans scripts/tables.json sans être servies par l'API : le build les demandera ` +
        `pour rien (404 → repli fichier, coûteux). Poser "api": false sur chacune, ou les servir.\n  ${demandeesPourRien.join("\n  ")}`,
    ).toEqual([]);
  });

  it("toute colonne que le site lit dans une table synchronisée est synchronisée (régression du 2026-09-11)", () => {
    // scripts/tables.json dit quelles colonnes le SITE lit ; TABLES dit
    // lesquelles le Worker copie vers Neon et vers l'instantané R2. En mode
    // `api` — celui de la prod et de dev —, une colonne absente de TABLES
    // arrive `undefined` au build, sans la moindre erreur. Deux fois déjà :
    // `total_raw_score` (0 minute sur « tous les médias », 2026-08-28), puis
    // `representative_url` (sources du module des partis vides en prod depuis
    // le 2026-09-10 au soir). Le second défaut datait du 09-01 : tant que
    // l'API se croyait périmée, le build retombait sur les fichiers, qui ont
    // la colonne, et le masquait.
    const brut = JSON.parse(lire("scripts/tables.json")) as {
      tables?: Array<{ name?: string; enabled?: boolean; cols?: string[] }>;
    };
    const synchronisees = new Map(TABLES.map((t) => [t.name, new Set(t.cols)]));
    const manquantes = (brut.tables ?? [])
      .filter((t) => t.name && t.enabled !== false && synchronisees.has(t.name))
      .flatMap((t) => {
        const cols = synchronisees.get(t.name as string)!;
        return (t.cols ?? []).filter((c) => !cols.has(c)).map((c) => `${t.name}.${c}`);
      })
      .sort();
    expect(
      manquantes,
      `Colonnes lues par le site mais absentes de workers/api/src/tables.ts : en mode api, elles ` +
        `arriveront vides au build, en silence. Les ajouter à TABLES ET à sql/schema.sql (avec un ` +
        `ALTER TABLE … ADD COLUMN IF NOT EXISTS appliqué à Neon AVANT de redéployer le Worker). ` +
        `Un écart corrigé se retire de ECARTS_DE_COLONNES_CONNUS.`,
    ).toEqual([...ECARTS_DE_COLONNES_CONNUS].sort());
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
