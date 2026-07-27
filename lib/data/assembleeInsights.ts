// Logique de comparaison inter-partis, partagée par la vue principale
// (AssembleeProfiles.tsx) et l'easter egg (AssembleeBilliard.tsx) : les deux
// doivent raconter EXACTEMENT la même chose sur un même parti/une même
// facette, seulement avec une mise en forme différente.
//
// Fichier séparé de lib/data/assemblee.ts (qui lit le JSON via node:fs) :
// ce module est importé par des Client Components, et un import de valeur
// (pas juste de type) depuis un fichier utilisant node:fs casse le bundle
// client (Turbopack : « chunking context does not support external
// modules »).

import type { AssembleeRow } from "@/lib/data/assemblee";

export type FacetKind = "issue" | "tone" | "richness" | "words" | "bonus-angle" | "bonus-word";

function fmtWords(n: number): string {
  const s = String(Math.round(n || 0));
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += " ";
    out += s[i];
  }
  return out;
}

// Chaque chiffre doit rester lisible seul (l'absolu) tout en situant le
// parti par rapport aux autres (le relatif) — retour utilisateur du
// 2026-07-24 (jeu de billard).
function averageCompare(
  otherValues: number[],
  own: number,
  tolerance: number,
  above: (avg: number) => string,
  below: (avg: number) => string,
  similar: (avg: number) => string,
): string {
  if (otherValues.length === 0) return "";
  const avg = otherValues.reduce((s, v) => s + v, 0) / otherValues.length;
  const diff = own - avg;
  if (Math.abs(diff) < tolerance) return similar(avg);
  return diff > 0 ? above(avg) : below(avg);
}

// Dit toujours de quoi situer le parti par rapport aux autres, jamais son
// chiffre isolé seul (même retour utilisateur). Ton : « favorable /
// défavorable », pas « positif / négatif » (adaptation du Guide de
// rédaction CAPP/CLESSN pour le ton médiatique, appliquée ici au ton en
// chambre — cf. .claude/skills/redaction-editoriale).
export function facetResult(row: AssembleeRow, kind: FacetKind, allRows: AssembleeRow[]): { title: string; body: string } {
  const others = allRows.filter((r) => !r.inShadow && r.key !== row.key);
  switch (kind) {
    case "issue": {
      const top = row.enjeuStack?.[0];
      if (!top) return { title: "Enjeu dominant", body: "Aucun enjeu détecté cette période." };
      const sameTop = others.filter((r) => r.enjeuStack?.[0]?.label === top.label);
      const compare = sameTop.length === 0
        ? " Aucun autre parti actif ne place cet enjeu au premier rang."
        : ` ${sameTop.length} autre${sameTop.length > 1 ? "s" : ""} parti${sameTop.length > 1 ? "s" : ""} actif${sameTop.length > 1 ? "s" : ""} partage${sameTop.length > 1 ? "nt" : ""} aussi cette priorité.`;
      return { title: "Enjeu dominant", body: `${top.title}${compare}` };
    }
    case "tone": {
      const pct = row.toneLeftPct ?? 50;
      const dir = pct > 55 ? "plutôt favorable" : pct < 45 ? "plutôt défavorable" : "neutre";
      const compare = averageCompare(
        others.map((r) => r.toneLeftPct ?? 50),
        pct,
        3,
        (avg) => `Plus favorable que la moyenne des autres partis actifs (${Math.round(avg)} % en moyenne).`,
        (avg) => `Plus défavorable que la moyenne des autres partis actifs (${Math.round(avg)} % en moyenne).`,
        (avg) => `Comparable à la moyenne des autres partis actifs (${Math.round(avg)} % en moyenne).`,
      );
      return { title: "Ton en chambre", body: `${row.label} tient un ton ${dir} (${Math.round(pct)} % vers le pôle favorable de l'échelle). ${compare}` };
    }
    case "richness": {
      const lvl = row.richnessLevel ?? 1;
      const compare = averageCompare(
        others.map((r) => r.richnessLevel ?? 1),
        lvl,
        0.4,
        (avg) => `Plus varié que la moyenne des autres partis actifs (${avg.toFixed(1)}/5 en moyenne).`,
        (avg) => `Moins varié que la moyenne des autres partis actifs (${avg.toFixed(1)}/5 en moyenne).`,
        (avg) => `Comparable à la moyenne des autres partis actifs (${avg.toFixed(1)}/5 en moyenne).`,
      );
      return { title: "Richesse lexicale", body: `Niveau ${lvl}/5 : diversité du vocabulaire employé cette période. ${compare}` };
    }
    case "words": {
      const raw = row.wordsRaw ?? 0;
      const compare = averageCompare(
        others.map((r) => r.wordsRaw ?? 0),
        raw,
        raw * 0.05 || 1,
        (avg) => `Plus loquace que la moyenne des autres partis actifs (${fmtWords(avg)} mots en moyenne).`,
        (avg) => `Moins loquace que la moyenne des autres partis actifs (${fmtWords(avg)} mots en moyenne).`,
        (avg) => `Comparable à la moyenne des autres partis actifs (${fmtWords(avg)} mots en moyenne).`,
      );
      return { title: "Mots prononcés", body: `${row.wordsFormatted ?? "0"} mots prononcés cette période. ${compare}` };
    }
    case "bonus-angle":
      return { title: "Angle éditorial", body: row.editorialAngle || "Aucun angle éditorial généré pour cette période." };
    case "bonus-word":
      return row.signatureWord
        ? { title: "Mot distinctif", body: `« ${row.signatureWord} »${row.signatureWordContext ? ` (${row.signatureWordContext})` : ""}. Le mot qui distingue le plus ${row.label} des autres partis cette période.` }
        : { title: "Mot distinctif", body: "Calcul en cours, bientôt disponible." };
  }
}
