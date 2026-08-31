import { describe, it, expect } from "vitest";
import { normaliserTypographie } from "@/lib/typographieFr";

const NB = " ";

// Le cas qui a motivé le correctif : la Une du 25 août 2026 coupait la ligne
// APRÈS le guillemet ouvrant, laissant « seul en bout de ligne.
describe("guillemets — le guillemet orphelin (Une du 2026-08-25)", () => {
  it("colle « au mot suivant et » au mot précédent", () => {
    expect(
      normaliserTypographie(
        "Trump menace de renommer le lac Ontario en « lac Amérique »",
      ),
    ).toBe(
      `Trump menace de renommer le lac Ontario en «${NB}lac Amérique${NB}»`,
    );
  });
  it("traite TOUTES les paires d'une même phrase", () => {
    expect(normaliserTypographie("Il dit « oui » et « non »")).toBe(
      `Il dit «${NB}oui${NB}» et «${NB}non${NB}»`,
    );
  });
  it("laisse intact ce qui est déjà collé (idempotence)", () => {
    const bon = `«${NB}déjà collé${NB}»`;
    expect(normaliserTypographie(bon)).toBe(bon);
  });
});

describe("insécables avant « : » et « % »", () => {
  it("deux-points après un mot", () => {
    expect(normaliserTypographie("Incendies en C.-B. : des évacués")).toBe(
      `Incendies en C.-B.${NB}: des évacués`,
    );
  });
  it("pourcent après un chiffre", () => {
    expect(normaliserTypographie("des tarifs de 50 %")).toBe(
      `des tarifs de 50${NB}%`,
    );
  });
  it("NE touche PAS une heure du type 10:30 (pas d'espace avant le signe)", () => {
    expect(normaliserTypographie("Le score est 10:30 ce matin")).toBe(
      "Le score est 10:30 ce matin",
    );
  });
});

describe("norme québécoise — rien avant « ; ? ! »", () => {
  it("retire l'espace, y compris une insécable", () => {
    expect(normaliserTypographie("quelles conséquences ?")).toBe(
      "quelles conséquences?",
    );
    expect(normaliserTypographie(`déjà insécable${NB}!`)).toBe(
      "déjà insécable!",
    );
  });
});

describe("heures — écart à l'OQLF assumé par le guide", () => {
  it("« 11 h » → « 11h »", () => {
    expect(normaliserTypographie("Carney s'exprime à 11 h")).toBe(
      "Carney s'exprime à 11h",
    );
  });
  it("« 14 h 30 » → « 14h30 »", () => {
    expect(normaliserTypographie("Rendez-vous à 14 h 30 demain")).toBe(
      "Rendez-vous à 14h30 demain",
    );
  });
});

describe("toutes les règles lisent la MÊME classe d'espaces", () => {
  // U+202F est la norme FRANÇAISE ; la maison veut U+00A0. Les règles « : » et
  // « % » utilisaient une espace ASCII littérale et la laissaient passer
  // (retour de Copilot sur aws-refiners#406, même écart des deux côtés).
  it("insécable étroite avant « : » ramenée à U+00A0", () => {
    expect(normaliserTypographie("Ontario\u202f: des évacués")).toBe(
      `Ontario${NB}: des évacués`,
    );
  });
  it("insécable étroite avant « % » ramenée à U+00A0", () => {
    expect(normaliserTypographie("de 50\u202f%")).toBe(`de 50${NB}%`);
  });
  it("une U+00A0 déjà en place n'est pas doublée", () => {
    const bon = `déjà bon${NB}: rien à faire`;
    expect(normaliserTypographie(bon)).toBe(bon);
  });
});

describe("garanties structurelles", () => {
  it("ne change JAMAIS le contenu visible, seulement la nature des espaces", () => {
    const cas = [
      "Trump menace de renommer le lac Ontario en « lac Amérique »",
      "Hausse de 50 % ; baisse de 3 %",
      "Incendies en C.-B. : 20 000 évacués et 101 feux actifs",
      "El Niño « très fort » attendu : quelles conséquences pour le Canada?",
    ];
    const sansEspaces = (s: string) => s.replace(/[\s ]+/gu, "");
    for (const c of cas) {
      expect(sansEspaces(normaliserTypographie(c))).toBe(sansEspaces(c));
    }
  });
  it("est idempotent — il tourne à chaque chargement", () => {
    const cas = "Il dit « oui » : hausse de 50 % à 11 h ?";
    const une = normaliserTypographie(cas);
    expect(normaliserTypographie(une)).toBe(une);
  });
  it("null et vide traversent sans erreur", () => {
    expect(normaliserTypographie(null)).toBeNull();
    expect(normaliserTypographie(undefined)).toBeNull();
    expect(normaliserTypographie("")).toBe("");
  });
  it("laisse le tiret cadratin — c'est une correction de fond, pas d'espacement", () => {
    expect(normaliserTypographie("un mot — un autre")).toBe("un mot — un autre");
  });
});
