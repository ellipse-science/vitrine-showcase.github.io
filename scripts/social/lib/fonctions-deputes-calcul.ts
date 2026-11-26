// CALCULS COMMUNS des fiches de fonctions des député·es : indemnités au jour
// le jour, domaines des dossiers et vis-à-vis ministre / porte-parole.
// Partagés par scripts/social/fonctions-deputes.ts (43e, fiches de l'ANQ) et
// scripts/social/sources-cartes-dimension.ts (44e et suivantes, dimension
// dim-qc-parliament). Déplacés tels quels : la 43e se régénère à l'identique.

export type FonctionPayee = { titre: string; pct: number; debut: string; fin: string };
export type FicheCalcul = {
  assnat_id: string;
  nom: string;
  fonctions_remunerees: { titre: string }[];
  porte_parole: string[];
  fonctions_legislature: FonctionPayee[];
  porte_parole_legislature: { titre: string; debut: string; fin: string }[];
};
export type VisAVis = { assnat_id: string; nom: string; dossiers: string[] };
export type VisAVisLegislature = VisAVis & { jours: number };

export const INDEMNITE_BASE = 146_375;

// Indemnité annuelle de base au fil de la législature, relevée sur les versions
// archivées de la page « Indemnités et allocations » (archive.org) et dans la
// loi de 2023 (L.Q. 2023, c. 14, en vigueur le 7 juin 2023, sans rétroactivité).
// Les POURCENTAGES des fonctions n'ont pas changé de 2022 à 2026 : seule la base
// bouge, et l'indemnité additionnelle la suit.
export const BASES: [string, number][] = [
  ["2022-04-01", 101_561], // inchangée au 1er avril 2023
  ["2023-06-07", 131_766],
  ["2025-04-01", 141_625],
  ["2026-04-01", 146_375],
];

export function baseAu(jour: string): number {
  let b = BASES[0][1];
  for (const [depuis, montant] of BASES) if (jour >= depuis) b = montant;
  return b;
}

