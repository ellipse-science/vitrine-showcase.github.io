import { describe, expect, it } from "vitest";

import {
  ART_LOCAL_FILES,
  buildContextDigest,
  buildMetadata,
  buildPrompt,
  buildResponsesRequest,
  extractImageB64,
  generationAllowed,
  selectReferenceNames,
  uneKey,
} from "@/scripts/art_logic";

/**
 * L'illustration au build est un PORTAGE du raffineur vitrine-art. Ces tests
 * fixent ce qui doit rester identique entre les deux : la clé d'histoire, le
 * choix des références, le digest, le prompt, la forme des métadonnées — et
 * la barrière économique : où la génération est permise.
 */
describe("uneKey", () => {
  it("préfère la storyline, retombe sur l'event_id", () => {
    expect(uneKey({ storyline_id: "story-caq-10963544", event_id: "20260903T150000Z-evt-x-3eb9c369" })).toBe(
      "story-caq-10963544",
    );
    expect(uneKey({ storyline_id: null, event_id: "20260903T150000Z-evt-frechette-holds-firm-3eb9c369" })).toBe(
      "20260903T150000Z-evt-frechette-holds-firm-3eb9c369",
    );
  });

  it("refuse une clé qui n'a pas la forme du pipeline (jamais de chemin arbitraire)", () => {
    expect(uneKey(null)).toBeNull();
    expect(uneKey({})).toBeNull();
    expect(uneKey({ storyline_id: "../latest" })).toBeNull();
    expect(uneKey({ storyline_id: "Story-CAQ-1" })).toBeNull();
    expect(uneKey({ storyline_id: "story-" + "a".repeat(200) })).toBeNull();
  });
});

describe("selectReferenceNames", () => {
  const names = [
    "economy_and_labour_generic1",
    "economy_and_labour_generic2",
    "education_generic1",
    "education_generic2",
    "immigration_generic1",
    "technology_generic1",
  ];

  it("prend d'abord les références du sujet, puis complète au hasard", () => {
    const chosen = selectReferenceNames(names, "education", () => 0, 1, 3);
    expect(chosen[0]).toBe("education_generic1");
    expect(chosen).toHaveLength(3);
    expect(new Set(chosen).size).toBe(3);
    expect(chosen.slice(1).every((n) => !n.startsWith("education"))).toBe(true);
  });

  it("est déterministe pour un générateur donné et ne dépasse pas l'offre", () => {
    const a = selectReferenceNames(names, "technology", () => 0.5, 10, 20);
    const b = selectReferenceNames(names, "technology", () => 0.5, 10, 20);
    expect(a).toEqual(b);
    expect(a).toHaveLength(names.length);
    expect(a[0]).toBe("technology_generic1");
  });
});

describe("buildContextDigest", () => {
  const articles = JSON.stringify([
    { media_id: "LED", language: "fr", body_preview: "  Premier   extrait\nfrançais. " },
    { media_id: "LED", language: "fr", body_preview: "Doublon du même média" },
    { media_id: "MG", language: "en", body_preview: "English excerpt" },
    { media_id: "LAP", language: "fr", body_preview: "" },
    { media_id: null, language: "fr", body_preview: "Sans média" },
    { media_id: "TVA", language: "fr", body_preview: "x".repeat(400) },
  ]);

  it("garde un média une fois, le français d'abord, 300 caractères au plus", () => {
    const { digest, outlets } = buildContextDigest(articles);
    expect(outlets).toEqual(["LED", "TVA", "MG"]);
    const lines = digest.split("\n");
    expect(lines[0]).toBe("- Premier extrait français.");
    expect(lines[1]).toHaveLength(2 + 300);
    expect(lines[2]).toBe("- English excerpt");
  });

  it("borne le nombre de rédactions et supporte un tableau déjà lu", () => {
    const { outlets } = buildContextDigest(JSON.parse(articles), 2);
    expect(outlets).toEqual(["LED", "TVA"]);
  });

  it("rend vide sur du JSON invalide, une liste vide ou null", () => {
    expect(buildContextDigest("{pas du json")).toEqual({ digest: "", outlets: [] });
    expect(buildContextDigest("[]")).toEqual({ digest: "", outlets: [] });
    expect(buildContextDigest(null)).toEqual({ digest: "", outlets: [] });
  });
});

describe("buildPrompt", () => {
  it("porte la manchette, l'enjeu, le digest et les interdits du raffineur", () => {
    const p = buildPrompt("Ottawa financera 300 wagons", "Économie et travail", "- extrait");
    expect(p).toContain("«Ottawa financera 300 wagons»");
    expect(p).toContain("(topic: Économie et travail)");
    expect(p).toContain("- extrait");
    expect(p).toContain("zero human beings");
    expect(p).toContain("zero written characters");
    expect(p.split("\n\n")).toHaveLength(5);
  });

  it("omet le paragraphe des extraits quand le digest est vide", () => {
    expect(buildPrompt("Titre", "Enjeu").split("\n\n")).toHaveLength(4);
  });
});

