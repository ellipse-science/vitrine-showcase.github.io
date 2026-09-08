import { describe, expect, it } from "vitest";

import {
  ART_FILES,
  MAX_UPLOAD_BYTES,
  PARTY_SLUGS,
  REFERENCES_INDEX,
  UNE_KEY_MAX_LENGTH,
  borneIndex,
  borneJoursPosterieurs,
  heroKey,
  parsePochette,
  premierePochettePosterieure,
  parseReference,
  parseUne,
  publishDecision,
} from "@/workers/api/src/art-logic";

/* ───────────────────────────────────────────────────────────────────────────
   L'ILLUSTRATION PAR HISTOIRE (`une/<clé>.<ext>`) et les RÉFÉRENCES — même
   discipline que les pochettes : le parseur est le seul contrôle entre le
   réseau et le bucket, on éprouve autant les refus que les acceptations.
   ─────────────────────────────────────────────────────────────────────────── */
describe("parseUne (image rangée sous sa clé d'histoire)", () => {
  it("accepte une storyline et un event_id du pipeline, dans les quatre formats", () => {
    for (const key of [
      "story-voting-information-mailings-01a5194c",
      "story-caq-10963544",
      "20260903T150000Z-evt-frechette-holds-firm-french-only-3eb9c369",
    ]) {
      for (const ext of ["png", "webp", "avif", "json"]) {
        const ref = parseUne(`une/${key}.${ext}`);
        expect(ref, `${key}.${ext}`).toMatchObject({ key, ext });
        expect(ref?.contentType).toBeTruthy();
      }
    }
  });

  it("refuse tout ce qui n'est pas exactement une clé du pipeline", () => {
    const refuses = [
      "une/latest.png",                        // pas une clé
      "une/story-caq-10963544.gif",            // format non publié
      "une/Story-caq-10963544.png",            // casse
      "une/story-caq--10963544.png",           // tiret double
      "une/story-caq-10963544-.png",           // tiret final
      "une/story-caq-10963544/../x.png",       // remontée de chemin
      "une/../latest.png",                     // remontée
      "une/story-caq-10963544.png ",           // espace final
      "une//story-caq-10963544.png",           // segment vide
      "une/story.png",                         // trop court
      "une/story-" + "a".repeat(UNE_KEY_MAX_LENGTH) + ".png", // trop long
      "partis/2026-08-30/caq.png",             // autre famille
      "",
    ];
    for (const chemin of refuses) {
      expect(parseUne(chemin), chemin).toBeNull();
    }
  });
});

describe("parseReference (images de référence de l'artiste)", () => {
  it("accepte les noms <enjeu>_generic<n>.jpg", () => {
    expect(parseReference("references/economy_and_labour_generic3.jpg")).toEqual({
      name: "economy_and_labour_generic3",
      contentType: "image/jpeg",
    });
    expect(parseReference("references/rights_liberties_minorities_discrimination_generic12.jpg")?.name).toBe(
      "rights_liberties_minorities_discrimination_generic12",
    );
  });

  it("refuse le reste, et l'index n'est pas une image", () => {
    for (const chemin of [
      "references/index.json",
      "references/economy_and_labour_generic3.png",
      "references/Economy_generic3.jpg",
      "references/economy_generic.jpg",
      "references/../latest.png",
      "economy_and_labour_generic3.jpg",
      "",
    ]) {
      expect(parseReference(chemin), chemin).toBeNull();
    }
    expect(REFERENCES_INDEX).toBe("references/index.json");
  });
});

/**
 * La décision de publication est LE garde-fou économique du circuit
 * vitrine-art : elle sépare « nouvelle Une → builds + image » de « cycle sans
 * changement → rien ». Une régression ici, dans un sens, déclenche douze
 * builds et douze images facturées par jour pour rien ; dans l'autre, gèle
 * l'illustration pour toujours. D'où des tests sur la fonction pure.
 */
describe("publishDecision (vitrine-art)", () => {
  it("publie quand la Une change et que l'interrupteur maître est armé", () => {
    const d = publishDecision("s2", "s1", "true");
    expect(d.publish).toBe(true);
  });

  it("ne publie pas quand la Une n'a pas changé", () => {
    expect(publishDecision("s1", "s1", "true").publish).toBe(false);
  });

  it("ne publie pas sans identifiant de Une", () => {
    expect(publishDecision(null, "s1", "true").publish).toBe(false);
  });

  it("retient les builds en phase d'ombre (SYNC_TRIGGER_DEPLOYS ≠ true)", () => {
    expect(publishDecision("s2", "s1", "false").publish).toBe(false);
    expect(publishDecision("s2", "s1", undefined).publish).toBe(false);
  });

  it("publie la toute première illustration (aucun marqueur antérieur)", () => {
    expect(publishDecision("s1", null, "true").publish).toBe(true);
  });
});

describe("heroKey (clé d'appariement illustration ↔ Une)", () => {
  it("préfère la storyline : l'event_id change à chaque bloc de 4 h", () => {
    expect(heroKey({ storyline_id: "s1", event_id: "e9" })).toBe("s1");
  });

  it("retombe sur l'event_id quand la storyline manque", () => {
    expect(heroKey({ storyline_id: null, event_id: "e9" })).toBe("e9");
    expect(heroKey({ event_id: "e9" })).toBe("e9");
  });

  it("null quand rien n'identifie la Une", () => {
    expect(heroKey(null)).toBeNull();
    expect(heroKey({})).toBeNull();
  });
});