export function jourSuivant(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Somme touchée du `debut` inclus au `fin` exclu, au jour le jour : base du
 *  jour + la plus élevée des indemnités additionnelles actives ce jour-là (pas
 *  de cumul). Taux quotidien = montant annuel ÷ 365. */
/** Moyenne par année de mandat : le total ramené à 365 jours de présence.
 *  Un élu de partielle n'a pas siégé quatre ans ; divisé par la législature
 *  entière, il paraîtrait sous-payé. */
export function moyenneAnnuelle(total: number, debut: string, finExclue: string): number {
  const jours = Math.round((Date.parse(finExclue) - Date.parse(debut)) / 86_400_000);
  return Math.round((total * 365) / jours);
}

export function totalTouche(debut: string, fin: string, payees: { pct: number; debut: string; fin: string | null }[]): number {
  let total = 0;
  for (let j = debut; j < fin; j = jourSuivant(j)) {
    const base = baseAu(j);
    let pct = 0;
    for (const p of payees) if (p.debut <= j && (!p.fin || j <= p.fin) && p.pct > pct) pct = p.pct;
    total += (base * (1 + pct / 100)) / 365;
  }
  return Math.round(total);
}

// VIS-À-VIS — un dossier de porte-parole (« … en matière de santé ») est
// rapproché du ministre dont le titre partage le plus de mots avec lui
// (« Ministre de la Santé »). Les mots ne suffisent pas toujours : ce tableau
// tranche À LA MAIN les dossiers dont le ministre ne se lit pas dans le titre,
// ou que les mots attribuaient à tort. `null` = aucun vis-à-vis certain ; le
// dossier est alors écarté plutôt que deviné. Clé : le domaine du dossier, en
// minuscules, tel que `domaine()` le produit. Valeur : le DÉBUT du titre du
// portefeuille, pas le nom du ministre : deux « Eric Girard » siègent (Groulx
// et Lac-Saint-Jean), et un remaniement ne doit pas rendre la table fausse.
export const VIS_A_VIS_MANUELS: Record<string, string | null> = {
  "relations canadiennes": "Ministre responsable des Relations canadiennes",
  "relations canadiennes et de francophonie canadienne": "Ministre responsable des Relations canadiennes",
  "travail et d’emploi": "Ministre du Travail",
  "francophonie": "Ministre des Relations internationales et de la Francophonie",
  "protection des consommateurs": "Ministre de la Justice", // l'OPC relève de la Justice
  "suivi du rapport rebâtir la confiance": "Ministre de la Justice",
  "loi électorale": "Ministre responsable des Institutions démocratiques",
  "cpe": "Ministre de la Famille",
  "soins à domicile": "Ministre de la Santé",
  "protection de la jeunesse": "Ministre responsable des Services sociaux", // la DPJ
  "sports, de loisirs, de plein air et de saines habitudes de vie": "Ministre responsable du Sport",
  "soins de fin de vie": "Ministre de la Santé",
  "paradis fiscaux": "Ministre des Finances",
  "métropole": "Ministre responsable de la Métropole",
  "capitale-nationale": "Ministre responsable de la région de la Capitale-Nationale",
  "économie sociale": null,
  "communautés lgbtq+": null,
  "communauté 2slgbtqia+": null,
  "communauté lgbtqia2s+": null,
  "personnes vivant avec un handicap ou avec le spectre de l’autisme": null,
  "nationalisme inclusif": null,
  "éthique": null,
  "indépendance du québec": null,
  "indépendance": null,
  "ordres professionnels": null,
  "relations avec les citoyens": null,
  "lutte contre l’intimidation": null,
  "défense et d’aéronautique": null,
  "allègement réglementaire": null,
};


export const MOTS_VIDES = new Set(("de la le les l d des du et en au aux a à matière ministre responsable " +
  "déléguée délégué porte-parole opposition officielle groupe deuxième troisième lutte contre " +
  "relations avec sur pour ainsi que").split(" "));

/** « Porte-parole de l'opposition officielle en matière de santé » → « santé » ;
 *  « Ministre responsable de l'Habitation » → « Habitation ». */
export function domaine(titre: string): string {
  return titre
    .replace(/^Porte-parole .*? (?:en matière|pour) (?:de la |de l’|d’|de |des |du |la |le |les |l’)?/, "")
    .replace(/^Ministre (?:délégué(?:e)? |responsable )?(?:à la |à l’|aux |au |à |de la |de l’|des |du |de )?/, "");
}

export function racines(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[’']/g, " ").split(/[^\p{L}-]+/u)
    .filter((w) => w && !MOTS_VIDES.has(w)).map((w) => w.slice(0, 5)));
}


/** Vis-à-vis à la date de référence, par identifiant de l'Assemblée. Renvoie,
 *  pour chaque fiche concernée, ses vis-à-vis, et la liste des dossiers non
 *  appariés (à trancher dans VIS_A_VIS_MANUELS). */
export function visAVisALaDate(deputes: FicheCalcul[]): { parId: Map<string, VisAVis[]>; nonApparies: string[] } {
  // VIS-À-VIS, par identifiant de l'Assemblée (deux « Eric Girard »). Les titres
  // régionaux (« … de la région de la Mauricie ») ne désignent pas un
  // portefeuille ; la Métropole, si.
  const portefeuilles = deputes.flatMap((d) => d.fonctions_remunerees
    .filter((f) => /^Ministre\b/.test(f.titre))
    .map((f) => ({ id: d.assnat_id, titre: f.titre, regional: /^Ministre responsable de la région/.test(f.titre), racines: racines(domaine(f.titre)) })));
  const nomDe = new Map(deputes.map((d) => [d.assnat_id, d.nom]));
  const nonApparies: string[] = [];
  const faceA = new Map<string, Map<string, string[]>>(); // porte-parole → ministre → dossiers (ids)
  for (const d of deputes) {
    for (const titre of d.porte_parole) {
      if (/région/.test(titre) && !/Capitale-Nationale/.test(titre)) continue;
      const dom = domaine(titre);
      const manuel = VIS_A_VIS_MANUELS[dom.toLowerCase()];
      let ministre: string | null = null;
      if (manuel !== undefined) {
        const titulaires = [...new Set(portefeuilles.filter((p) => manuel && p.titre.startsWith(manuel)).map((p) => p.id))];
        if (manuel && titulaires.length !== 1) console.warn(`\n  ⚠️ « ${manuel} » : ${titulaires.length} titulaire(s) — table VIS_A_VIS_MANUELS à revoir.`);
        ministre = titulaires.length === 1 ? titulaires[0] : null;
      } else {
        const r = racines(dom);
        let meilleur = 0;
        let candidats: string[] = [];
        for (const p of portefeuilles) {
          if (p.regional) continue;
          const s = [...r].filter((w) => p.racines.has(w)).length / Math.max(1, Math.min(r.size, p.racines.size));
          if (s > meilleur) { meilleur = s; candidats = [p.id]; }
          else if (s === meilleur && s > 0 && !candidats.includes(p.id)) candidats.push(p.id);
        }
        // Ex æquo ou recoupement trop maigre : on n'invente pas de duel.
        ministre = meilleur >= 0.5 && candidats.length === 1 ? candidats[0] : null;
      }
      if (!ministre) { nonApparies.push(`${d.nom} — ${dom}`); continue; }
      const parMinistre = faceA.get(d.assnat_id) ?? new Map<string, string[]>();
      parMinistre.set(ministre, [...(parMinistre.get(ministre) ?? []), dom]);
      faceA.set(d.assnat_id, parMinistre);
    }
  }
  const trie = (m: Map<string, string[]>) => [...m].sort((a, b) => b[1].length - a[1].length)
    .map(([id, dossiers]) => ({ assnat_id: id, nom: nomDe.get(id)!, dossiers }));
  const parId = new Map<string, VisAVis[]>();
  for (const d of deputes) {
    const commeCritique = faceA.get(d.assnat_id);
    if (commeCritique) { parId.set(d.assnat_id, trie(commeCritique)); continue; }
    // Un ministre a pour vis-à-vis les porte-parole qui l'affrontent.
    const critiques = new Map<string, string[]>();
    for (const [critique, ministres] of faceA) {
      const dossiers = ministres.get(d.assnat_id);
      if (dossiers) critiques.set(critique, dossiers);
    }
    if (critiques.size) parId.set(d.assnat_id, trie(critiques));
  }

  return { parId, nonApparies };
}

/** Vis-à-vis sur toute la législature, au prorata des jours de chevauchement.
 *  `anciens` : les élus partis en cours de route, avec leurs fonctions payées. */
export function visAVisSurLaLegislature(
  deputes: FicheCalcul[],
  anciens: { assnat_id: string; nom: string; fonctions: FonctionPayee[] }[],
): Map<string, VisAVisLegislature[]> {
  // VIS-À-VIS SUR TOUTE LA LÉGISLATURE. Celui de la dissolution (ci-dessus)
  // ignorait les duels passés : Dubé à la Santé, Guilbault aux Transports…
  // Chaque dossier de porte-parole, DATÉ, est rapproché des ministres qui
  // tenaient le portefeuille PENDANT cette période, au prorata des jours de
  // chevauchement. Sert à la rareté des cartes : sans lui, les députés de
  // l'opposition, qui ne peuvent pas être ministres, n'y montaient jamais.
  const mandatsMinistre = [
    ...deputes.flatMap((d) => d.fonctions_legislature.map((x) => ({ id: d.assnat_id, ...x }))),
    ...anciens.flatMap((a) => a.fonctions.map((x) => ({ id: a.assnat_id, ...x }))),
  ].filter((x) => /^Ministre\b/.test(x.titre) && !/^Ministre responsable de la région/.test(x.titre))
    .map((x) => ({ ...x, racines: racines(domaine(x.titre)) }));
  const nomsTous = new Map([...deputes.map((d) => [d.assnat_id, d.nom] as const), ...anciens.map((a) => [a.assnat_id, a.nom] as const)]);
  const chevauche = (a1: string, a2: string, b1: string, b2: string) => {
    const d = a1 > b1 ? a1 : b1;
    const f = a2 < b2 ? a2 : b2;
    return d > f ? 0 : Math.round((Date.parse(f) - Date.parse(d)) / 86_400_000) + 1;
  };
  const duels = new Map<string, Map<string, { jours: number; dossiers: Set<string> }>>(); // porte-parole → ministre
  let dossiersSansMinistre = 0;
  for (const d of deputes) {
    for (const pp of d.porte_parole_legislature) {
      if (/région/.test(pp.titre) && !/Capitale-Nationale/.test(pp.titre)) continue;
      const dom = domaine(pp.titre);
      const manuel = VIS_A_VIS_MANUELS[dom.toLowerCase()];
      if (manuel === null) continue;
      const pendant = mandatsMinistre.filter((m) => chevauche(pp.debut, pp.fin, m.debut, m.fin) > 0);
      let retenus: typeof pendant = [];
      if (manuel !== undefined) retenus = pendant.filter((m) => m.titre.startsWith(manuel));
      else {
        const r = racines(dom);
        let meilleur = 0;
        for (const m of pendant) {
          const s = [...r].filter((w) => m.racines.has(w)).length / Math.max(1, Math.min(r.size, m.racines.size));
          if (s > meilleur) { meilleur = s; retenus = [m]; } else if (s === meilleur && s > 0) retenus.push(m);
        }
        if (meilleur < 0.5) retenus = [];
      }
      if (!retenus.length) { dossiersSansMinistre++; continue; }
      const parMinistre = duels.get(d.assnat_id) ?? new Map();
      for (const m of retenus) {
        const e = parMinistre.get(m.id) ?? { jours: 0, dossiers: new Set<string>() };
        e.jours += chevauche(pp.debut, pp.fin, m.debut, m.fin);
        e.dossiers.add(dom);
        parMinistre.set(m.id, e);
      }
      duels.set(d.assnat_id, parMinistre);
    }
  }
  const versListe = (m: Map<string, { jours: number; dossiers: Set<string> }>) => [...m]
    .sort((a, b) => b[1].jours - a[1].jours)
    .map(([id, e]) => ({ assnat_id: id, nom: nomsTous.get(id)!, jours: e.jours, dossiers: [...e.dossiers] }));
  const visAVisLegislature = new Map<string, VisAVisLegislature[]>();
  for (const [critique, m] of duels) visAVisLegislature.set(critique, versListe(m));
  for (const id of nomsTous.keys()) {
    if (visAVisLegislature.has(id)) continue;
    const face = new Map<string, { jours: number; dossiers: Set<string> }>();
    for (const [critique, m] of duels) { const e = m.get(id); if (e) face.set(critique, e); }
    if (face.size) visAVisLegislature.set(id, versListe(face));
  }
  console.log(`\n  vis-à-vis sur la législature : ${duels.size} porte-parole, ${dossiersSansMinistre} dossier(s) sans ministre apparié`);

  return visAVisLegislature;
}

// Lecture des fiches de l'Assemblée : dates en toutes lettres et texte brut.
export const MOIS: Record<string, number> = {
  janvier: 1, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12,
};

export function isoDate(s: string): string | null {
  const m = s.match(/(\d{1,2})(?:er)? (\p{L}+) (\d{4})/u);
  if (!m || !MOIS[m[2]]) return null;
  return `${m[3]}-${String(MOIS[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export function texte(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}
