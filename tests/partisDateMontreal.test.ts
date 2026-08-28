import { describe, it, expect } from "vitest";
import { __test__ } from "@/lib/data/parties";

// La colonne `date_montreal_tz` porte son nom mais contient la date UTC.
//
// Le raffineur écrit `as.Date(now_mtl)`, et `as.Date()` sur un horodatage R
// ignore le fuseau de l'objet pour retomber sur UTC :
//
//   as.Date(ymd_hms("2026-08-27 23:31:12", tz = "America/Montreal")) → 2026-08-28
//
// Tout relevé calculé entre 20 h et minuit heure de Montréal est donc classé au
// LENDEMAIN — un bloc de 4 h sur six. Constaté dans Athena le 2026-08-28 : le
// bloc « 20h » calculé à 03h31 UTC portait `date_montreal_tz = 2026-08-28` alors
// qu'il appartient à la soirée du 27.
//
// Décision du 2026-08-28 : on NE touche PAS aux raffineurs. Le site recalcule la
// date depuis `computed_at`, qui est un instant UTC exact.

/** Les quatre relevés réellement présents dans Athena le 2026-08-28, avec leur
 *  `date_montreal_tz` telle que publiée — donc décalée pour le bloc de 20h. */
const RELEVES = [
  { block_hour: 12, computed_at: "2026-08-27T19:32:58Z", date_montreal_tz: "2026-08-27" },
  { block_hour: 16, computed_at: "2026-08-27T23:31:44Z", date_montreal_tz: "2026-08-27" },
  { block_hour: 20, computed_at: "2026-08-28T03:31:12Z", date_montreal_tz: "2026-08-28" },
  { block_hour: 4, computed_at: "2026-08-28T11:31:31Z", date_montreal_tz: "2026-08-28" },
];

function ligne(r: (typeof RELEVES)[number], party: string) {
  return {
    party,
    block_hour: r.block_hour,
    block_label: `${String(r.block_hour).padStart(2, "0")}h`,
    weighted_mentions: 0.2,
    total_raw_score: 60,
    weighted_tone: 0,
    date_utc: r.computed_at.slice(0, 10),
    date_montreal_tz: r.date_montreal_tz,
    computed_at: r.computed_at,
  };
}

describe("la date de Montréal vient de computed_at, pas de la colonne", () => {
  it("range le bloc de 20h avec la SOIRÉE dont il fait partie", () => {
    // 03h31 UTC = 23h31 à Montréal le 27 : ce bloc appartient au 27, pas au 28.
    const parJour = new Map<string, number[]>();
    for (const r of RELEVES) {
      const jour = new Intl.DateTimeFormat("fr-CA", {
        timeZone: "America/Toronto",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(r.computed_at));
      parJour.set(jour, [...(parJour.get(jour) ?? []), r.block_hour].sort((a, b) => a - b));
    }
    expect(parJour.get("2026-08-27")).toEqual([12, 16, 20]);
    expect(parJour.get("2026-08-28")).toEqual([4]);

    // Ce que la colonne publiée prétendait, et qui mélangeait les deux jours :
    expect(RELEVES.filter((r) => r.date_montreal_tz === "2026-08-28").map((r) => r.block_hour))
      .toEqual([20, 4]);
  });

  it("ne trace RIEN quand le dernier jour n'a qu'un bloc réel", () => {
    // Le 28 août n'a que le bloc de 4h une fois le 20h rendu au 27. Une courbe
    // d'un seul point ne se trace pas — et surtout, l'ancienne version en
    // traçait une FAUSSE, en reliant la soirée de la veille au matin courant.
    const rows = RELEVES.flatMap((r) => ["CAQ", "PLQ", "PQ", "QS", "PCQ"].map((p) => ligne(r, p)));
    const chart = __test__.buildChartIntraday(rows, ["plq", "caq", "qs", "pq", "pcq"]);
    expect(chart).toBeNull();
  });

  it("trace dès que le jour courant a deux blocs à lui", () => {
    const deuxBlocs = [
      { block_hour: 4, computed_at: "2026-08-28T11:31:31Z", date_montreal_tz: "2026-08-28" },
      { block_hour: 8, computed_at: "2026-08-28T15:31:00Z", date_montreal_tz: "2026-08-28" },
    ];
    const rows = deuxBlocs.flatMap((r) =>
      ["CAQ", "PLQ", "PQ", "QS", "PCQ"].map((p) => ligne(r, p)),
    );
    const chart = __test__.buildChartIntraday(rows, ["plq", "caq", "qs", "pq", "pcq"]);
    expect(chart).not.toBeNull();
    expect(chart!.series).toHaveLength(5);
  });

  it("retombe sur la colonne publiée quand computed_at manque (archives)", () => {
    const rows = ["CAQ", "PLQ", "PQ", "QS", "PCQ"].flatMap((p) =>
      [4, 8].map((h) => {
        const l = ligne({ block_hour: h, computed_at: "", date_montreal_tz: "2026-08-20" }, p);
        return { ...l, computed_at: undefined as unknown as string };
      }),
    );
    // Sans `computed_at`, le regroupement se fait sur la colonne : deux blocs,
    // donc une courbe. Le repli reste décalé comme avant, ce qui vaut mieux
    // qu'une date vide qui ferait tout disparaître.
    expect(__test__.buildChartIntraday(rows, ["plq", "caq", "qs", "pq", "pcq"])).not.toBeNull();
  });
});