describe("liste blanche des fichiers d'art", () => {
  it("expose exactement les quatre fichiers du circuit", () => {
    expect(Object.keys(ART_FILES).sort()).toEqual([
      "latest.avif",
      "latest.json",
      "latest.png",
      "latest.webp",
    ]);
  });

  it("borne le téléversement au-dessus du PNG de gpt-image-1 (~1,5 Mo)", () => {
    expect(MAX_UPLOAD_BYTES).toBeGreaterThan(2 * 1024 * 1024);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
   LES POCHETTES DES PARTIS — validation du chemin.

   C'est le seul contrôle entre le réseau et le bucket : `parsePochette` dit
   oui ou non, et un « oui » trop large ferait de /v1/art un dépôt de fichiers
   arbitraires. On éprouve donc autant les refus que les acceptations.
   ─────────────────────────────────────────────────────────────────────────── */
describe("parsePochette", () => {
  it("accepte les quatre formats publiés, pour chaque parti", () => {
    for (const parti of PARTY_SLUGS) {
      for (const ext of ["png", "webp", "avif", "json"]) {
        const ref = parsePochette(`partis/2026-08-30/${parti}.${ext}`);
        expect(ref).not.toBeNull();
        expect(ref).toMatchObject({ jour: "2026-08-30", parti, ext });
      }
    }
  });

  it("refuse ce qui n'est pas exactement la forme attendue", () => {
    const refuses = [
      "partis/2026-08-30/npd.png",           // parti hors liste
      "partis/2026-08-30/caq.gif",           // format non publié
      "partis/2026-8-30/caq.png",            // date non ISO
      "partis/2026-13-45/caq.png",           // date syntaxique mais inexistante
      "partis/2026-02-30/caq.png",           // 30 février
      "partis/../latest.png",                // remontée de chemin
      "partis/2026-08-30/caq.png/../../x",   // remontée déguisée
      "partis/2026-08-30/CAQ.png",           // casse
      "partis/2026-08-30/caq.png ",          // espace final
      "partis/2026-08-30//caq.png",          // segment vide
      "latest.png",                          // fichier de la Une, autre liste
      "",
    ];
    for (const chemin of refuses) {
      expect(parsePochette(chemin), chemin).toBeNull();
    }
  });

  it("borne l'index sur un horizon, pour que le listage ne grossisse pas", () => {
    // Le 30 août moins 30 jours tombe le 31 juillet : c'est cette borne que le
    // listage R2 passe en `startAfter`, ce qui évite de parcourir toute
    // l'archive à chaque appel.
    expect(borneIndex(new Date("2026-08-30T12:00:00Z"), 30)).toBe("2026-07-31");
    expect(borneIndex(new Date("2026-01-05T00:00:00Z"), 30)).toBe("2025-12-06");
  });
});

/* Le GEL DES JOURNÉES CLOSES repose entièrement sur l'ordre des octets : la
   borne doit sauter par-dessus toutes les clés du jour et s'arrêter avant la
   première du lendemain. Un « / » (0x2F) et un « 0 » (0x30) séparent les deux
   cas, ce qui est trop subtil pour être tenu pour acquis. */
describe("borneJoursPosterieurs", () => {
  const jour = "2026-08-30";
  const borne = borneJoursPosterieurs(jour);

  it("ignore les clés du jour lui-même", () => {
    for (const cle of [
      `partis/${jour}/caq.png`,
      `partis/${jour}/qs.json`,
      `partis/${jour}/pcq.avif`,
    ]) {
      expect(cle > borne, cle).toBe(false);
    }
  });

  it("ignore les jours antérieurs", () => {
    for (const cle of ["partis/2026-08-29/caq.png", "partis/2026-07-31/caq.png", "partis/2025-12-31/caq.png"]) {
      expect(cle > borne, cle).toBe(false);
    }
  });

  it("voit les jours postérieurs, y compris par-dessus un mois ou une année", () => {
    for (const cle of ["partis/2026-08-31/caq.png", "partis/2026-09-01/caq.png", "partis/2027-01-01/caq.png"]) {
      expect(cle > borne, cle).toBe(true);
    }
  });
});

/* ───────────────────────────────────────────────────────────────────────────
   LA GARDE DE JOURNÉE CLOSE, ET LE PIÈGE QU'ELLE A CACHÉ QUATRE JOURS.

   Les tests de `borneJoursPosterieurs` ci-dessus vérifient la borne sur des
   clés DATÉES uniquement. C'était l'angle mort : sous `partis/` vit aussi le
   registre du fonds, et « f » trie après tous les chiffres. La garde y lisait
   « une journée plus récente existe » et refusait toute pochette, à jamais.
   ─────────────────────────────────────────────────────────────────────────── */
describe("premierePochettePosterieure", () => {
  const jour = "2026-09-05";

  it("ne prend PAS le registre du fonds pour une journée plus récente", () => {
    // Exactement ce que le listage rapportait le 2026-09-06 : le registre seul
    // passe la borne, et rien d'autre.
    expect(premierePochettePosterieure(["partis/fonds.json"], jour)).toBeNull();
  });

  it("voit une vraie journée postérieure, registre présent ou non", () => {
    const cles = ["partis/2026-09-06/caq.json", "partis/fonds.json"];
    expect(premierePochettePosterieure(cles, jour)).toBe("partis/2026-09-06/caq.json");
  });

  it("ignore la journée elle-même et les antérieures", () => {
    const cles = ["partis/2026-09-05/caq.json", "partis/2026-09-04/pq.json", "partis/fonds.json"];
    expect(premierePochettePosterieure(cles, jour)).toBeNull();
  });

  it("ignore tout objet étranger qui viendrait à vivre sous le préfixe", () => {
    const cles = ["partis/index.json", "partis/README.md", "partis/zzz/pas-un-parti.png"];
    expect(premierePochettePosterieure(cles, jour)).toBeNull();
  });

  it("liste vide : rien ne s'oppose au téléversement", () => {
    expect(premierePochettePosterieure([], jour)).toBeNull();
  });
});
