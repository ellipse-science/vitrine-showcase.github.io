// Contenu de la bulle ⓘ du badge (#274). Répond, dans l'ordre, aux trois
// questions que pose un badge de niveau :
//   1. ça mesure QUOI          → l'indice de saillance médiatique Radar+ (§ 03)
//   2. élevé par rapport à QUOI → la figure + la phrase de comparaison
//   3. pourquoi ça BOUGE        → le cumul 24 h pondéré par récence
// puis les faits de CETTE Une, et le lien vers la métho. Le repère « CETTE UNE »
// se pose sur son indice cumulé 24 h (la grandeur du badge), pas sur son pic.
// Composant sans état (rendu dans la bulle client d'InfoTip).
const METHO_HREF = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/methodologie/#indice-saillance`;

// Couleurs des 6 bandes, alignées sur les tags de saillance (globals.css).
const BAND_COLORS = ["#E4DCC6", "#DCCBA2", "#D2B488", "#C99A76", "#BE7C6A", "#A85A52"];

// Phrase par niveau (1→6), registre public — ancre le référent (« typique »,
// « 1 sur 20 ») sans jargon.
const MICRO: Record<number, string> = {
  1: "Le bas de l’échelle : sur un an de Unes québécoises, 19 sur 20 attirent plus d’attention que celle-ci.",
  2: "Sous la Une typique : 4 Unes sur 5 attirent plus d’attention que celle-ci.",
  3: "Le niveau d’une Une typique : la moitié des Unes québécoises de l’année en attire plus, l’autre moitié moins.",
  4: "Au-dessus de la Une typique : deux Unes sur trois attirent moins d’attention que celle-ci.",
  5: "Dans le cinquième le plus marquant des Unes québécoises de l’année.",
  // « à son meilleur » retiré : le niveau ne décrit plus le SOMMET de l'histoire
  // mais son attention cumulée à cette édition — il redescend avec elle.
  6: "Le sommet de l’échelle : sur un an de Unes québécoises, à peine 1 sur 20 attire autant d’attention que celle-ci.",
};

// Deux rangées de libellés : SOMMET au-dessus du tracé, CETTE UNE en dessous
// (demande Adrien). Sur une seule rangée les deux se chevauchaient dès que les
// repères se rapprochaient — et le recentrage forcé dans le cadre annulait
// l'écartement automatique. Une rangée chacun règle le problème par la mise en
// page plutôt que par des acrobaties de position.
// Chaque repère tient sur DEUX lignes centrées — le nom, puis le moment entre
// parenthèses (demande Adrien). Sur une seule ligne, « Sommet (hier à 20 h) »
// faisait 120 px de large et repoussait le repère hors du cadre dès qu'il
// approchait un bord. Empilé, il n'occupe plus que la largeur du plus long de
// ses deux mots.
const W = 300, PLOT_H = 52, LIGNE = 10, TOP = 2 * LIGNE + 4, H = TOP + PLOT_H + 2 * LIGNE + 5;
const log10 = (v: number) => Math.log10(Math.max(v, 1));

