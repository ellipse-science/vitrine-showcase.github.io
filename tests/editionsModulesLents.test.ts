import { describe, it, expect, vi, beforeEach } from "vitest";

// Une édition passée, c'est le SITE entier à ce moment-là (#434, arbitrage
// d'Adrien du 2026-08-10) — pas seulement la Une des Unes. Mais les six modules
// ne sont pas publiés à la même cadence : les modules 1, 2 et 4 sortent de
// l'instantané 4 h et se rejouent au bloc près (cf. editionsArchive.test.ts),
// tandis que les modules 3, 5 et 6 sont publiés au jour ou à la semaine.
//
// Ce fichier vérifie la seule chose qui compte pour ces trois-là : la coupe est
// bien APPLIQUÉE. Sans elle, une page d'archive afficherait la couverture des
// partis d'aujourd'hui à côté des Unes d'il y a dix jours — sans une seule
// erreur visible, ce qui est le mode d'échec à écarter.
const readFileMock = vi.fn();
vi.mock("node:fs/promises", () => ({ default: { readFile: (...a: unknown[]) => readFileMock(...a) } }));

/** Répond le JSON voulu au fichier dont le chemin contient `motif`. */
function servir(table: Record<string, unknown>) {
  readFileMock.mockImplementation((p: string) => {
    const chemin = String(p);
    for (const [motif, contenu] of Object.entries(table)) {
      if (chemin.includes(motif)) return Promise.resolve(JSON.stringify(contenu));
    }
    return Promise.reject(new Error(`pas de fixture pour ${chemin}`));
  });
}

beforeEach(() => {
  readFileMock.mockReset();
  vi.resetModules();
});

describe("module 3 — partis et couverture", () => {
  const jour = (date: string, party: string, mentions: number) => ({
    party, date_utc: date, date_montreal_tz: date,
    weighted_mentions: mentions, weighted_tone: 0,
  });

  const lignes = [
    ...["CAQ", "PLQ", "QS", "PQ", "PCQ"].flatMap((p) => [
      jour("2026-07-20", p, 0.2),
      jour("2026-07-28", p, 0.2),
    ]),
  ];

  beforeEach(() => {
    servir({
      "provincial_parties_salient_shadow_day": lignes,
      "provincial_parties_salient_shadow_week": lignes,
      "provincial_parties_salient_shadow_month": lignes,
    });
  });

  it("s'arrête au dernier jour publié à la date de l'édition", async () => {
    const { loadParties } = await import("@/lib/data/parties");
    const passe = await loadParties("2026-07-24");
    // Le 28 est POSTÉRIEUR à l'édition : il ne doit pas exister pour elle.
    expect(passe!.lastUpdated).toContain("20 juillet 2026");
    expect(passe!.lastUpdated).not.toContain("28 juillet");
  });

  it("sans coupe, rend le dernier jour du fichier — comportement d'origine", async () => {
    const { loadParties } = await import("@/lib/data/parties");
    expect((await loadParties())!.lastUpdated).toContain("28 juillet 2026");
  });
});

// Le module 5 est câblé comme les modules 3 et 6, mais il lit TROIS fichiers.
// Seul le premier est servi ici : députés et portraits dégradent déjà en liste
// vide quand leur lecture échoue, et c'est exactement ce que le rejet de la
// fixture reproduit. Le test porte donc sur la coupe, rien d'autre.
// (Trou signalé par Copilot sur la PR #440 ; la PR l'annonçait comme non couvert.)
describe("module 5 — Assemblée nationale", () => {
  const seance = (fin: string, party: string) => ({
    period_type: "last_pdq", period_start_date: fin, period_end_date: fin,
    party, n_interventions: 12, word_count: 900,
    lexical_richness: 0.4, tone_score: 0, editorial_angle: "",
  });

  beforeEach(() => {
    // La séance récente d'ABORD : `buildPeriodView` date la période sur la
    // PREMIÈRE ligne rencontrée, donc sans coupe c'est elle qui doit sortir.
    servir({
      "agora_decideurs_qc.json": [
        seance("2026-07-28", "caq"), seance("2026-07-28", "plq"),
        seance("2026-07-20", "caq"), seance("2026-07-20", "plq"),
      ],
    });
  });

  it("s'arrête à la dernière séance publiée à la date de l'édition", async () => {
    const { loadAssemblee } = await import("@/lib/data/assemblee");
    const passe = await loadAssemblee("2026-07-24");
    expect(passe!.periods.last_pdq.lastUpdated).toContain("20 juillet 2026");
    expect(passe!.periods.last_pdq.lastUpdated).not.toContain("28 juillet");
  });

  it("sans coupe, rend la dernière séance du fichier — comportement d'origine", async () => {
    const { loadAssemblee } = await import("@/lib/data/assemblee");
    expect((await loadAssemblee())!.periods.last_pdq.lastUpdated).toContain("28 juillet 2026");
  });
});

describe("module 6 — Polimètre+", () => {
  const ligne = (semaine: string, n: number) => ({
    country_id: "QC", week_end_date: semaine, pledge_number: n,
    salience_index: 1, previous_salience_index: 0,
  });

  beforeEach(() => {
    servir({ polimetre: [ligne("2026-07-05", 1), ligne("2026-07-26", 2)] });
  });

  it("s'arrête au dernier instantané hebdomadaire publié à la date de l'édition", async () => {
    const { loadPolimetre } = await import("@/lib/data/polimetre");
    const passe = await loadPolimetre("2026-07-10");
    expect(passe?.weekEndDate).toBe("2026-07-05");
  });

  it("sans coupe, rend le dernier instantané du fichier", async () => {
    const { loadPolimetre } = await import("@/lib/data/polimetre");
    expect((await loadPolimetre())?.weekEndDate).toBe("2026-07-26");
  });
});