describe("generationAllowed (la barrière économique)", () => {
  it("jamais sans clé OpenAI, quelle que soit la branche", () => {
    expect(generationAllowed({ CF_PAGES_BRANCH: "main" }).allowed).toBe(false);
    expect(generationAllowed({ CF_PAGES_BRANCH: "main", VITRINE_ART_GENERATE: "1" }).allowed).toBe(false);
  });

  it("develop et main génèrent, un aperçu de branche non (Cloudflare Pages)", () => {
    const k = { OPENAI_API_KEY: "sk" };
    expect(generationAllowed({ ...k, CF_PAGES_BRANCH: "main" }).allowed).toBe(true);
    expect(generationAllowed({ ...k, CF_PAGES_BRANCH: "develop" }).allowed).toBe(true);
    expect(generationAllowed({ ...k, CF_PAGES_BRANCH: "feat/x" }).allowed).toBe(false);
    expect(generationAllowed(k).allowed).toBe(false);
  });

  it("le vrai chemin de déploiement, GitHub Actions, est reconnu par GITHUB_REF_NAME", () => {
    // deploy-dev-cloudflare.yml (push sur develop) et deploy-prod.yml
    // (dispatch, checkout de main) n'ont pas CF_PAGES_BRANCH : sans ce
    // chemin, la garde refuserait chaque édition en silence (revue #728).
    const k = { OPENAI_API_KEY: "sk" };
    expect(generationAllowed({ ...k, GITHUB_REF_NAME: "develop" })).toEqual({ allowed: true, reason: "branche develop (Actions)" });
    expect(generationAllowed({ ...k, GITHUB_REF_NAME: "main" }).allowed).toBe(true);
    // Un build de PR (ci.yml) voit « 728/merge » : refusé, comme un aperçu.
    expect(generationAllowed({ ...k, GITHUB_REF_NAME: "728/merge" }).allowed).toBe(false);
    expect(generationAllowed({ ...k, GITHUB_REF_NAME: "feat/x" }).allowed).toBe(false);
    // Pages a priorité quand les deux existent.
    expect(generationAllowed({ ...k, CF_PAGES_BRANCH: "feat/x", GITHUB_REF_NAME: "main" }).allowed).toBe(false);
  });

  it("VITRINE_ART_GENERATE force ou coupe", () => {
    const k = { OPENAI_API_KEY: "sk" };
    expect(generationAllowed({ ...k, VITRINE_ART_GENERATE: "1" }).allowed).toBe(true);
    expect(generationAllowed({ ...k, CF_PAGES_BRANCH: "main", VITRINE_ART_GENERATE: "0" }).allowed).toBe(false);
  });
});

describe("l'appel OpenAI et sa réponse", () => {
  it("construit la requête Responses comme le raffineur", () => {
    const req = buildResponsesRequest("prompt", ["AAA", "BBB"]);
    expect(req.model).toBe("gpt-4o");
    expect(req.tools).toEqual([{ type: "image_generation", quality: "medium", size: "1024x1024" }]);
    const content = req.input[0].content;
    expect(content).toHaveLength(3);
    expect(content[0]).toEqual({ type: "input_image", image_url: "data:image/jpeg;base64,AAA", detail: "low" });
    expect(content[2]).toEqual({ type: "input_text", text: "prompt" });
  });

  it("extrait l'image de l'item image_generation_call, et rien d'autre", () => {
    expect(extractImageB64({ output: [{ type: "message" }, { type: "image_generation_call", result: "QUJD" }] })).toBe(
      "QUJD",
    );
    expect(extractImageB64({ output: [{ type: "image_generation_call", result: "" }] })).toBeNull();
    expect(extractImageB64({ output: [] })).toBeNull();
    expect(extractImageB64(null)).toBeNull();
  });
});

describe("buildMetadata", () => {
  it("a la forme de latest.json du raffineur, à la minute", () => {
    const meta = buildMetadata(
      { event_id: "e1", storyline_id: "story-x-1", title: "T" },
      "economy_and_labour",
      "Économie et travail",
      ["LED"],
      new Date("2026-09-04T01:23:45.678Z"),
    );
    expect(meta).toEqual({
      generated_at: "2026-09-04T01:23Z",
      event_id: "e1",
      storyline_id: "story-x-1",
      headline_fr: "T",
      main_issue: "economy_and_labour",
      main_issue_text_fr: "Économie et travail",
      context_outlets: ["LED"],
      generated_by: "build",
    });
  });

  it("les fichiers locaux sont ceux que la section et le partage connaissent", () => {
    expect([...ART_LOCAL_FILES].sort()).toEqual(["latest.avif", "latest.json", "latest.png", "latest.webp"]);
  });
});
