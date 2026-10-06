// LE JEU COMPLET : à partir des données de l'Assemblée et des sources, les
// cartes de la série entière — numéro par siège, rareté, fonction, fiche
// électorale, parcours et rémunération. Toujours la série ENTIÈRE : un numéro
// ou une rareté n'ont de sens que sur l'ensemble (voir les commentaires).
// Partagé entre le générateur imprimé et le site.
// Origine : scripts/social/cartes-deputes.ts, main() (extraction du 2 oct. 2026).
import type { PeriodKey } from "@/lib/data/assemblee";
import { PARTY_COLORS } from "@/lib/data/partis-constantes";
import type { DonneesAssemblee, Sources } from "./donnees";
import {
  AXE_DEBUT, AXE_FIN, CHEFS, COULEUR_INDEPENDANT, EDITION_LEGISLATURE, LIBELLE_RARETE, PARTI_ACTUEL_PAR_SIEGE,
  PROPORTIONS_RARETE, accorderGenre, cleDistrict, codeFonction, dateFr, distance, finitIndependant, lendemain,
  libelleFonction, ligneCarriere, ligneMandat, nomImprime, positionAxe, rubanChefParlementaire, slugCirco,
  titreCourt, trame, trouverMandat,
} from "./fonctions";
import type { Carte, FicheFonctions, Rarete, Serie } from "./types";

export type JeuComplet = { cartes: Carte[]; serie: Serie };

/** Construit la série complète pour une période. Les avertissements de
 *  relecture (appariements manqués, titres orphelins) partent sur la console,
 *  comme dans le générateur : le build du site les affiche aussi. */
