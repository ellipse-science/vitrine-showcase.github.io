import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { __test__ } from "@/lib/data/headlineEvents";
import {
  SALIENCE_CUTOVER,
  NEW_INDEX_SCALE,
  NEW_SUM_QC_THRESHOLDS,
  NEW_BLOCK_QC_THRESHOLDS,
  NEW_SUM_ROC_THRESHOLDS,
  NEW_BLOCK_ROC_THRESHOLDS,
  scaleThresholds,
} from "@/lib/data/salienceCutover";

const { qcScore, rocScore, storiesFrom24h, rawRank } = __test__;

// Deux blocs consécutifs, une seule histoire, avec les DEUX indices présents et
// volontairement DISCORDANTS : l'ancien monte, le nouveau descend. C'est ce qui
// rend les tests d'inertie et de bascule discriminants — sur des valeurs égales,
// ils passeraient sans rien prouver.
const ev = (block: string, scoreQc: number, idxQc: number) => ({
  event_id: `e-${block}`,
  storyline_id: "s1",
  title: "Une histoire",
  date_utc: block.slice(0, 10),
  time_interval_utc: `${block.slice(11)}-00`,
  score_qc: scoreQc,
  score_roc: 0,
  salience_index_qc: idxQc,
  salience_index_roc: 0,
  media_ids_qc: '["LAP","JDM"]',
  media_ids_roc: "[]",
  media_ids: '["LAP","JDM"]',
});
const ROWS = [ev("2026-08-08T12", 40, 0.2), ev("2026-08-08T16", 60, 0.1)];

describe("qcScore / rocScore — le point de bascule", () => {
  it("flag éteint : lit l'ancien indice, tel quel", () => {
    expect(qcScore({ score_qc: 42, salience_index_qc: 0.9 } as never, false)).toBe(42);
    expect(rocScore({ score_roc: 7, salience_index_roc: 0.9 } as never, false)).toBe(7);
  });
  it("flag allumé : lit le nouvel indice, à l'échelle d'affichage (×100)", () => {
    expect(qcScore({ score_qc: 42, salience_index_qc: 0.685 } as never, true)).toBeCloseTo(68.5, 6);
    expect(rocScore({ score_roc: 7, salience_index_roc: 0.201 } as never, true)).toBeCloseTo(20.1, 6);
  });
  it("colonne du nouvel indice absente (lignes anciennes) : 0, jamais NaN", () => {
    expect(qcScore({ score_qc: 42 } as never, true)).toBe(0);
    expect(rocScore({ score_roc: 7 } as never, true)).toBe(0);
    expect(qcScore({ salience_index_qc: null } as never, true)).toBe(0);
  });
});

describe("inertie du flag éteint", () => {
  // Le contrat de cette PR : tant que SALIENCE_CUTOVER vaut false, rien ne
  // bouge à l'écran, MÊME si les colonnes du nouvel indice sont déjà dans le
  // snapshot (elles le seront dès le prochain refresh, cf. tables.json).
  it("le classement se calcule sur l'ANCIEN indice malgré la présence du nouveau", () => {
    const [story] = storiesFrom24h(ROWS as never, false);
    // Poids de récence : bloc 16 = 1, bloc 12 (4 h plus tôt) = 2^(-4/10).
    const w = Math.pow(2, -4 / 10);
    expect(story.sumQc).toBeCloseTo(60 + 40 * w, 6);
    expect(story.peakQc).toBe(60);
  });
  // CANARI DE BASCULE — à retourner AVEC le flag, le jour J. Ce n'est pas un
  // invariant mais un état déclaré : il rend la PR dormante vérifiable, et il
  // fait apparaître le flip dans le diff des tests plutôt que dans une seule
  // ligne perdue d'un module de constantes.
  it("canari : la PR est livrée dormante (flag éteint)", () => {
    expect(SALIENCE_CUTOVER).toBe(false);
  });
});

describe("bascule du flag", () => {
  it("le classement se calcule sur le NOUVEL indice, à l'échelle ×100", () => {
    const [story] = storiesFrom24h(ROWS as never, true);
    const w = Math.pow(2, -4 / 10);
    expect(story.sumQc).toBeCloseTo(10 + 20 * w, 6);
    // Le sommet suit le nouvel indice : c'est le bloc de 12 h (0,2), pas celui
    // de 16 h que désignait l'ancien. Les deux indices ne classent pas pareil,
    // et c'est précisément ce que la bascule change.
    expect(story.peakQc).toBeCloseTo(20, 6);
  });
});

