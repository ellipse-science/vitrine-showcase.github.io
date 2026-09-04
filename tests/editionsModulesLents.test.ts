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

// LA COUPE AU JOUR NE SUFFIT PAS À TOUTES LES TABLES DU MODULE 3 (#735).
//
// Le commentaire du haut de ce fichier range le module 3 parmi ceux « publiés
// au jour ». C'est vrai de sa table quotidienne, qui ne porte qu'UNE ligne par
// parti et par journée. Ça ne l'est pas de sa table intra-journée, qui en publie
// SIX — une par bloc de 4 h. Bornée au jour, elle les livrait toutes les six à
// chacune des six éditions : celle du matin montrait les blocs du soir, publiés
// après elle. D'où une seconde borne, à l'INSTANT.
describe("module 3 — la table intra-journée se coupe au BLOC, pas au jour", () => {
  const jour = (date: string, party: string, mentions: number) => ({
    party, date_utc: date, date_montreal_tz: date,
    weighted_mentions: mentions, weighted_tone: 0,
  });

  /** Un bloc, avec le `computed_at` que le raffineur lui donne réellement : une
   *  demi-heure avant l'édition qui le porte. Relevé sur la donnée servie du
   *  2026-09-03 — blocs 0/4/8/12/16/20 calculés à 07h31, 11h31, 15h31, 19h31,
   *  23h31, puis 03h31 le LENDEMAIN pour celui de 20 h. */
  const bloc = (h: number, party: string, mentions: number) => {
    const t = Date.UTC(2026, 6, 28, 7, 31) + h * 3_600_000;
    return {
      party, date_utc: "2026-07-28", date_montreal_tz: "2026-07-28",
      block_hour: h, block_label: `${h}h`,
      weighted_mentions: mentions, total_raw_score: mentions * 1000, weighted_tone: 0,
      computed_at: new Date(t).toISOString(),
    };
  };

  const PARTIS = ["CAQ", "PLQ", "QS", "PQ", "PCQ"];
  const quotidien = PARTIS.flatMap((p) => [jour("2026-07-20", p, 0.2), jour("2026-07-28", p, 0.2)]);

  beforeEach(() => {
    servir({
      "provincial_parties_salient_shadow_intraday": [0, 4, 8, 12, 16, 20].flatMap((h) =>
        PARTIS.map((p, i) => bloc(h, p, 0.1 + h / 100 - i / 1000)),
      ),
      "provincial_parties_salient_shadow_day": quotidien,
      "provincial_parties_salient_shadow_week": quotidien,
      "provincial_parties_salient_shadow_month": quotidien,
    });
  });

  it("une édition ne voit que les blocs publiés AVANT elle", async () => {
    const { loadParties } = await import("@/lib/data/parties");
    // Édition de midi : publiée à 12 h à Montréal, soit 16 h UTC l'été. Les
    // blocs 0, 4 et 8 sont calculés avant (07h31, 11h31, 15h31) ; ceux de 12,
    // 16 et 20 après. Le dernier bloc visible doit donc être celui de 8 h.
    const midi = await loadParties("2026-07-28", "2026-07-28T16:00:00.000Z");
    expect(midi!.blocCourant).toEqual({ date: "2026-07-28", hour: 8, label: "8h" });
  });

  it("DEUX ÉDITIONS DU MÊME JOUR NE SE RESSEMBLENT PLUS — c'est tout l'objet de #735", async () => {
    const { loadParties } = await import("@/lib/data/parties");
    // Les deux partagent le même JOUR, donc le même `asOfIso` : c'est
    // exactement pourquoi la borne au jour ne pouvait pas les distinguer.
    const matin = await loadParties("2026-07-28", "2026-07-28T12:00:00.000Z");
    const soir = await loadParties("2026-07-28", "2026-07-29T00:00:00.000Z");
    expect(matin!.blocCourant!.hour).toBe(4);
    expect(soir!.blocCourant!.hour).toBe(16);
    expect(matin!.blocCourant).not.toEqual(soir!.blocCourant);
  });

  it("sans instant, rien ne change : le comportement courant est intact", async () => {
    const { loadParties } = await import("@/lib/data/parties");
    // La page d'accueil n'a pas d'édition et ne passe donc pas d'instant. Elle
    // doit continuer de voir le dernier bloc du fichier.
    expect((await loadParties())!.blocCourant!.hour).toBe(20);
    expect((await loadParties("2026-07-28"))!.blocCourant!.hour).toBe(20);
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