export function construireJeu(
  data: DonneesAssemblee,
  periode: PeriodKey,
  sources: Sources,
  options: { annee?: number } = {},
): JeuComplet {
  const vue = data.periods[periode];
  if (!vue) throw new Error(`Période inconnue : ${periode} (legislature, session ou last_pdq).`); // garde-redaction: ok (diagnostic de console au build, jamais affiché)

  // LE JEU COMPLET D'ABORD, la sélection ensuite. Le numéro de carte doit être
  // celui de la série entière : tiré après un filtre, « --only tanguay »
  // donnerait la carte n° 1 sur 1, ce qui ne veut rien dire sur un carton de
  // collection. On numérote donc les sièges dans l'ordre alphabétique des
  // circonscriptions, puis on filtre.
  const cartesPartis = vue.rows.flatMap((row) =>
    (row.deputies ?? []).map((deputy) => ({
      slug: slugCirco(deputy), deputy, parti: row.label, cle: row.key as Carte["cle"],
      couleur: PARTY_COLORS[row.key] ?? row.color,
    })));
  // Les indépendants n'ont pas de casier sur le site, mais leur siège a sa
  // carte : sans eux la série s'arrêtait à 124 (Saint-Jérôme manquait). Seuls
  // ceux dont le siège n'a AUCUNE autre carte entrent : un élu passé
  // indépendant en cours de route (La Prairie, Saint-Laurent…) a déjà la
  // sienne, sous son parti d'élection.
  const siegesPartis = new Set(cartesPartis.map((c) => cleDistrict(c.deputy.circonscription ?? c.slug)));
  const jeuBrut = cartesPartis.concat((vue.independants ?? [])
    .filter((deputy) => !siegesPartis.has(cleDistrict(deputy.circonscription ?? slugCirco(deputy))))
    .map((deputy) => ({
      slug: slugCirco(deputy), deputy, parti: "Indépendant", cle: "ind" as const, couleur: COULEUR_INDEPENDANT,
    })));
  const jeu: (typeof jeuBrut[number] & { partiElu?: string })[] = jeuBrut.filter((c) => {
    const partiActuel = PARTI_ACTUEL_PAR_SIEGE[c.slug];
    return !partiActuel || c.cle === partiActuel;
  });
  jeu.sort((a, b) => a.slug.localeCompare(b.slug, "fr"));

  // FIN DE LÉGISLATURE INDÉPENDANTE ⇒ CARTE INDÉPENDANTE (Jules, 23-09). Le
  // loader range un élu sous le parti de ses lignes de parole ; la carte, elle,
  // montre ce qu'il EST au bout de la législature (ou à son départ). Couleur
  // neutre, pas d'écusson ; le parti d'élection reste nommé (« élu CAQ »).
  for (const c of jeu) {
    if (c.cle === "ind" || !finitIndependant(c.deputy)) continue;
    c.partiElu = c.parti;
    c.parti = "Indépendant";
    c.cle = "ind";
    c.couleur = COULEUR_INDEPENDANT;
  }

  // ANNÉE DE L'ÉDITION — heure de MONTRÉAL, comme tout ce qui porte une date
  // dans ce dépôt (règle dure : les horaires sont en heure locale, pas UTC).
  const annee = options.annee
    ?? Number(new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", year: "numeric" }).format(new Date()));

  // UN NUMÉRO PAR SIÈGE, pas par élu. Les députés remplacés en cours de
  // législature (démission, partielle) partagent le numéro de leur
  // circonscription avec une lettre : Arthabaska est la 7, Boissonneault la 7,
  // Lefebvre la 7A. Numérotés à la suite, ces anciens élus prenaient les cartes
  // 1 à 4 (leur slug est un identifiant numérique) et gonflaient la série à 128.
  const siege = (c: (typeof jeu)[number]) => cleDistrict(c.deputy.circonscription ?? c.slug);
  const finMandat = (c: (typeof jeu)[number]) => c.deputy.affiliationHistory?.at(-1)?.endDate;
  const sieges = [...new Set(jeu.map(siege))].sort((a, b) => a.localeCompare(b, "fr"));
  const rangSiege = new Map(sieges.map((s, i) => [s, i + 1]));
  const variante = new Map<(typeof jeu)[number], string>();
  const depart = new Map<(typeof jeu)[number], NonNullable<Carte["depart"]>>();
  for (const s of sieges) {
    // L'élu en poste est celui dont le mandat finit le plus tard — ou pas du
    // tout. Pas « sans date de fin » : une défection vers le statut
    // d'indépendant (Orford, avril 2026) ferme le dernier segment publié alors
    // que l'élu siège toujours. Les anciens suivent, du plus récemment parti au
    // plus ancien : A, B…
    const occupants = jeu.filter((c) => siege(c) === s)
      .sort((a, b) => (finMandat(b) ?? "9999").localeCompare(finMandat(a) ?? "9999"));
    if (occupants.filter((c) => !finMandat(c)).length > 1) {
      console.warn(`  ⚠️ ${s} : plusieurs élus sans fin de mandat — vérifier la numérotation.`); // garde-redaction: ok (diagnostic de console au build, jamais affiché)
    }
    occupants.slice(1).forEach((c, i) => variante.set(c, String.fromCharCode(65 + i)));
    for (const c of occupants.slice(1)) {
      const fin = c.deputy.affiliationHistory?.at(-1);
      const quand = dateFr(fin?.endDate);
      depart.set(c, {
        titre: fin?.endReason === "resignation" ? `Démission le ${quand}`
          : fin?.endReason === "death" ? `Décès le ${quand}`
          : `A quitté son siège le ${quand}`,
        successeur: `Siège repris par ${nomImprime(occupants[0].deputy.name)} (carte ${rangSiege.get(s)})`,
      });
    }
  }

  const { mandats, fonctions, genres, carrieres, scrutins } = sources;
  const cartes: Carte[] = jeu.map((c) => ({
    ...c, numero: rangSiege.get(siege(c))!, variante: variante.get(c) ?? "",
    // « Législature 2026 · Salon bleu » : le libellé du site ne porte que
    // l'année de fin. La ligne du tableau dit déjà « Législature 2022-2026 » ;
    // l'en-tête n'a donc besoin que du lieu.
    total: sieges.length, salon: periode === "legislature" ? "Salon bleu" : vue.subtitle, annee,
    // Édition imprimée : la législature entière. Les éditions de session, en
    // ligne, portent leur année.
    edition: periode === "legislature" ? EDITION_LEGISLATURE : `Édition ${annee}`,
    mandat: ligneMandat(trouverMandat(mandats, c.deputy.name, c.slug)),
    chef: CHEFS[c.slug],
    depart: depart.get(c),
  }));

  // Une entrée de CHEFS qui ne désigne personne ne doit pas disparaître en
  // silence : la clé est un slug de circonscription, et « lassomption » au
  // lieu de « l-assomption » suffisait à escamoter le ruban du premier
  // ministre sans le moindre message.
  const slugsConnus = new Set(jeu.map((c) => c.slug));
  const orphelins = Object.keys(CHEFS).filter((k) => !slugsConnus.has(k));
  if (orphelins.length) {
    console.warn(`  ⚠️ ${orphelins.length} titre(s) de CHEFS sans élu correspondant : ${orphelins.join(", ")}`); // garde-redaction: ok (diagnostic de console au build, jamais affiché)
    console.warn("     La clé est le slug de la circonscription (« l-assomption », « camille-laurin »)."); // garde-redaction: ok (diagnostic de console au build, jamais affiché)
  }

  // SALAIRE ET VIS-À-VIS. Appariement par nom : la fiche de l'Assemblée et le
  // portrait portent la même graphie. Les anciens députés (cartes à lettre)
  // n'ont pas de fiche courante, donc ni l'un ni l'autre.
  // « Brigitte B. Garceau » (Assemblée) = « Brigitte Garceau » (portrait) : on
  // compare prénom + nom de famille, sans les initiales. Le référentiel des
  // portraits porte aussi des coquilles (« Jolin-Barette ») : à défaut
  // d'égalité, un seul candidat à deux lettres près est accepté.
  const cleNom = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/(^|\s)\p{Lu}\.(?=\s|$)/gu, " ").toLowerCase().replace(/[^a-z]/g, "");
  const cleFiche = (f: FicheFonctions) => cleNom(f.nom_famille && f.prenom ? `${f.prenom} ${f.nom_famille}` : f.nom);
  const ficheDe = (nom: string, circo?: string): FicheFonctions | undefined => {
    // La circonscription d'abord : elle départage les deux « Eric Girard ».
    if (circo) {
      const ici = fonctions.filter((f) => f.circonscription && cleDistrict(f.circonscription) === cleDistrict(circo));
      if (ici.length === 1 && distance(cleFiche(ici[0]), cleNom(nom)) <= 3) return ici[0];
    }
    const k = cleNom(nom);
    const exacte = fonctions.find((f) => cleFiche(f) === k);
    if (exacte) return exacte;
    const proches = fonctions.filter((f) => distance(cleFiche(f), k) <= 2);
    return proches.length === 1 ? proches[0] : undefined;
  };
  const ficheParCarte = new Map<Carte, FicheFonctions>();
  const sansFiche: string[] = [];
  for (const c of cartes) {
    const f = ficheDe(c.deputy.name, c.deputy.circonscription);
    if (f) ficheParCarte.set(c, f); else sansFiche.push(c.deputy.name);
  }
  const fichesVues = new Map<string, string>();
  for (const [c, f] of ficheParCarte) {
    const deja = fichesVues.get(f.assnat_id);
    if (deja) console.warn(`  ⚠️ ${deja} et ${c.deputy.name} pointent vers la même fiche (${f.nom}) : salaire faux pour l'un des deux.`);
    fichesVues.set(f.assnat_id, c.deputy.name);
  }
  if (sansFiche.length) console.warn(`  ⚠️ ${sansFiche.length} élu(s) sans fiche de fonctions : ${sansFiche.join(", ")}`); // garde-redaction: ok (diagnostic de console au build, jamais affiché)
  // ACCORD « Élu » / « Élue » : par la fiche de l'Assemblée de chaque carte.
  const neutres: string[] = [];
  for (const c of cartes) {
    if (!c.mandat.includes("Élu.e")) continue;
    const g = genres.get(ficheParCarte.get(c)?.assnat_id ?? "");
    if (!g) neutres.push(c.deputy.name);
    c.mandat = accorderGenre(c.mandat, g);
  }
  if (neutres.length) console.warn(`  ⚠️ ${neutres.length} carte(s) gardent « Élu.e », genre inconnu : ${neutres.join(", ")}`); // garde-redaction: ok (diagnostic de console au build, jamais affiché)
  for (const c of cartes) {
    const id = ficheParCarte.get(c)?.assnat_id ?? "";
    c.carriere = ligneCarriere(carrieres.get(id), genres.get(id)) || undefined;
    const car = carrieres.get(id);
    if (car) c.carriereStats = { premiere: car.premiere_election, mandats: car.mandats, genre: genres.get(id) };
  }
  const partiDe = new Map([...ficheParCarte].map(([c, f]) => [f.assnat_id, c.cle]));
  const familleDe = new Map(fonctions.map((f) => [f.assnat_id, f.nom_famille ?? f.nom]));
  const ORDRE_OPPOSITION = ["plq", "qs", "pq", "pcq", "ind"];
  for (const [c, f] of ficheParCarte) {
    c.remuneration = f.total_legislature ?? undefined;
    c.remunerationMoyenne = f.moyenne_annuelle ?? undefined;
    // PARCOURS — pour chaque jour du mandat, la fonction la mieux payée (c'est
    // elle qui fixe la rémunération : pas de cumul). Des jours consécutifs au
    // même taux forment un segment de la frise ; plusieurs portefeuilles tenus
    // en même temps restent UN segment (« Ministre (8 portefeuilles) »).
    const debutM = f.debut_mandat ?? AXE_DEBUT;
    const finM = f.fin_mandat ?? AXE_FIN;
    const tenues = (f.fonctions_legislature ?? []).filter((x) => !/^Ministre responsable de la région/.test(x.titre));
    const runs: { pct: number; titres: Set<string>; debut: string; fin: string }[] = [];
    for (let j = debutM; j <= finM; j = lendemain(j)) {
      let pct = 0;
      const titres = new Set<string>();
      for (const x of tenues) {
        if (x.debut > j || j > x.fin) continue;
        if (x.pct > pct) { pct = x.pct; titres.clear(); }
        if (x.pct === pct) titres.add(x.titre);
      }
      const dernier = runs.at(-1);
      if (dernier && dernier.pct === pct) { dernier.fin = j; for (const t of titres) dernier.titres.add(t); }
      else runs.push({ pct, titres, debut: j, fin: j });
    }
    // Légende : un niveau de rémunération par ligne, le mieux payé d'abord ;
    // l'indemnité de base seule en dernier.
    const niveaux = new Map<number, { titres: Set<string>; debut: string; fin: string }>();
    for (const r of runs) {
      const n = niveaux.get(r.pct);
      if (!n) niveaux.set(r.pct, { titres: new Set(r.titres), debut: r.debut, fin: r.fin });
      else { for (const t of r.titres) n.titres.add(t); if (r.fin > n.fin) n.fin = r.fin; }
    }
    const libelle = (pct: number, titres: Set<string>) => {
      if (pct === 0) return "Indemnité de base seulement";
      const liste = [...titres];
      if (liste.length === 1) return titreCourt(liste[0]);
      if (liste.every((t) => /^Ministre\b/.test(t))) return `Ministre (${liste.length} portefeuilles)`;
      return `${titreCourt(liste[0])} et ${liste.length - 1} autre${liste.length > 2 ? "s" : ""}`;
    };
    const annees = (d: string, a: string) => (d.slice(0, 4) === a.slice(0, 4) ? d.slice(0, 4) : `${d.slice(0, 4)}-${a.slice(0, 4)}`);
    const legende = [...niveaux].sort((a, b) => b[0] - a[0])
      .map(([pct, n]) => ({ titre: libelle(pct, n.titres), annees: annees(n.debut, n.fin), o: trame(pct) }));
    const horsMandat = [
      debutM > AXE_DEBUT ? { g: 0, w: positionAxe(debutM) } : null,
      finM < AXE_FIN ? { g: positionAxe(lendemain(finM)), w: 100 - positionAxe(lendemain(finM)) } : null,
    ].filter((x): x is { g: number; w: number } => x !== null);
    c.parcours = {
      segments: runs.filter((r) => r.pct > 0).map((r) => ({
        g: positionAxe(r.debut), w: positionAxe(lendemain(r.fin)) - positionAxe(r.debut), o: trame(r.pct),
      })),
      horsMandat,
      // TOUS les niveaux (cinq au plus, 12 élus sur 129 en ont quatre ou cinq) :
      // un « + N autres » cachait justement ce qu'on veut lire (Jules, 22-09).
      legende,
    };
    const vav = f.vis_a_vis ?? [];
    if (!vav.length) continue;
    if (f.porte_parole.length) {
      // Porte-parole : les deux ministres qu'il affronte sur le plus de dossiers.
      c.visAVis = vav.slice(0, 2).map((v) => v.nom).join(", ");
    } else {
      // Ministre : le porte-parole principal de chaque parti d'opposition.
      const unParParti = new Map<string, string>();
      for (const v of vav) {
        const p = partiDe.get(v.assnat_id);
        if (p && !unParParti.has(p)) unParParti.set(p, v.assnat_id);
      }
      c.visAVis = ORDRE_OPPOSITION.filter((p) => unParParti.has(p))
        .map((p) => `${familleDe.get(unParParti.get(p)!)} (${p.toUpperCase()})`).join(", ");
    }
  }

  // RARETÉ — calculée sur la série ENTIÈRE, avant tout filtre (--only), pour
  // qu'une carte tirée seule garde sa rareté.
  // Les mots de LA PÉRIODE DES CARTES (Jules, 3 oct.) : sur le site, la vue
  // « dernière journée » ou « session » classe les élus sur ce qu'ils ont dit
  // dans cette vue-là ; la série imprimée, celle de la législature, est
  // inchangée. Les mots sont ceux de la personne, lignes réunies.
  const classes: { c: Carte; mots: number }[] = [];
  for (const c of cartes) {
    const titres = (ficheParCarte.get(c)?.fonctions_legislature ?? []).map((x) => x.titre);
    if (titres.some((t) => /^Premi(?:ère|er) ministre$/.test(t))) { c.rarete = "legendaire"; continue; }
    if (titres.some((t) => /^Président(?:e)? de l’Assemblée nationale$/.test(t))) { c.rarete = "commune"; c.presidente = true; continue; }
    classes.push({ c, mots: c.deputy.wordsRaw ?? 0 });
  }
  classes.sort((a, b) => b.mots - a.mots || a.c.numero - b.c.numero);
  {
    let i = 0;
    for (const [rarete, part] of PROPORTIONS_RARETE) {
      const n = Math.round(part * classes.length);
      for (let k = 0; k < n && i < classes.length; k++) classes[i++].c.rarete = rarete;
    }
    for (; i < classes.length; i++) classes[i].c.rarete = "commune";
  }
  for (const c of cartes) {
    const f = ficheParCarte.get(c);
    c.codeFonction = codeFonction(f?.fonctions_legislature ?? [], (f?.porte_parole_legislature?.length ?? 0) > 0);
    c.libelleFonction = libelleFonction(c.codeFonction, genres.get(f?.assnat_id ?? ""));
    const ruban = rubanChefParlementaire(f?.fonctions_legislature ?? []);
    if (ruban && !c.chef && !c.depart) c.chef = { titre: ruban };
  }
  const decompte = new Map<Rarete, number>();
  for (const c of cartes) decompte.set(c.rarete ?? "commune", (decompte.get(c.rarete ?? "commune") ?? 0) + 1);
  const serie: Serie = {
    total: cartes.length,
    sansExpression: cartes.filter((c) => !(c.deputy.signatureWord ?? "").trim()).length,
    raretes: { commune: 0, "peu-commune": 0, rare: 0, legendaire: 0 },
  };
  for (const r of Object.keys(serie.raretes) as Rarete[]) serie.raretes[r] = decompte.get(r) ?? 0;
  console.log(`  rareté : ${[...decompte].map(([r, n]) => `${LIBELLE_RARETE[r]} ${n}`).join(" · ")}`); // garde-redaction: ok (diagnostic de console au build, jamais affiché)

  // RÉSULTAT ÉLECTORAL. Le siège ET le nom de famille doivent concorder : à
  // Chicoutimi, Laforest (2022) et Laflamme (partielle de 2026) ont chacune le
  // leur. Plusieurs scrutins concordants : le plus récent l'emporte.
  const sansScrutin: string[] = [];
  for (const c of cartes) {
    const siegeC = cleDistrict(c.deputy.circonscription ?? c.slug);
    const nomC = cleDistrict(c.deputy.name);
    const s = scrutins
      .filter((r) => {
        if (cleDistrict(r.circonscription) !== siegeC) return false;
        // À deux lettres près : le référentiel des portraits écrit « Jolin-Barette ».
        const fam = cleDistrict(r.nom_famille);
        return distance(nomC.slice(-fam.length), fam) <= 2;
      })
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (s) c.scrutin = { pourcentage: s.pourcentage, avance: s.avance };
    else sansScrutin.push(`${c.deputy.name} (${c.slug})`);
  }
  if (sansScrutin.length) console.warn(`  ⚠️ ${sansScrutin.length} élu(s) sans résultat électoral apparié : ${sansScrutin.join(", ")}`); // garde-redaction: ok (diagnostic de console au build, jamais affiché)

  const sansMandat = cartes.filter((c) => !c.mandat);
  if (sansMandat.length) {
    console.warn(`  ⚠️ ${sansMandat.length} carte(s) sans date d'élection appariée :`); // garde-redaction: ok (diagnostic de console au build, jamais affiché)
    for (const c of sansMandat) console.warn(`     · ${c.deputy.name} (${c.slug})`);
  }

  return { cartes, serie };
}