export function SaillanceInfoCard({ rank, level, centile, peak, sommet, sommetLabel, sommetCentile, sommetTier, thresholds, qcOutlets, totalQcOutlets, since }: {
  rank: number;
  level: string;
  /** Centile réel (#430, A7). La bulle disait un palier — « dans le cinquième le
   *  plus marquant » — pendant que l'infobulle du badge, elle, donnait déjà le
   *  vrai chiffre : deux phrases voisines qui ne disaient pas la même chose. */
  centile?: number;
  peak: number | null;
  /** Sommet de l'indice cumulé (même échelle que `peak`), null si atteint maintenant. */
  sommet?: number | null;
  sommetLabel?: string | null;
  /** Centile et bande AU SOMMET (#430, A8) — ce qui situe la nouvelle dans l'année. */
  sommetCentile?: number | null;
  sommetTier?: string | null;
  thresholds: number[];
  /** Médias québécois qui ont mis l'histoire en Une sur la fenêtre 24 h. */
  qcOutlets?: number;
  totalQcOutlets?: number;
  /** « hier soir, 20 h » — depuis quand elle est à la Une. */
  since?: string | null;
}) {
  const valid = thresholds.length === 5 && thresholds.every((t) => Number.isFinite(t)) && thresholds[4] > thresholds[0];
  // Domaine log de l'axe : de la MOITIÉ du p5 au double du p95 (vitrine#566,
  // retour d'Adrien). L'axe partait de 1 point : sur l'échelle sur 100, la
  // plus faible Une de l'année vaut ~6 et « Très faible » commence à 10, donc
  // la moitié gauche de la figure était un beige sans aucune histoire. Les
  // valeurs sous la borne (rarissimes) sont rabattues au bord par `markerX`.
  const x0 = log10(valid ? Math.max(1, thresholds[0] / 2) : 1);
  const x1 = log10((valid ? thresholds[4] : 100) * 2);
  const px = (v: number) => ((log10(v) - x0) / (x1 - x0)) * W;
  // Ajustement log-normal À DEUX PENTES sur les seuils publiés : la médiane
  // pour le centre, le p5 pour l'écart-type de gauche, le p95 pour celui de
  // droite (1,645 σ de chaque côté). Une seule pente, calée sur le p95,
  // étalait la cloche vers la gauche jusque dans le vide et mettait ~40 % de
  // l'aire sous « Très faible », une bande qui contient 5 % des Unes. La
  // distribution réelle est serrée à gauche et longue à droite ; la courbe
  // passe maintenant par les cinq seuils, comme l'histogramme de la métho.
  const mu = valid ? log10(thresholds[2]) : log10(19);
  const rawSigmaR = valid ? (log10(thresholds[4]) - mu) / 1.645 : (log10(71) - mu) / 1.645;
  const rawSigmaL = valid ? (mu - log10(thresholds[0])) / 1.645 : (mu - log10(5)) / 1.645;
  // Repli si les seuils sont dégénérés (ex. p50 == p95 → σ = 0) : évite une
  // division par zéro et des coordonnées NaN dans le SVG.
  const sigmaR = rawSigmaR > 1e-3 ? rawSigmaR : (log10(71) - log10(19)) / 1.645;
  const sigmaL = rawSigmaL > 1e-3 ? rawSigmaL : sigmaR;
  const gauss = (lx: number) => Math.exp(-0.5 * Math.pow((lx - mu) / (lx < mu ? sigmaL : sigmaR), 2));

  // Courbe.
  const curve: string[] = [];
  for (let i = 0; i <= 100; i++) {
    const lx = x0 + (x1 - x0) * (i / 100);
    curve.push(`${((lx - x0) / (x1 - x0) * W).toFixed(1)},${(PLOT_H - 2 - gauss(lx) * (PLOT_H - 10)).toFixed(1)}`);
  }
  // Bandes de fond (6 régions séparées par les seuils).
  const edges = [0, ...(valid ? thresholds.map(px) : []), W];
  const markerX = peak != null ? Math.min(W - 1, Math.max(1, px(peak))) : null;
  // Repère du SOMMET : la plus haute valeur atteinte par le même indice, donc
  // sur la même échelle. Toujours à droite du repère courant (un sommet est un
  // maximum) — sauf si l'histoire y est encore, auquel cas il n'y a rien à
  // montrer et sommetX reste null.
  const sommetX = sommet != null ? Math.min(W - 1, Math.max(1, px(sommet))) : null;
  const cy = (v: number) => PLOT_H - 2 - gauss(log10(v)) * (PLOT_H - 10);
  // Libellés centrés sous leur barre, écartés s'ils se chevauchent et rentrés
  // dans le cadre. La demi-largeur se déduit du nombre de caractères : la police
  // est monospace (~5,8 px par signe à 8,5 px + letter-spacing), donc « SOMMET
  // (hier à 20 h) » est bien plus large que « CETTE UNE » — une constante unique
  // laissait le libellé du sommet déborder du cadre.
  const CAR = 5.8;
  // Deux lignes par repère : le nom, puis le moment entre parenthèses.
  // « Plus haut niveau » et NON « Sommet » : la phrase de trajectoire, juste
  // au-dessus, dit déjà « (Sommet à 16h) » — mais elle parle du pic de PART
  // D'ATTENTION sur les 24 h, alors que ce repère-ci marque le plus haut
  // NIVEAU de badge atteint sur toute la vie de l'histoire. Mesuré sur 715
  // cartes de l'historique DEV : les deux tombent sur des heures différentes
  // 45,6 % du temps (écart max 1040 h). Deux mots distincts pour deux
  // grandeurs distinctes, sinon le lecteur lit une contradiction.
  const somL1 = "Son sommet", somL2 = sommetLabel ? `(${sommetLabel})` : null;
  const nowL1 = "Maintenant", nowL2 = null;
  const demi = (...l: (string | null)[]) => (Math.max(...l.map((s) => (s ?? "").length)) * CAR) / 2;
  const demiNow = demi(nowL1, nowL2);
  const demiSom = demi(somL1, somL2);
  // Chacun sur sa rangée : plus d'écartement mutuel à calculer, juste le
  // maintien dans le cadre.
  const clamp = (x: number | null, demi: number) =>
    x == null ? null : Math.min(W - demi - 1, Math.max(demi + 1, x));
  const xNow = clamp(markerX, demiNow), xSom = clamp(sommetX, demiSom);

  return (
    <span className="saillance-info-card">
      {/* Le « 3/6 » a été retiré (demande d'Adrien) : le rang chiffré doublait la
          figure juste en dessous, qui le montre déjà en le SITUANT — et deux
          façons de dire la même chose se lisent comme deux mesures. À la place,
          la valeur elle-même, sur l'échelle d'affichage. */}
      {/* DEUX LIGNES et non une (Adrien) : « Saillance actuelle : Modérée · 44,7
          points » se repliait selon la largeur, et « POINTS » se retrouvait seul
          sur la seconde ligne. La valeur passe donc systématiquement à la ligne
          — le repli devient une mise en page voulue au lieu d'un accident. */}
      <span className="sic-kicker">Saillance actuelle&nbsp;: {level}</span>
      {typeof peak === "number" ? (
        <span className="sic-kicker sic-kicker-val">{peak.toFixed(1).replace(".", ",")}&nbsp;points sur 100</span>
      ) : null}
      {/* A8 (#430) — LA COMPARAISON À L'ANNÉE S'ACCROCHE TOUJOURS AU SOMMET.
          Avant, cette phrase situait la nouvelle avec sa valeur du MOMENT :
          une histoire retombée s'annonçait « plus saillante que 57 % des Unes »
          alors qu'elle avait atteint le 96e centile quatre heures plus tôt.
          C'était faux — pas mal cadré : la phrase parle de « celle-ci », donc de
          la nouvelle, et le rang d'une nouvelle dans l'année est son sommet.
          C'est aussi la grandeur qui classera le palmarès (aws-refiners#283) :
          la bulle et le palmarès se seraient contredits sur la même histoire.
          Le badge, lui, ne bouge pas — il reste une fonction pure de la valeur
          du moment (A4). Le présent n'est donc jamais nié : il est au-dessus. */}
      <span className="sic-lede">{
        sommet != null && typeof sommetCentile === "number" && sommetTier
          ? `Son sommet : ${sommet.toFixed(1).replace(".", ",")} points, atteint ${sommetLabel ?? "plus tôt"}. Elle était alors ${sommetTier}, ${
              sommetCentile >= 50
                ? `devant environ ${sommetCentile} % des Unes québécoises de l’année.`
                : `mais environ ${100 - sommetCentile} % des Unes québécoises de l’année restaient plus saillantes.`}`
          : typeof centile === "number"
            ? (centile >= 50
                ? `C’est son sommet. Elle dépasse environ ${centile} % des Unes québécoises de l’année.`
                : `C’est son sommet. Environ ${100 - centile} % des Unes québécoises de l’année sont plus saillantes.`)
            : (MICRO[rank] ?? "")
      }</span>
      <svg className="sic-curve" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={`Position de cette Une parmi les Unes de l’année : niveau ${rank} sur 6`}>
        {/* RANGÉE DU HAUT — le sommet, sur deux lignes centrées. */}
        {/* Le sommet (libellé, trait, point) n'apparaît qu'APRÈS les trois
            battements de la bande (demande d'Adrien, #566) : d'abord « où elle
            est », ensuite « jusqu'où elle est montée ». Les deux en même temps
            se disputaient le regard. La classe `sic-sommet` porte le fondu. */}
        {sommetX != null && (
          <text x={xSom!.toFixed(1)} textAnchor="middle" className="sic-marker-label sic-marker-som sic-sommet">
            <tspan x={xSom!.toFixed(1)} y={(TOP - LIGNE - 4).toFixed(1)}>{somL1}</tspan>
            {somL2 && <tspan x={xSom!.toFixed(1)} y={(TOP - 4).toFixed(1)}>{somL2}</tspan>}
          </text>
        )}
        <g transform={`translate(0, ${TOP})`}>
          {valid && edges.slice(0, -1).map((x, i) => (
            // La bande où la nouvelle se trouve est plus foncée, et elle PULSE
            // trois fois à l'ouverture de la bulle (demande d'Adrien, #566) :
            // « situer la nouvelle dans sa bande » est le concept que la figure
            // porte, et un aplat un peu plus sombre ne le disait pas assez.
            <rect key={i} x={x.toFixed(1)} y="0" width={(edges[i + 1] - x).toFixed(1)} height={PLOT_H}
              fill={BAND_COLORS[i]} opacity={i === rank - 1 ? 0.95 : 0.4}
              className={i === rank - 1 ? "sic-band-now" : undefined} />
          ))}
          <polyline points={curve.join(" ")} fill="none" stroke="var(--ink)" strokeOpacity="0.55" strokeWidth="1.3" />
          {/* Le SOMMET d'abord, pour que la barre « cette Une » passe par-dessus. */}
          {sommetX != null && (
            <g className="sic-sommet">
              <line x1={sommetX.toFixed(1)} y1="0" x2={sommetX.toFixed(1)} y2={PLOT_H}
                stroke="var(--ink-softer)" strokeWidth="1.2" strokeDasharray="2.5 2" />
              <circle cx={sommetX.toFixed(1)} cy={cy(sommet!).toFixed(1)} r="2.6"
                fill="var(--paper)" stroke="var(--ink-softer)" strokeWidth="1.2" />
            </g>
          )}
          {markerX != null && (
            <>
              <line x1={markerX.toFixed(1)} y1="0" x2={markerX.toFixed(1)} y2={PLOT_H} stroke="var(--ink)" strokeWidth="1.6" />
              <circle cx={markerX.toFixed(1)} cy={cy(peak!).toFixed(1)} r="3" fill="var(--ink)" />
            </>
          )}
        </g>
        {/* RANGÉE DU BAS — cette Une, centrée SOUS sa barre (retour Adrien) :
            le libellé était collé à droite du repère, décalé du trait. */}
        {markerX != null && (
          <text x={xNow!.toFixed(1)} textAnchor="middle" className="sic-marker-label">
            <tspan x={xNow!.toFixed(1)} y={(H - LIGNE - 4).toFixed(1)}>{nowL1}</tspan>
            <tspan x={xNow!.toFixed(1)} y={(H - 4).toFixed(1)}>{nowL2}</tspan>
          </text>
        )}
        {/* L'axe ne s'affiche que s'il ne se cogne pas au libellé le plus à gauche. */}
        {(xNow == null || xNow - demiNow > 114) && (
          <text x="2" y={(H - 4).toFixed(1)} className="sic-axis-label">← moins d’attention</text>
        )}
      </svg>
      {/* La ligne « Son sommet » qui vivait ICI a migré en TÊTE de carte (A8,
          #430) : elle ne complète plus la phrase d'ouverture, elle EST la phrase
          qui situe la nouvelle dans l'année. La garder en double aurait donné
          deux fois le même chiffre dans une bulle de six lignes. */}
      {/* Les faits de CETTE Une : sans eux la bulle n'explique qu'une méthode,
          jamais pourquoi cette histoire-ci se retrouve à ce niveau-là. */}
      {typeof qcOutlets === "number" && qcOutlets > 0 && (
        <span className="sic-fait">
          <b>{qcOutlets}</b> média{qcOutlets > 1 ? "s" : ""} québécois
          {typeof totalQcOutlets === "number" && totalQcOutlets > 0 ? <> sur {totalQcOutlets}</> : null}
          {" "}l’ont mise en Une{since ? <>, depuis {since}</> : null}.
        </span>
      )}
      {/* PIED — la définition, pour qui veut savoir ce qu'on mesure au juste.
          Calquée sur la métho § 03 (spec v1) :
            Indice(bloc) = (Visibilité × Intensité × Durée)^(1/3), sur 100
          puis les POINTS = moyenne des six derniers blocs pondérée par récence
          (vitrine#566). La deuxième phrase nomme l'unité et sa borne : un
          nombre nu à côté d'un mot de niveau ne dit pas sur quoi il est compté,
          et « 62,0 » ne se lit pas pareil selon qu'on le croit sur 100 ou sans
          plafond. */}
      <span className="sic-def">
        {/* {" "} explicite : JSX avale l'espace entre </b> et le texte suivant. */}
        <b>L’indice de saillance médiatique Radar+</b>{" "}mesure l’espace qu’occupent les
        nouvelles dans l’ensemble de l’actualité, pour présenter l’information réellement
        mise de l’avant par les médias. Les points vont de 0 à 100&nbsp;: chaque tranche
        de quatre heures est notée d’après le nombre de médias qui ont mis la nouvelle en
        Une, le nombre d’articles et le temps passé en Une, puis les six dernières
        tranches sont moyennées, les plus récentes comptant davantage.
      </span>
      <a className="sic-link" href={METHO_HREF}>Comment on mesure la saillance</a>
    </span>
  );
}
