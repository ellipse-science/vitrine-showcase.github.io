import { describe, expect, it } from "vitest";

import { heurePublicationMontreal, momentMontreal } from "@/lib/dates";

// Le `tag` d'issues_score_day est écrit en HEURE DE MONTRÉAL par le raffineur
// (`format(Sys.time(), "%Y-%m-%d %H:%M")`, image réglée sur America/Toronto).
// Preuve du 2026-09-02 : la Lambda tourne à 19h36 (CloudWatch, Montréal) et
// écrit « 2026-09-02 19:37 ». Un premier jet lisait cette forme comme de
// l'UTC et reculait tout de quatre heures : « 16h » pour la passe de 19h37,
// servie à 20h. Ces cas gravent la bonne lecture.
describe("momentMontreal", () => {
  it("lit un tag sans fuseau tel quel : c'est déjà l'heure de Montréal", () => {
    expect(momentMontreal("2026-09-02 19:37")).toEqual({ date: "2026-09-02", heure: 19 });
  });

  it("ne recule PAS la passe nocturne à la veille", () => {
    // 3h36 à Montréal, le 2 septembre : c'est le 2 septembre.
    expect(momentMontreal("2026-09-02 03:36")).toEqual({ date: "2026-09-02", heure: 3 });
  });

  it("ne dépend pas de la saison : l'horloge murale ne change pas de sens en hiver", () => {
    expect(momentMontreal("2026-12-15 19:37")).toEqual({ date: "2026-12-15", heure: 19 });
  });

  it("accepte la forme sans fuseau avec secondes et avec T", () => {
    expect(momentMontreal("2026-09-02 19:37:12")).toEqual({ date: "2026-09-02", heure: 19 });
    expect(momentMontreal("2026-09-02T19:37")).toEqual({ date: "2026-09-02", heure: 19 });
  });

  it("rend null sur une entrée inexploitable, pour retomber sur la date seule", () => {
    expect(momentMontreal(null)).toBeNull();
    expect(momentMontreal("")).toBeNull();
    expect(momentMontreal("pas une date")).toBeNull();
    expect(momentMontreal("2026-09-02 25:00")).toBeNull();
    expect(momentMontreal("2026-02-30 03:36")).toBeNull();
    expect(momentMontreal("2026-13-02 03:36")).toBeNull();
    expect(momentMontreal("2026-09-02 03:99")).toBeNull();
  });
});

// Un instant qui PORTE son fuseau (Z ou décalage, comme `computed_at`) est un
// vrai instant : on le ramène à Montréal. Un premier jet réécrivait aussi ces
// formes-là en jetant l'offset, ce qui déplaçait l'instant de quatre heures.
describe("momentMontreal — instants qui portent déjà leur fuseau", () => {
  it("convertit un instant Z d'été (EDT, −4h)", () => {
    expect(momentMontreal("2026-08-27T23:31:44Z")).toEqual({ date: "2026-08-27", heure: 19 });
  });

  it("respecte un décalage explicite au lieu de le jeter", () => {
    expect(momentMontreal("2026-08-27T23:31:44-04:00")).toEqual({ date: "2026-08-27", heure: 23 });
  });

  it("le même instant écrit en Z donne le même résultat", () => {
    // 2026-08-28T03:31:44Z EST 2026-08-27T23:31:44-04:00.
    expect(momentMontreal("2026-08-28T03:31:44Z")).toEqual({ date: "2026-08-27", heure: 23 });
  });

  it("applique −5h en hiver, pas −4h", () => {
    expect(momentMontreal("2026-12-15T19:37:00Z")).toEqual({ date: "2026-12-15", heure: 14 });
  });
});

// L'heure PUBLIQUE d'une passe : celle de l'ÉDITION, sur la grille du bandeau,
// jamais l'heure brute de la passe (« 15h ») ni l'édition précédente (« 16h »
// pour la passe de 19h37).
describe("heurePublicationMontreal — l'heure de l'édition, pas celle de la passe", () => {
  const GRILLE = [4, 8, 12, 16, 20, 24];

  it("place les six passes réelles sur la grille des éditions", () => {
    // Les six tags quotidiens d'issues_score_day, en heure de Montréal.
    expect(heurePublicationMontreal("2026-09-02 03:36")).toEqual({ date: "2026-09-02", heure: 4 });
    expect(heurePublicationMontreal("2026-09-02 07:36")).toEqual({ date: "2026-09-02", heure: 8 });
    expect(heurePublicationMontreal("2026-09-02 11:37")).toEqual({ date: "2026-09-02", heure: 12 });
    expect(heurePublicationMontreal("2026-09-02 15:36")).toEqual({ date: "2026-09-02", heure: 16 });
    expect(heurePublicationMontreal("2026-09-02 19:37")).toEqual({ date: "2026-09-02", heure: 20 });
    expect(heurePublicationMontreal("2026-09-02 23:37")).toEqual({ date: "2026-09-02", heure: 24 });
  });

  it("ne sort JAMAIS de la grille, quelle que soit l'heure de la passe", () => {
    for (let h = 0; h < 24; h++) {
      const r = heurePublicationMontreal(`2026-09-02 ${String(h).padStart(2, "0")}:00`);
      expect(GRILLE).toContain(r?.heure);
    }
  });

  it("rend 24 et non 0 pour minuit, ce que lastUpdatedLabel attend", () => {
    expect(heurePublicationMontreal("2026-09-02 23:37")?.heure).toBe(24);
  });

  it("tient aussi en heure normale : la grille suit l'horloge murale", () => {
    expect(heurePublicationMontreal("2026-12-15 19:37")).toEqual({ date: "2026-12-15", heure: 20 });
  });

  it("traite un instant Z comme un instant, puis le place sur la grille", () => {
    // 23:37 UTC en été = 19h37 à Montréal → bloc 16-20 → servi à 20h.
    expect(heurePublicationMontreal("2026-09-02T23:37:00Z")).toEqual({ date: "2026-09-02", heure: 20 });
  });
});
