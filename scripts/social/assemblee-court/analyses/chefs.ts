// LES CHEFS AU SALON BLEU — chaque chef de parti présenté à son tour, avec ses
// chiffres de la dernière législature.
//
// Demandé par Jules Piral le 2026-09-18 : « sur les cartes de l'Assemblée
// nationale, je veux la présentation des équipes (la carte de chaque chef avec
// ses stats) », « une présentation de la dernière législature pour montrer
// pourquoi Éric Duhaime (PCQ) n'est pas là », puis « présente-les un à un, avec
// leurs stats qui apparaissent une à une comme une révélation choc ».
//
// UN À LA FOIS, PAS TROIS DE FRONT. Trois cartes côte à côte tiennent dans la
// boîte, mais à 240 px de large chacune, rien n'est « choc » : on lit un
// tableau. Ici un seul chef occupe l'écran, ses deux chiffres tombent l'un
// après l'autre, puis il cède la place au suivant. Son NOM est porté par la
// grande ligne du plan — le slot qui existe déjà — pour ne pas l'écrire deux
// fois.
//
// ⚠️ DEUX CHEFS SUR CINQ N'ONT PAS DE CARTE, pas un seul. Éric Duhaime (PCQ) —
// que Jules avait signalé — ET Charles Milliard (PLQ). Vérifié dans
// `agora_decideurs_qc_deputes.json` : aucune ligne à son nom, dans aucune des
// trois périodes ; les deux seules occurrences de « milliard » dans le fichier
// sont le MOT milliard, dans un contexte de citation. Les deux dirigent un
// parti sans siéger au Salon bleu. Cette absence est DITE EN PERMANENCE sous
// les cartes : c'est un fait mesuré, pas un trou qu'on masque.
//
// Les noms des chefs viennent de Jules (2026-09-18) : la donnée ne porte aucun
// drapeau « chef », et on ne le devine pas.

import { esc, txt } from "../../lib/reel";
import { BOITE, fois, type Analyse } from "../plan";

/** Les cinq chefs, dans l'ordre où on les présente. `siege: false` = pas de
 *  carte possible, et c'est une information, pas un trou. */
const CHEFS: { nom: string; parti: string; siege: boolean }[] = [
  { nom: "Christine Fréchette", parti: "CAQ", siege: true },
  { nom: "Ruba Ghazal", parti: "QS", siege: true },
  { nom: "Paul St-Pierre Plamondon", parti: "PQ", siege: true },
  { nom: "Charles Milliard", parti: "PLQ", siege: false },
  { nom: "Éric Duhaime", parti: "PCQ", siege: false },
];

/** Les chiffres en toutes lettres sous dix, comme le veut la rédaction. */
const EN_LETTRES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];
const nombre = (n: number) => EN_LETTRES[n] ?? String(n);

/** Ceux qui siègent — donc ceux qui ont une carte. Déduit, jamais écrit en dur :
 *  le jour où un chef entre ou sort de l'Assemblée, une seule ligne change. */
const SIEGENT = CHEFS.filter((c) => c.siege);
const ABSENTS = CHEFS.filter((c) => !c.siege);

/** LE RYTHME, en secondes au rythme de base (× 1,4 à l'écran).
 *
 *  Un TEMPS D'OUVERTURE d'abord : les trois portraits ensemble et une phrase qui
 *  dit où on est et ce qu'on mesure. Sans lui, le reel ouvrait sur un nom et un
 *  chiffre, sans qu'on sache de quoi il s'agissait (Jules Piral, 2026-09-18 :
 *  « on ne sait pas de quoi on parle »).
 *
 *  Puis 2,5 s par chef — 3,5 s à l'écran. À 1,7 s (2,4 s à l'écran), on voyait
 *  passer les chiffres sans avoir le temps de les lire. */
const OUVERTURE = 0.15;
const FIN_OUVERTURE = 1.95;
const DEBUT = 2.10;
const TOUR = 2.5;

/** LA ZONE DES CARTES S'ARRÊTE BIEN AU-DESSUS DU BAS DE LA BOÎTE (Jules Piral,
 *  2026-09-18 : « le sous-titre de Législature 2026 est trop coincé avec les
 *  fiches »). La ligne de méthode se pose 16 px sous la boîte ; si la carte
 *  descend jusqu'en bas, les deux se touchent. On laisse donc 150 px de papier
 *  au bas de la boîte, et la ligne d'absence vit dans cet espace. */
