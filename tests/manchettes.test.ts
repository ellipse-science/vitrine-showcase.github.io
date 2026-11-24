import { describe, it, expect } from "vitest";
import { titreNommeLeParti, manchetteRetenue } from "@/lib/manchettes";
import { __test__ } from "@/lib/data/parties";

// La garde des manchettes (lib/manchettes.ts). Les titres « réels » sont ceux
// que la table intra-journée publiait au bloc de 12h le 2026-09-11 (Athena) ;
// les autres sont construits pour un cas précis, et le disent.

describe("titreNommeLeParti — un titre n'est gardé que s'il nomme le parti", () => {
  it("garde les titres réels qui nomment le parti (sigle, nom, chef)", () => {
    expect(titreNommeLeParti("qs", "QS augmenterait les impôts des « 10 % les plus riches »")).toBe(true);
    expect(
      titreNommeLeParti(
        "plq",
        "Contributions électorales Charles Milliard a « zéro » doute sur l’intégrité de Farnell Morisset",
      ),
    ).toBe(true);
    expect(
      titreNommeLeParti(
        "pq",
        "Le Parti québécois estime les coûts pour la préparation et la tenue d’un référendum à 130 millions de dollars,",
      ),
    ).toBe(true);
    // Titre réel des Unes québécoises : il nomme DEUX partis, par la cheffe de
    // l'un et le surnom du chef de l'autre.
    const deux = "Christine Fréchette lance un appel aux souverainistes, PSPP l'accuse de faire une campagne de peur";
    expect(titreNommeLeParti("caq", deux)).toBe(true);
    expect(titreNommeLeParti("pq", deux)).toBe(true);
    expect(titreNommeLeParti("qs", deux)).toBe(false);
  });

  it("écarte les deux titres réels du jour qui ne nomment pas leur parti", () => {
    expect(
      titreNommeLeParti("pcq", "IMAGES 25 ans plus tard: New York commémore le 11-Septembre, sans Donald Trump"),
    ).toBe(false);
    expect(titreNommeLeParti("caq", "Des IA médicales doivent apprendre à envoyer des... fax!")).toBe(false);
  });

  it("refuse le fédéral et les formes ambiguës (titres construits)", () => {
    expect(titreNommeLeParti("pcq", "Le chef conservateur Pierre Poilievre rencontre des gens d'affaires")).toBe(false);
    expect(titreNommeLeParti("plq", "Les ministres libéraux du cabinet Carney se réunissent")).toBe(false);
    expect(titreNommeLeParti("plq", "Un chantier de 2 milliards de dollars pour les écoles")).toBe(false);
    expect(titreNommeLeParti("plq", "Milliard de dollars : la facture grimpe")).toBe(false);
    expect(titreNommeLeParti("qs", "Des voisins solidaires après l'incendie")).toBe(false);
    // « PQ » n'est pas un mot dans « PCQ ».
    expect(titreNommeLeParti("pq", "Le PCQ promet des baisses d'impôts")).toBe(false);
  });

  it("ignore accents et casse des noms, mais respecte la casse des sigles", () => {
    expect(titreNommeLeParti("caq", "Frechette annonce un plan")).toBe(true);
    expect(titreNommeLeParti("pcq", "ÉRIC DUHAIME EN TOURNÉE")).toBe(true);
    expect(titreNommeLeParti("qs", "qs est écrit en minuscules")).toBe(false);
  });

  it("manchetteRetenue replie les espaces et rend null sans titre retenu", () => {
    expect(manchetteRetenue("qs", "  QS   propose \n un plan ")).toBe("QS propose un plan");
    expect(manchetteRetenue("qs", null)).toBeNull();
    expect(manchetteRetenue("qs", "   ")).toBeNull();
    expect(manchetteRetenue("pcq", "Un festival de jazz attire les foules")).toBeNull();
  });
});

describe("manchettesDuBloc — le titre du dernier bloc publié", () => {
  const ligne = (party: string, h: number, computed: string, titre: string | null) => ({
    party,
    block_hour: h,
    block_label: `${h}h`,
    weighted_mentions: 0.2,
    total_raw_score: 10,
    weighted_tone: 0,
    date_utc: "2026-09-11",
    date_montreal_tz: "2026-09-11",
    computed_at: computed,
    representative_url: `https://exemple.invalid/${party}/${h}`,
    representative_title: titre,
  });

  it("prend le bloc le plus tardif, et le relevé le plus récent de ce bloc", () => {
    const m = __test__.manchettesDuBloc([
      ligne("QS", 8, "2026-09-11T11:31:00Z", "QS au matin"),
      ligne("QS", 12, "2026-09-11T15:45:00Z", "QS à midi, relevé corrigé"),
      ligne("QS", 12, "2026-09-11T15:31:00Z", "QS à midi"),
    ]);
    expect(m.qs).toEqual({ titre: "QS à midi, relevé corrigé", url: "https://exemple.invalid/QS/12" });
  });

  it("n'expose ni un titre écarté par la garde ni un titre absent", () => {
    const m = __test__.manchettesDuBloc([
      ligne("PCQ", 12, "2026-09-11T15:31:00Z", "New York commémore le 11-Septembre"),
      ligne("PLQ", 12, "2026-09-11T15:31:00Z", null),
    ]);
    expect(m).toEqual({});
    expect(__test__.manchettesDuBloc(null)).toEqual({});
  });
});
