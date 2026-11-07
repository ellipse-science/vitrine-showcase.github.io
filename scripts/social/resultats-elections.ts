// Résultat électoral de chaque siège de la 43e législature, pour les cartes de
// député : l'élection générale du 3 octobre 2022 et les partielles qui ont
// suivi.
//
//   npx tsx scripts/social/resultats-elections.ts
//
// SOURCE : données ouvertes d'Élections Québec (dgeq.org, « Archives des
// données »), un resultats.json par scrutin. On n'en garde que le gagnant de
// chaque circonscription : ses voix, sa part, son avance sur le deuxième
// (`nbVoteAvance`, calculée par Élections Québec) et la participation.

import fs from "node:fs/promises";
import path from "node:path";

const ARCHIVES = "https://donnees.electionsquebec.qc.ca/production/provincial/resultats/archives";
const SORTIE = path.resolve(process.cwd(), "scripts/social/donnees/resultats-elections.json");

/** Scrutins de la 43e législature. À compléter si une partielle s'ajoute. */
const SCRUTINS = [
  { code: "gen2022-10-03", date: "2022-10-03", type: "générale" },
  { code: "part2023-03-13", date: "2023-03-13", type: "partielle" },
  { code: "part2023-10-02", date: "2023-10-02", type: "partielle" },
  { code: "part2025-03-17", date: "2025-03-17", type: "partielle" },
  { code: "part2025-08-11", date: "2025-08-11", type: "partielle" },
  { code: "part2026-02-23", date: "2026-02-23", type: "partielle" },
];

type Candidat = {
  nom: string; prenom: string; abreviationPartiPolitique: string;
  nbVoteTotal: number; tauxVote: number; nbVoteAvance: number;
};
type Circonscription = {
  nomCirconscription: string; isResultatsFinaux: boolean;
  nbVoteValide: number; tauxParticipation: string; candidats: Candidat[];
};

async function main() {
  const resultats = [];
  for (const s of SCRUTINS) {
    const rep = await fetch(`${ARCHIVES}/${s.code}/resultats.json`);
    if (!rep.ok) throw new Error(`${s.code} : HTTP ${rep.status}`);
    const { circonscriptions } = (await rep.json()) as { circonscriptions: Circonscription[] };
    for (const c of circonscriptions) {
      if (!c.isResultatsFinaux) console.warn(`  ⚠️ ${s.code} ${c.nomCirconscription} : résultats non finaux.`);
      const tries = [...c.candidats].sort((a, b) => b.nbVoteTotal - a.nbVoteTotal);
      const g = tries[0];
      resultats.push({
        scrutin: s.code,
        date: s.date,
        type: s.type,
        circonscription: c.nomCirconscription,
        gagnant: `${g.prenom} ${g.nom}`,
        nom_famille: g.nom,
        parti: g.abreviationPartiPolitique,
        voix: g.nbVoteTotal,
        pourcentage: g.tauxVote,
        avance: g.nbVoteAvance || g.nbVoteTotal - (tries[1]?.nbVoteTotal ?? 0),
        participation: Number(c.tauxParticipation),
      });
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await fs.mkdir(path.dirname(SORTIE), { recursive: true });
  await fs.writeFile(SORTIE, JSON.stringify({
    source: "Élections Québec, données ouvertes (dgeq.org, archives des résultats)",
    extrait_le: new Date().toISOString().slice(0, 10),
    resultats,
  }, null, 2) + "\n", "utf8");
  console.log(`  ${resultats.length} résultats de circonscription (${SCRUTINS.length} scrutins) → ${path.relative(process.cwd(), SORTIE)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
