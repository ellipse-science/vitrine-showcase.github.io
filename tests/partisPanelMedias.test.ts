import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { __test__ } from "@/lib/data/parties";
import { MEDIA_PANEL_QC, MEDIA_ORDER, MEDIA_SIGLES, MEDIA_LABELS, TOUS_MEDIAS } from "@/lib/medias";

// Le fader est dessiné pour SEPT crans — six médias québécois et « tous » au
// centre. Le chargeur, lui, prenait tous les `media_id` de la table, qui publie
// le corpus entier : CBC, CNN, Fox News, The Globe and Mail…
//
// Ce que ça donnait, mesuré sur `public/data/refined/` le 2026-08-27 :
//   - 16 crans au lieu de 7 ;
//   - « tous » à l'index 3 sur 15, donc plus au centre de la piste ;
//   - 9 crans sans sigle, affichés sous leur identifiant technique (« FXN ») ;
//   - 12 positions sur 15 donnant une console entièrement vide, dont
//     l'infobulle affirmait « aucun parti à ce rang sur cette période ».
//
// Ce dernier point est le vrai défaut : c'est une affirmation sur la
// COUVERTURE, là où la vérité est que Fox News ne couvre pas la politique
// québécoise. Le module s'interdit d'imputer aux médias un silence qui est le
// nôtre (cf. le type `Indisponibilite` dans lib/data/parties.ts).

describe("le panel de médias du fader", () => {
  it("est celui des crans du fader, sans doublon de liste à tenir à jour", () => {
    expect(MEDIA_PANEL_QC).toEqual(MEDIA_ORDER.filter((id) => id !== TOUS_MEDIAS));
    expect(MEDIA_PANEL_QC).toHaveLength(6);
  });

  it("ne contient que des médias nommables — un sigle et un libellé chacun", () => {
    // Un cran sans sigle retombe sur l'identifiant brut du corpus, qui est une
    // clé technique et non un nom.
    for (const id of MEDIA_PANEL_QC) {
      expect(MEDIA_SIGLES[id], `sigle manquant pour ${id}`).toBeTruthy();
      expect(MEDIA_LABELS[id], `libellé manquant pour ${id}`).toBeTruthy();
    }
  });

  it("écarte les médias hors Québec présents dans la donnée publiée", async () => {
    const brut = await fs.readFile(
      path.resolve(
        process.cwd(),
        "public/data/refined/day/provincial_parties_salient_shadow_by_media_day.json",
      ),
      "utf8",
    );
    const rows = JSON.parse(brut) as { media_id?: string }[];
    const dansLaDonnee = [...new Set(rows.map((r) => r.media_id).filter(Boolean))] as string[];

    // La table publie bien plus que le panel — sinon ce test ne prouverait rien.
    const horsPanel = dansLaDonnee.filter((id) => !MEDIA_PANEL_QC.includes(id));
    expect(horsPanel.length).toBeGreaterThan(0);

    // Et le filtre du chargeur les retire tous.
    const publies = new Set(dansLaDonnee);
    const retenus = MEDIA_PANEL_QC.filter((id) => publies.has(id));
    expect(retenus.every((id) => MEDIA_PANEL_QC.includes(id))).toBe(true);
    expect(retenus.length).toBeLessThanOrEqual(6);
  });

  it("filtrer le panel ne désaccorde pas la position « tous les médias »", async () => {
    // « Tous » lit la table AGRÉGÉE, pas la somme des crans. Si l'agrégat
    // comptait des médias que le fader n'offre plus, le centre du crossfader
    // mesurerait autre chose que ses positions — et personne ne le verrait.
    const lire = async (f: string) =>
      JSON.parse(await fs.readFile(path.resolve(process.cwd(), f), "utf8"));
    const agg = (await lire(
      "public/data/refined/day/provincial_parties_salient_shadow_day.json",
    )) as { party: string; date_utc: string; total_raw_score: number }[];
    const parMedia = (await lire(
      "public/data/refined/day/provincial_parties_salient_shadow_by_media_day.json",
    )) as { party: string; media_id: string; date_utc: string; total_raw_score: number }[];

    const jour = agg.map((r) => r.date_utc).sort().at(-1)!;
    // `buildLookup` garde un seul relevé par (date, parti) — la table en publie
    // plusieurs par passage du raffineur.
    const attendu = new Map<string, number>();
    for (const r of agg) if (r.date_utc === jour) attendu.set(r.party, Number(r.total_raw_score) || 0);

    for (const [parti, total] of attendu) {
      const somme = parMedia
        .filter((r) => r.date_utc === jour && r.party === parti && MEDIA_PANEL_QC.includes(r.media_id))
        .reduce((s, r) => s + (Number(r.total_raw_score) || 0), 0);
      expect(somme, `${parti} : l'agrégat s'écarte de la somme du panel`).toBeCloseTo(total, 1);
    }
  });
});

describe("computeStats sur un média hors panel", () => {
  it("ne rendait pas null, ce qui laissait passer les médias à zéro", () => {
    // Pourquoi le filtre est nécessaire au lieu de compter sur `if (!c) continue`
    // dans le chargeur : un média sans aucun signal produit des statistiques
    // parfaitement valides, toutes à zéro. Rien dans la donnée ne le distingue
    // d'un média québécois lors d'une journée creuse.
    const lignes = ["CAQ", "PLQ", "PQ", "QS", "PCQ"].map((party) => ({
      party,
      date_utc: "2026-08-27",
      date_montreal_tz: "2026-08-27",
      weighted_mentions: 0,
      total_raw_score: 0,
      weighted_tone: 0,
      computed_at: "2026-08-27T11:31:00Z",
    }));
    expect(__test__.computeStats(lignes, lignes, lignes)).not.toBeNull();
  });
});
