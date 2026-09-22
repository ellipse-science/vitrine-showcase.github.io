// LA PAGE DE L'ATELIER. Aucune donnée ici : elle ne fait que mettre en scène ce
// que `atelier.ts` a ramassé. À gauche le reel dans le cadre de la plateforme
// choisie, avec un calque rouge sur ce que son interface couvre ; à droite le
// texte de cette plateforme, son premier commentaire, ses contraintes.

import { PLATEFORMES } from "./plateformes";

export type ModuleProduit = {
  cle: string;
  nom: string;
  /** Le chemin de l'aperçu, par rendu. */
  rendus: Partial<Record<string, string>>;
  /** La légende que ce module a écrite, par réseau. */
  textes: Partial<Record<string, string>>;
  commentaire?: string;
  ecarts?: Partial<Record<string, string[]>>;
  /** La planche contact : la fin de chaque scène, côte à côte. */
  planches?: Partial<Record<string, string | undefined>>;
  /** Renseigné quand le module s'est déclaré indisponible (données périmées). */
  absent: string | null;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export type Zone = { haut: number; bas: number; gauche: number; droite: number; boutonsDepuis: number; mesure: string | null };

export function pageAtelier(o: {
  produits: ModuleProduit[];
  rendus: string[];
  zones: Record<string, Zone>;
  edition: string | null;
  dateLabel: string | null;
  ageH: number;
}): string {
  const donnees = { produits: o.produits, plateformes: PLATEFORMES, rendus: o.rendus, zones: o.zones };
  return `<!doctype html><meta charset="utf-8"><title>Atelier social · La Vitrine démocratique</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --fond:#141210; --carte:#1F1C19; --trait:#332E29; --texte:#EDE4D3; --sourdine:#94897C; --accent:#C9A227; --alerte:#C2410C }
  * { box-sizing:border-box }
  body { margin:0; background:var(--fond); color:var(--texte); font:15px/1.55 "IBM Plex Mono", ui-monospace, monospace }
  header { padding:16px 22px 12px; border-bottom:1px solid var(--trait) }
  h1 { font:600 19px/1.2 Georgia, serif; margin:0 0 10px; letter-spacing:.02em; display:inline-block }
  h1 small { color:var(--sourdine); font:12px "IBM Plex Mono", monospace; margin-left:12px; letter-spacing:0 }
  .onglets { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:7px; align-items:center }
  .onglets b { color:var(--sourdine); font:11px "IBM Plex Mono",monospace; font-weight:400; text-transform:uppercase; letter-spacing:.08em; width:80px }
  button { font:12px "IBM Plex Mono", monospace; padding:6px 13px; border:1px solid var(--trait); background:transparent; color:var(--texte); cursor:pointer; border-radius:2px }
  button:hover { border-color:var(--sourdine) }
  button.on { background:var(--texte); color:var(--fond); border-color:var(--texte) }
  button[disabled] { opacity:.32; cursor:not-allowed }

  /* LE REEL AU CENTRE, comme dans l'aperçu de Jules : c'est lui qu'on regarde.
     Sa hauteur commande sa largeur (9/16) — jamais l'inverse, sinon il s'écrase. */
  /* Trois colonnes, la vide à gauche : le reel tombe ainsi au MILIEU de la page,
     pas au milieu de « reel + panneau » (Adrien, 2026-09-22 : « j'aimais mieux centré »). */
  .haut { display:grid; grid-template-columns:300px auto 300px; gap:26px; justify-content:center; align-items:start; padding:24px 22px 8px }
  .haut > .scene { grid-column:2 }
  .scene { position:relative; height:74vh; aspect-ratio:9/16; background:#000; border:1px solid var(--trait); flex:0 0 auto }
  .scene iframe { position:absolute; inset:0; width:100%; height:100%; border:0 }
  .calque { position:absolute; inset:0; pointer-events:none; display:none }
  .calque.on { display:block }
  .calque i { position:absolute; background:rgba(194,65,12,.26); border:1px dashed rgba(255,120,60,.6); font-style:normal;
              color:#FFD9C4; font:10px "IBM Plex Mono",monospace; padding:2px 4px; overflow:hidden }
  .calque.estime i { background:rgba(148,137,124,.20); border-style:dotted }
  .pilote { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px }
  .pilote button { font-size:11px; padding:5px 10px }
  .cote { width:300px; flex:0 0 300px; display:flex; flex-direction:column; gap:14px }
  .sous { color:var(--sourdine); font-size:11px; line-height:1.5; margin:8px 0 0; text-align:center; max-width:62ch; margin-inline:auto }
  .sous a { color:var(--accent) }

  /* LES TEXTES, SOUS LE PLI. Ils ne doivent jamais voler la place du reel. */
  .bas { display:grid; grid-template-columns:repeat(auto-fit, minmax(420px, 1fr)); gap:18px; padding:18px 22px 40px }
  .bloc { background:var(--carte); border:1px solid var(--trait); padding:14px 16px; min-width:0 }
  .bloc h2 { font:600 12px "IBM Plex Mono",monospace; margin:0 0 10px; color:var(--accent); text-transform:uppercase; letter-spacing:.08em }
  .bloc h2 span { float:right; color:var(--sourdine); text-transform:none; letter-spacing:0; font-weight:400 }
  pre { white-space:pre-wrap; word-break:break-word; font:12.5px/1.65 "IBM Plex Mono",monospace; margin:0; max-height:46vh; overflow:auto }
  .vide { color:var(--sourdine); font-style:italic }
  dl { display:grid; grid-template-columns:auto 1fr; gap:5px 12px; margin:0; font-size:12px }
  dt { color:var(--sourdine) } dd { margin:0 }
  .alerte { border-color:var(--alerte) } .alerte h2 { color:var(--alerte) }
  .alerte ul { margin:0; padding-left:18px; font-size:12px; line-height:1.6 }
  @media (max-width:1100px) { .haut { grid-template-columns:1fr; justify-items:center } .cote { width:100%; flex:1 1 auto; max-width:620px } .scene { height:auto; width:min(360px, 84vw) } }
</style>
<header>
  <h1>Atelier social<small>${o.edition ? `édition ${esc(o.edition)} · ${esc(o.dateLabel ?? "")}` : "aucune édition"}${o.ageH > 5 ? ` · ⚠️ données vieilles de ${Math.round(o.ageH)} h` : ""}</small></h1>
  <div class="onglets"><b>Module</b><span id="mods"></span></div>
  <div class="onglets"><b>Plateforme</b><span id="plats"></span></div>
</header>
<div class="haut">
  <div class="scene"><iframe id="cadre" title="aperçu du reel"></iframe><div class="calque" id="calque"></div></div>
  <div class="cote">
    <div class="bloc" id="blocPilote"><h2>Le reel <span id="tempsReel">—</span></h2>
      <div class="pilote">
        <button id="pPlay">▶ Lecture</button><button id="pBack">← 1 s</button><button id="pFwd">1 s →</button>
        <button id="pSlow">Vitesse ×1</button><button id="pZones">Zones</button><button id="pTel">iPhone 17</button>
      </div>
      <div class="pilote" id="pScenes"></div>
    </div>
    <div class="bloc alerte" id="blocEcarts" hidden><h2>Écarts au gabarit</h2><ul id="listeEcarts"></ul></div>
    <div class="bloc"><h2>Le format <span id="quiPublie"></span></h2><dl id="specs"></dl></div>
  </div>
</div>
<p class="sous" id="sousScene"></p>
<div class="bas" id="blocPlanche" hidden><div class="bloc" style="grid-column:1/-1"><h2>Chaque scène, à son état final <span>ce qu'un contrôle automatique ne voit pas : le serré, le vide, le laid</span></h2><img id="planche" alt="" style="width:100%;display:block"></div></div>
<div class="bas">
  <div class="bloc"><h2>Le post <span id="quiTexte"></span></h2><pre id="texte"></pre></div>
  <div class="bloc"><h2>Premier commentaire</h2><pre id="commentaire"></pre></div>
</div>
<script>
const D = ${JSON.stringify(donnees)};
let mod = D.produits[0] && D.produits[0].cle, plat = "instagram";

function bouton(txt, actif, dispo, onclick) {
  const b = document.createElement("button");
  b.textContent = txt; b.className = actif ? "on" : ""; b.disabled = !dispo;
  if (dispo) b.onclick = onclick;
  return b;
}
function produit(cle) { return D.produits.find((p) => p.cle === cle); }
function laPlateforme(cle) { return D.plateformes.find((p) => p.cle === cle); }

function calque(p, zones, estime) {
  const c = document.getElementById("calque");
  c.className = "calque on" + (estime ? " estime" : "");
  const pc = (v, tout) => (v / tout * 100) + "%";
  c.innerHTML =
    '<i style="left:0;top:0;right:0;height:' + pc(zones.haut, 1920) + '">interface, ' + zones.haut + ' px</i>' +
    '<i style="left:0;right:0;bottom:0;height:' + pc(zones.bas, 1920) + '">légende et navigation, ' + zones.bas + ' px</i>' +
    (zones.droite ? '<i style="right:0;top:' + pc(zones.boutonsDepuis, 1920) + ';bottom:' + pc(zones.bas, 1920) + ';width:' + pc(zones.droite, 1080) + '">boutons</i>' : "");
}

function rendre() {
  const p = produit(mod), pl = laPlateforme(plat);
  // Onglets.
  const mods = document.getElementById("mods"); mods.innerHTML = "";
  for (const m of D.produits) mods.appendChild(bouton(m.nom + (m.absent ? " (indispo.)" : ""), m.cle === mod, !m.absent, () => { mod = m.cle; rendre(); }));
  const plats = document.getElementById("plats"); plats.innerHTML = "";
  for (const q of D.plateformes) plats.appendChild(bouton(q.nom, q.cle === plat, true, () => { plat = q.cle; rendre(); }));

  // Le reel : le rendu que cette plateforme demande, sinon celui qui existe.
  const rendu = p && (p.rendus[pl.rendu] ? pl.rendu : Object.keys(p.rendus)[0]);
  const chemin = rendu ? p.rendus[rendu] : null;
  const cadre = document.getElementById("cadre");
  cadre.src = chemin ? chemin + "?mini" : "about:blank";
  cadre.onload = () => { listerScenes(); const d = docCadre(); if (d) { const t = d.getElementById("time"); if (t) new MutationObserver(() => { document.getElementById("tempsReel").textContent = t.textContent || ""; }).observe(t, { childList: true, characterData: true, subtree: true }); } };
  const z = D.zones[plat] || D.zones.instagram;
  calque(pl, z, !z.mesure);
  const manqueRendu = rendu && rendu !== pl.rendu;
  document.getElementById("sousScene").innerHTML =
    (chemin ? '<a href="' + chemin + '" target="_blank">ouvrir en grand →</a> · ' : "aucun reel produit · ") +
    pl.media.quoi + " " + pl.media.dim + " · " +
    (z.mesure ? "zones " + z.mesure : "⚠️ zones à mesurer : elles sont approchées, en pointillé") +
    (manqueRendu ? " · ⚠️ rendu « " + rendu + " » affiché : le format " + pl.rendu + " n'existe pas encore ici" : "");

  // Les écarts, tels que le contrôle les a rapportés.
  const ec = (p && p.ecarts && p.ecarts[rendu]) || [];
  document.getElementById("blocEcarts").hidden = ec.length === 0;
  document.getElementById("listeEcarts").innerHTML = ec.map((e) => "<li>" + e + "</li>").join("");

  const pch = (p && p.planches && p.planches[rendu]) || null;
  document.getElementById("blocPlanche").hidden = !pch;
  if (pch) document.getElementById("planche").src = pch;

  // Le texte de CETTE plateforme.
  const t = p && p.textes[plat];
  document.getElementById("quiPublie").textContent = pl.nom;
  document.getElementById("quiTexte").textContent = pl.nom + " · " + pl.qui;
  document.getElementById("texte").innerHTML = t ? escapeHtml(t) : '<span class="vide">Ce module n\\'écrit pas encore de légende pour ' + pl.nom + '.</span>';
  document.getElementById("commentaire").innerHTML = (p && p.commentaire) ? escapeHtml(p.commentaire) : '<span class="vide">Aucun premier commentaire pour ce module.</span>';

  document.getElementById("specs").innerHTML =
    "<dt>Média</dt><dd>" + pl.media.quoi + ", " + pl.media.dim + "</dd>" +
    "<dt>Texte</dt><dd>" + pl.texte + "</dd>" +
    "<dt>Lien</dt><dd>" + pl.lien + "</dd>" +
    "<dt>Identifier</dt><dd>" + pl.tags + "</dd>" +
    "<dt>Qui publie</dt><dd>" + pl.qui + "</dd>";
}
function docCadre() {
  const f = document.getElementById("cadre");
  try { return f.contentDocument; } catch { return null; }
}
function cliquer(id) { const d = docCadre(); if (d) { const b = d.getElementById(id); if (b) b.click(); } }
function brancherPilote() {
  document.getElementById("pPlay").onclick = () => cliquer("play");
  document.getElementById("pSlow").onclick = () => cliquer("slow");
  document.getElementById("pZones").onclick = () => cliquer("safeBtn");
  document.getElementById("pTel").onclick = () => cliquer("telBtn");
  for (const [id, dir] of [["pBack", "ArrowLeft"], ["pFwd", "ArrowRight"]]) {
    document.getElementById(id).onclick = () => {
      const d = docCadre();
      if (d && d.defaultView) d.defaultView.dispatchEvent(new KeyboardEvent("keydown", { code: dir, key: dir, bubbles: true }));
    };
  }
}
/** Les scènes de CE reel, lues dans l'aperçu : leurs noms et leurs temps y sont
 *  déjà (data-t). On les rejoue ici pour pouvoir sauter de scène en scène. */
function listerScenes() {
  const d = docCadre();
  const hote = document.getElementById("pScenes");
  hote.innerHTML = "";
  if (!d) return;
  for (const b of d.querySelectorAll("#scenes button")) {
    const copie = document.createElement("button");
    copie.textContent = b.textContent;
    copie.onclick = () => b.click();
    hote.appendChild(copie);
  }
  const t = d.getElementById("time");
  if (t) document.getElementById("tempsReel").textContent = t.textContent || "";
}
function escapeHtml(s) { return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]); }
brancherPilote();
rendre();
</script>`;
}
