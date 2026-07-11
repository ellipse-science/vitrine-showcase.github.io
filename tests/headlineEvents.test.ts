import { describe, it, expect } from "vitest";
import { __test__ } from "@/lib/data/headlineEvents";

const { latestIssueRow, parseIssuesMeta, capitalizeObject, firstSeenSaillantLabel } = __test__;

describe("latestIssueRow", () => {
  it("renvoie null sur une liste vide", () => {
    expect(latestIssueRow([])).toBeNull();
  });
  it("choisit le tag le plus récent (ordre lexical décroissant)", () => {
    const row = latestIssueRow([
      { tag: "2026-06-01 07:36", date_utc: "2026-06-01", pass: "pm" },
      { tag: "2026-06-05 07:36", date_utc: "2026-06-05", pass: "pm" },
    ]);
    expect(row?.tag).toBe("2026-06-05 07:36");
  });
  it("à tag égal, départage par pass (pm > am)", () => {
    const row = latestIssueRow([
      { tag: "2026-06-05 07:36", date_utc: "2026-06-05", pass: "am" },
      { tag: "2026-06-05 07:36", date_utc: "2026-06-05", pass: "pm" },
    ]);
    expect(row?.pass).toBe("pm");
  });
  it("à tag/date/pass égaux, préfère une ligne avec issues_meta non vide", () => {
    const row = latestIssueRow([
      { tag: "t", date_utc: "2026-06-05", pass: "pm", issues_meta: "{}" },
      { tag: "t", date_utc: "2026-06-05", pass: "pm", issues_meta: '{"economy_and_labour":{"label":"x","obj":"y"}}' },
    ]);
    expect(row?.issues_meta).not.toBe("{}");
  });
});

describe("parseIssuesMeta", () => {
  it('renvoie null pour "{}", null, vide ou non-string', () => {
    expect(parseIssuesMeta("{}")).toBeNull();
    expect(parseIssuesMeta("")).toBeNull();
    expect(parseIssuesMeta(null)).toBeNull();
    expect(parseIssuesMeta(42)).toBeNull();
  });
  it("renvoie null sur du JSON invalide", () => {
    expect(parseIssuesMeta("{not json")).toBeNull();
  });
  it("parse un JSON valide", () => {
    const parsed = parseIssuesMeta('{"economy_and_labour":{"label":"Budget","obj":"déficit"}}');
    expect(parsed).not.toBeNull();
    expect(parsed!["economy_and_labour"].label).toBe("Budget");
  });
});

// « aujourd'hui/hier » est relatif à la date Montréal du bloc affiché (2e
// argument), pas à l'horloge du build.   = espace fine insécable avant « h ».
describe("firstSeenSaillantLabel", () => {
  it("renvoie null si first_seen_utc ou la date du bloc manquent", () => {
    expect(firstSeenSaillantLabel(null, "2026-07-11")).toBeNull();
    expect(firstSeenSaillantLabel(undefined, "2026-07-11")).toBeNull();
    expect(firstSeenSaillantLabel("2026-07-11T12:00:00Z", null)).toBeNull();
  });
  it("renvoie null sur un timestamp invalide", () => {
    expect(firstSeenSaillantLabel("pas-une-date", "2026-07-11")).toBeNull();
  });
  it("même jour : 12h UTC = 8h Montréal (EDT) → « ce matin, 8 h »", () => {
    expect(firstSeenSaillantLabel("2026-07-11T12:00:00Z", "2026-07-11"))
      .toBe("ce matin, 8 h");
  });
  it("veille : 0h UTC le 11 = 20h Montréal le 10 → « hier soir, 20 h »", () => {
    expect(firstSeenSaillantLabel("2026-07-11T00:00:00Z", "2026-07-11"))
      .toBe("hier soir, 20 h");
  });
  it("arrondit à l'édition la plus proche en heure d'hiver (EST : 0h UTC = 19h)", () => {
    expect(firstSeenSaillantLabel("2026-01-15T00:00:00Z", "2026-01-15"))
      .toBe("hier soir, 20 h");
  });
  it("au-delà d'hier : date en toutes lettres", () => {
    expect(firstSeenSaillantLabel("2026-07-08T12:00:00Z", "2026-07-11"))
      .toBe("le mercredi 8 juillet 2026");
  });
});

describe("capitalizeObject", () => {
  it("capitalise la première lettre", () => {
    expect(capitalizeObject("déficit")).toBe("Déficit");
  });
  it("capitalise chaque mot, y compris après un tiret (#161)", () => {
    expect(capitalizeObject("états-unis-iran")).toBe("États-Unis-Iran");
    expect(capitalizeObject("accord états-unis-iran")).toBe("Accord États-Unis-Iran");
  });
  it("laisse une chaîne vide inchangée", () => {
    expect(capitalizeObject("")).toBe("");
  });
});