describe("grilles de seuils du nouvel indice", () => {
  const grilles = {
    "cumul QC": NEW_SUM_QC_THRESHOLDS,
    "bloc QC": NEW_BLOCK_QC_THRESHOLDS,
    "cumul ROC": NEW_SUM_ROC_THRESHOLDS,
    "bloc ROC": NEW_BLOCK_ROC_THRESHOLDS,
  };
  for (const [nom, g] of Object.entries(grilles)) {
    it(`${nom} : bornes strictement croissantes (sinon rawRank devient incohérent)`, () => {
      const v = [g.faible, g.moyenne, g.eleve, g.tresEleve, g.extreme];
      for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThan(v[i - 1]);
    });
  }

  // L'INVARIANT ε d'Adrien (décision du 19-07, réaffirmée sur #224 le 08-08),
  // écrit ici en assertion plutôt qu'en commentaire : une histoire portée par un
  // seul média ne doit jamais atteindre la bande « Modérée ». Le plus fort cumul
  // 24 h mono-média mesuré sur la fenêtre spec v1 vaut 44,7 (×100).
  const MONO_MAX_MESURE = 44.7;
  it("garde mono-média : la borne « Modérée » du badge reste au-dessus du plus fort mono-média", () => {
    expect(NEW_SUM_QC_THRESHOLDS.moyenne).toBeGreaterThan(MONO_MAX_MESURE);
    expect(rawRank(MONO_MAX_MESURE, NEW_SUM_QC_THRESHOLDS)).toBeLessThanOrEqual(2);
  });

  it("scaleThresholds passe une grille publiée à l'échelle d'affichage", () => {
    const t = scaleThresholds({ faible: 0.198, moyenne: 0.275, eleve: 0.386, tresEleve: 0.554, extreme: 0.646 });
    expect(t.faible).toBeCloseTo(19.8, 6);
    expect(t.extreme).toBeCloseTo(64.6, 6);
    expect(NEW_INDEX_SCALE).toBe(100);
  });
  it("scaleThresholds(null) reste null — c'est le signal « prends le repli »", () => {
    expect(scaleThresholds(null)).toBeNull();
  });
});

// ── Garde flag ↔ méthodologie (vitrine#271, règle « la métho n'est jamais
// périmée ») ────────────────────────────────────────────────────────────────
// La page Méthodologie est du HTML statique : aucun flag ne peut la conditionner
// à l'exécution. Ce test la conditionne au BUILD, dans les DEUX sens — publier
// le nouvel indice sans réécrire le §03 laisserait la page décrire un calcul
// abandonné ; réécrire le §03 avant la bascule ferait décrire un calcul qui ne
// tourne pas encore. Les deux sont la même faute, et les deux échouent ici.
describe("garde : le flag et la page Méthodologie basculent ensemble", () => {
  const metho = fs.readFileSync(
    path.resolve(process.cwd(), "public", "methodologie", "index.html"), "utf8");
  const decritAncien = metho.includes("IndiceAbsolu(o, m, t) = TempsEnUne");
  const decritNouveau = metho.includes("moyenne géométrique");

  it("la page décrit exactement l'indice qui tourne", () => {
    if (SALIENCE_CUTOVER) {
      expect(decritNouveau,
        "SALIENCE_CUTOVER est allumé : installez docs/methodologie-03-spec-v1.html dans public/methodologie/index.html (§ 03).").toBe(true);
      expect(decritAncien,
        "Le § 03 décrit encore l'ancien indice alors que le nouveau est en ligne.").toBe(false);
    } else {
      expect(decritAncien,
        "Le § 03 ne décrit plus l'ancien indice alors que c'est lui qui tourne (SALIENCE_CUTOVER est éteint).").toBe(true);
      expect(decritNouveau,
        "Le § 03 décrit le nouvel indice avant la bascule : la page annoncerait un calcul qui ne tourne pas.").toBe(false);
    }
  });

  it("le § 03 de remplacement est prêt et complet", () => {
    const remplacement = fs.readFileSync(
      path.resolve(process.cwd(), "docs", "methodologie-03-spec-v1.html"), "utf8");
    expect(remplacement).toContain('<section id="indice-saillance"');
    expect(remplacement).toContain("moyenne géométrique");
    expect(remplacement).not.toContain("IndiceAbsolu(o, m, t) = TempsEnUne");
  });
});