const ZONE_CARTE = BOITE.hauteur - 150;
const PORTRAIT = 300;

export const chefs: Analyse = {
  id: "chefs",
  idee: "Chaque chef de parti à son tour, avec ses chiffres de la dernière législature",
  construire({ data, periode, portraits }) {
    const vue = data.periods[periode];

    // On apparie par nom EXACT : la graphie du référentiel de l'Assemblée est
    // celle que porte la carte. Un appariement approximatif inventerait un chef.
    const cartes = SIEGENT.map((c) => {
      for (const row of vue.rows) {
        const dep = (row.deputies ?? []).find((d) => d.name === c.nom);
        if (dep) return { chef: c, dep, couleur: row.color };
      }
      return null;
    });

    // Si un chef annoncé comme siégeant n'a pas de carte, c'est que la donnée a
    // changé : on ne publie pas un reel à trous, on s'arrête.
    if (cartes.some((x) => x === null)) return null;
    const trouves = cartes as NonNullable<(typeof cartes)[number]>[];
    if (trouves.length !== SIEGENT.length) return null;

    // « vendredi 12 juin 2026 » → « 12 juin ».
    const seance = (vue.lastUpdated.match(/(\d{1,2} [a-zéû]+)/i)?.[1] ?? "").trim();
    // « Législature 2026 · Salon bleu » → « Législature 2026 ».
    const periodeLabel = (vue.subtitle.split(" · ")[0] || vue.tabLabel).trim();
    // ⚠️ « Le plus bavard » était un jugement, pas une mesure : on nomme le fait
    // (qui a le plus parlé) et on donne l'écart, sans qualifier personne.
    const parMots = [...trouves].sort((a, b) => b.dep.wordsRaw - a.dep.wordsRaw);
    const [haut, bas] = [parMots[0], parMots[parMots.length - 1]];

    /** Le tour du chef `i` : entrée, deux chiffres, sortie. Le dernier reste. */
    const carteHtml = (x: (typeof trouves)[number], i: number) => {
      const { chef, dep, couleur } = x;
      const t = +(DEBUT + i * TOUR).toFixed(2);
      const dernier = i === trouves.length - 1;
      const sortie = dernier ? "" : `, sortir .3s ${(t + TOUR - 0.2).toFixed(2)}s forwards`;
      const stat = (valeur: string, mot: string, retard: number) => `
          <li style="animation:choc .45s ${(t + retard).toFixed(2)}s both">
            <b style="color:${couleur}">${txt(valeur)}</b><span>${txt(mot)}</span>
          </li>`;
      return `
        <div class="chef" style="animation:entrer .4s ${t}s both${sortie}">
          <div class="portrait" style="border-color:${couleur}">
            ${dep.portrait && portraits[dep.portrait] ? `<img src="${portraits[dep.portrait]}" alt="">` : ""}
            <div class="parti mono" style="background:${couleur}">${esc(chef.parti)}</div>
          </div>
          <div class="fiche">
            <div class="circo mono">${txt(dep.circonscription ?? "")}</div>
            <ul class="stats">
              ${stat(String(dep.interventions), "interventions", 0.8)}
              ${stat(dep.wordsFormatted, "mots prononcés", 1.6)}
            </ul>
          </div>
        </div>`;
    };

    return {
      visuel: `
        <div class="equipe" data-cle>
          <div class="groupe" style="animation:entrer .5s ${OUVERTURE}s both, sortir .3s ${(FIN_OUVERTURE - 0.1).toFixed(2)}s forwards">
            ${trouves.map((x, i) => `
              <div class="tete" style="border-color:${x.couleur};animation:pop .45s ${(OUVERTURE + 0.2 + i * 0.22).toFixed(2)}s both">
                ${x.dep.portrait && portraits[x.dep.portrait] ? `<img src="${portraits[x.dep.portrait]}" alt="">` : ""}
              </div>`).join("")}
          </div>
          ${trouves.map(carteHtml).join("")}</div>
        <div class="absents mono">${txt(`${ABSENTS.map((c) => `${c.nom} (${c.parti})`).join(" et ")} n’ont pas siégé`)}</div>`,
      css: `
#plan .equipe{position:absolute;left:0;right:0;top:0;height:${ZONE_CARTE}px}
#plan .groupe{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:40px}
#plan .tete{width:210px;height:210px;border-radius:50%;border:8px solid;overflow:hidden;background:var(--rule)}
#plan .tete img{width:100%;height:100%;object-fit:cover;object-position:center 20%}
#plan .chef{position:absolute;inset:0;display:flex;align-items:center;gap:44px}
#plan .chef .portrait{position:relative;flex:none;width:${PORTRAIT}px;height:${PORTRAIT}px;border-radius:50%;border:8px solid;overflow:hidden;background:var(--rule)}
#plan .chef .portrait img{width:100%;height:100%;object-fit:cover;object-position:center 20%}
#plan .chef .parti{position:absolute;left:50%;bottom:-6px;transform:translateX(-50%);padding:7px 22px 6px;color:var(--paper);font-size:28px;letter-spacing:.16em}
#plan .chef .fiche{flex:1;min-width:0;text-align:left}
#plan .chef .circo{font-size:28px;letter-spacing:.06em;color:var(--soft)}
#plan .chef .stats{margin-top:18px;list-style:none}
#plan .chef .stats li{padding:16px 0;border-top:3px solid var(--rule)}
#plan .chef .stats b{display:block;font-family:"Playfair Display",serif;font-weight:900;font-size:78px;line-height:1;letter-spacing:-.02em}
#plan .chef .stats span{display:block;margin-top:4px;font-size:30px;color:var(--soft)}
#plan .absents{position:absolute;left:0;right:0;top:${ZONE_CARTE + 34}px;font-size:28px;line-height:1.2;letter-spacing:.04em;color:var(--softer);animation:fadeIn .5s ${(DEBUT + (SIEGENT.length - 1) * TOUR + 2.0).toFixed(2)}s both}
@keyframes entrer{from{opacity:0;transform:translateY(34px)}to{opacity:1;transform:none}}
@keyframes sortir{to{opacity:0;transform:translateY(-28px)}}
@keyframes choc{0%{opacity:0;transform:scale(.72)}60%{opacity:1;transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}`,
      phrases: [
        {
          // LE CADRE, AVANT TOUT. En corps moyen et sans ligne d'amorce : elle
          // doit paraître à la première image, sinon le haut du carré central
          // reste vide et le contrôle refuse (et surtout, on ouvre sur rien).
          b: "Les chefs de parti à l’Assemblée nationale, en chiffres.",
          taille: 52,
          debut: OUVERTURE,
          fin: FIN_OUVERTURE,
        },
        ...trouves.map((x, i) => {
          const t = +(DEBUT + i * TOUR).toFixed(2);
          const dernier = i === trouves.length - 1;
          return {
            b: esc(x.chef.nom),
            couleur: x.couleur,
            debut: t,
            ...(dernier ? {} : { fin: +(t + TOUR - 0.1).toFixed(2) }),
          };
        }),
      ],
      // La période vient de la VUE, pas d'une constante : le module accepte
      // --periode session|last_pdq, et une ligne écrite en dur mentirait alors
      // sur ce qui est mesuré.
      methode: `${periodeLabel} · séance du ${seance}`,
      legende: `${periodeLabel} : ${nombre(trouves.length)} des ${nombre(CHEFS.length)} chefs de parti ont siégé à l’Assemblée nationale. ${trouves.map((x) => `${x.chef.nom} (${x.chef.parti}, ${x.dep.circonscription}) — ${x.dep.interventions} interventions, ${x.dep.wordsFormatted} mots`).join(" ; ")}. ${ABSENTS.map((c) => `${c.nom} (${c.parti})`).join(" et ")} ne siégeaient pas au Salon bleu : ils n’ont donc pas de carte. C’est ${haut.chef.nom} qui a le plus parlé : ${haut.dep.wordsFormatted} mots, soit ${fois(haut.dep.wordsRaw / bas.dep.wordsRaw)} le total de ${bas.chef.nom} (${bas.dep.wordsFormatted}), pour un nombre d’interventions comparable.`,
    };
  },
};
