import { describe, expect, it } from "vitest";

// Importé depuis ./transforms, PAS depuis ./sync-athena. Ce fichier-ci est
// compilé par le tsconfig de la RACINE, qui exclut pourtant `workers/` :
// `exclude` ne filtre que les globs d'`include`, il n'empêche pas un fichier
// d'entrer dans le programme quand un fichier inclus l'importe. Passer par
// sync-athena.ts tirait donc `@neondatabase/serverless` et `aws4fetch` dans la
// compilation racine, où ils ne sont pas installés — `npm run type-check`
// cassait sur toutes les PR, et les déploiements avec.
import {
  HEADLINE_KEEP_DAYS,
  isoDaysAgo,
  keepHeadlineRow,
  normalizeValue,
  polimetreCutoff,
} from "@/workers/api/src/transforms";
import { TABLES } from "@/workers/api/src/tables";

/**
 * Fonctions PURES du sync direct Athena -> Postgres (chaîne émancipée de
 * GitHub). Mêmes fenêtres et mêmes ancrages que fetch_data.R et que le
 * raffineur vitrine-publish : toute modification doit être répercutée des
 * trois côtés tant que plusieurs chemins coexistent.
 */
describe("sync-athena — transformations pures", () => {
  it("normalise la chaîne vide en NULL, préserve le reste", () => {
    expect(normalizeValue("")).toBeNull();
    expect(normalizeValue(null)).toBeNull();
    expect(normalizeValue("0")).toBe("0");
    expect(normalizeValue("2026-08-19")).toBe("2026-08-19");
  });

  it("fenêtre headline : 14 jours ancrés sur l'horloge, dates manquantes jetées", () => {
    const cutoff = isoDaysAgo(HEADLINE_KEEP_DAYS);
    expect(keepHeadlineRow(isoDaysAgo(1), cutoff)).toBe(true);
    expect(keepHeadlineRow(isoDaysAgo(13), cutoff)).toBe(true);
    expect(keepHeadlineRow(isoDaysAgo(15), cutoff)).toBe(false);
    expect(keepHeadlineRow(null, cutoff)).toBe(false);
  });

  it("fenêtre polimetre : ancrée sur la DONNÉE, pas sur l'horloge", () => {
    // Snapshot le plus récent vieux de 200 jours : la fenêtre gèle avec lui
    // au lieu de vider la table (le module reste visible, données périmées).
    const oldMax = isoDaysAgo(200);
    const cutoff = polimetreCutoff([oldMax, isoDaysAgo(269), null]);
    expect(cutoff).not.toBeNull();
    expect(isoDaysAgo(269) >= cutoff!).toBe(true);
    expect(isoDaysAgo(271) >= cutoff!).toBe(false);
  });

  it("fenêtre polimetre : aucune date valide = pas de coupe", () => {
    expect(polimetreCutoff([null, "n/a"])).toBeNull();
  });

  it("whitelist embarquée : 18 tables, champs requis, filtres connus", () => {
    expect(TABLES).toHaveLength(18);
    for (const t of TABLES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.athena.length).toBeGreaterThan(0);
      expect(t.cols.length).toBeGreaterThan(0);
      expect([null, "headline_events_window", "polimetre_plus_recent"]).toContain(t.filter);
    }
  });
});
