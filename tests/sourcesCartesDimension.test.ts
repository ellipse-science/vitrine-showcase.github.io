import { describe, expect, it } from "vitest";
import { construireSources, lireCsv } from "@/scripts/social/sources-cartes-dimension";

// Les sources des cartes de la 44e viennent de la dimension dim-qc-parliament
// (mandats, fonctions, résultats), aux formats des fichiers de la 43e.
const csv = (s: string) => lireCsv(s.trim() + "\n");

const PERIODES = csv(`
period_type,legislature,session,anq_session_id,date_start,date_end,gov_party_id,seats_gov,total_seats,source
legislature,43,,,2022-10-03,2026-08-27,CAQ,90,125,x
legislature,44,,,2026-10-05,,PQ,60,127,x
`);
const MANDATS = csv(`
person_id,seat_id,party_id,parliamentary_status,date_start,date_end,start_reason,end_reason,source,confidence
991,matane,PQ,,2007-03-26,2008-12-08,election,,x,verified
991,matane,PQ,,2008-12-08,2012-09-04,election,,x,verified
991,matane,PQ,,2022-10-03,2026-08-27,election,dissolution,x,verified
991,matane,PQ,,2026-10-05,,election,,x,verified
20319,abitibiest,PQ,,2026-10-05,,election,,x,verified
555,laval,PLQ,,2026-10-05,,election,,x,verified
777,ancien,CAQ,,2018-10-01,2026-08-27,election,dissolution,x,verified
`);
const FONCTIONS = csv(`
person_id,title,function_code,scale_category,scale_pct,date_start,date_end,source,confidence
991,"Ministre de la Santé",M,ministre,75,2026-10-21,,assnat_fiche,verified
991,"Porte-parole de l’opposition officielle en matière de santé",PP,,0,2024-01-01,2026-08-27,assnat_fiche,verified
555,"Porte-parole de l’opposition officielle en matière de santé",PP,,0,2026-10-25,,assnat_fiche,verified
777,"Ministre des Transports",M,ministre,75,2022-10-20,2026-08-27,assnat_fiche,verified
`);
const RESULTATS = csv(`
election_date,election_type,election_code,seat_id,candidate_name,party_abbrev,party_id,votes,vote_share,rank,elected,lead_votes,person_id,valid_votes,registered_voters,turnout,source
2026-10-05,general,gen2026-10-05,matane,Pascal Bérubé,PQ,PQ,15000,55.5,1,true,8000,991,27000,40000,67.5,x
2026-10-05,general,gen2026-10-05,abitibiest,Stéphane Tremblay,PQ,PQ,7192,34.65,1,true,2583,20319,20759,33465,63.29,x
2026-10-05,general,gen2026-10-05,laval,X Y,PLQ,PLQ,9000,40,1,true,100,555,22000,30000,70,x
2022-10-03,general,gen2022-10-03,matane,Pascal Bérubé,PQ,PQ,14000,60,1,true,9000,991,23000,38000,60,x
`);

const sources = construireSources({
  legislature: 44, date: "2026-11-24", commit: "abc1234",
  mandats: MANDATS, fonctions: FONCTIONS, resultats: RESULTATS, periodes: PERIODES,
  nomsAssnat: new Map([["991", "Bérubé, Pascal"], ["20319", "Tremblay, Stéphane"], ["555", "Y, X"]]),
  circonscriptions: new Map([["991", "Matane-Matapédia-Mitis"], ["20319", "Abitibi-Est"], ["555", "Laval-des-Rapides"]]),
  genres: new Map([["991", { genre: "m", source: "43e" }]]),
});

describe("construireSources", () => {
  it("ne prend que les élu·es de la législature, et note la version de la dimension", () => {
    expect(sources.fonctions.deputes.map((d) => d.assnat_id).sort()).toEqual(["20319", "555", "991"]);
    expect(sources.fonctions.source).toBe("ellipse-science/dim-qc-parliament@abc1234");
    expect(sources.fonctions.date_reference).toBe("2026-11-24");
  });

  it("borne les fonctions et la rémunération au mandat de la législature", () => {
    const berube = sources.fonctions.deputes.find((d) => d.assnat_id === "991")!;
    expect(berube.nom).toBe("Pascal Bérubé");
    expect(berube.nom_famille).toBe("Bérubé");
    expect(berube.circonscription).toBe("Matane-Matapédia-Mitis");
    expect(berube.debut_mandat).toBe("2026-10-05");
    expect(berube.fonction_retenue).toBe("Ministre de la Santé");
    expect(berube.fonctions_legislature).toEqual([{ titre: "Ministre de la Santé", pct: 75, debut: "2026-10-21", fin: "2026-11-24" }]);
    // Son dossier de porte-parole de la 43e ne compte pas.
    expect(berube.porte_parole_legislature).toEqual([]);
    expect(berube.total_legislature).toBeGreaterThan(0);
  });

  it("apparie le ou la porte-parole et le ministre de la même législature", () => {
    const critique = sources.fonctions.deputes.find((d) => d.assnat_id === "555")!;
    expect(critique.vis_a_vis_legislature.map((v) => v.assnat_id)).toEqual(["991"]);
  });

  it("compte les mandats et la première élection", () => {
    expect(sources.carrieres.deputes["991"]).toEqual({ nom: "Pascal Bérubé", premiere_election: "2007", mandats: 4 });
    expect(sources.carrieres.deputes["20319"]).toEqual({ nom: "Stéphane Tremblay", premiere_election: "2026", mandats: 1 });
  });

  it("retient le scrutin qui a donné le siège dans la législature", () => {
    const r = sources.resultats.resultats.find((x) => x.gagnant === "Pascal Bérubé")!;
    expect(r).toMatchObject({ date: "2026-10-05", type: "générale", circonscription: "Matane-Matapédia-Mitis", nom_famille: "Bérubé", pourcentage: 55.5, avance: 8000 });
  });

  it("dit ce qui manque au lieu de le deviner", () => {
    expect(Object.keys(sources.genres.deputes)).toEqual(["991"]);
    expect(sources.controle.sansGenre.sort()).toEqual(["20319", "555"]);
  });
});

describe("lireCsv", () => {
  it("lit les champs entre guillemets, virgules comprises", () => {
    expect(lireCsv('a,b\n"x, y","z ""q"""\n')).toEqual([{ a: "x, y", b: 'z "q"' }]);
  });
});
