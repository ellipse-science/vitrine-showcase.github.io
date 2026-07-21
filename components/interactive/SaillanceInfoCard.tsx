// Contenu de la bulle ⓘ du badge (#274) — remplace « Plus saillante que 95 % ».
// Une mini-version de la figure de la méthodologie : la distribution des Unes de
// l'année (courbe), les 6 bandes de niveau, et un repère « CETTE UNE » posé à son
// pic 24 h. Sous la courbe, une phrase en français courant, puis le lien métho.
// Composant sans état (rendu dans la bulle client d'InfoTip).
const METHO_HREF = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/methodologie/#indice-saillance`;

// Couleurs des 6 bandes, alignées sur les tags de saillance (globals.css).
const BAND_COLORS = ["#E4DCC6", "#DCCBA2", "#D2B488", "#C99A76", "#BE7C6A", "#A85A52"];

// Phrase par niveau (1→6), registre public — ancre le référent (« typique »,
// « 1 sur 20 ») sans jargon.
const MICRO: Record<number, string> = {
  1: "Le bas de l’échelle : sur un an de Unes, 19 sur 20 attirent plus d’attention que celle-ci.",
  2: "Sous la Une typique : 4 Unes sur 5 attirent plus d’attention que celle-ci.",
  3: "Le niveau d’une Une typique : la moitié des Unes de l’année en attire plus, l’autre moitié moins.",
  4: "Au-dessus de la Une typique : deux Unes sur trois attirent moins d’attention que celle-ci.",
  5: "Dans le cinquième le plus marquant des Unes de l’année.",
  6: "Le sommet de l’échelle : sur un an de Unes, à peine 1 sur 20 attire autant d’attention que celle-ci à son meilleur.",
};

const W = 300, H = 66, PLOT_H = 52;
const log10 = (v: number) => Math.log10(Math.max(v, 1));

export function SaillanceInfoCard({ rank, level, peak, thresholds }: {
  rank: number;
  level: string;
  peak: number | null;
  thresholds: number[];
}) {
  const valid = thresholds.length === 5 && thresholds.every((t) => Number.isFinite(t)) && thresholds[4] > thresholds[0];
  // Domaine log de l'axe : de 1 au double du p95, pour laisser respirer la queue.
  const x0 = log10(1), x1 = log10((valid ? thresholds[4] : 100) * 2);
  const px = (v: number) => ((log10(v) - x0) / (x1 - x0)) * W;
  // Ajustement log-normal sur les seuils publiés (p50 = médiane, p95 → 1,645 σ).
  const mu = valid ? log10(thresholds[2]) : log10(19);
  const rawSigma = valid ? (log10(thresholds[4]) - mu) / 1.645 : (log10(71) - mu) / 1.645;
  // Repli si les seuils sont dégénérés (ex. p50 == p95 → σ = 0) : évite une
  // division par zéro et des coordonnées NaN dans le SVG.
  const sigma = rawSigma > 1e-3 ? rawSigma : (log10(71) - log10(19)) / 1.645;
  const gauss = (lx: number) => Math.exp(-0.5 * Math.pow((lx - mu) / sigma, 2));

  // Courbe.
  const curve: string[] = [];
  for (let i = 0; i <= 100; i++) {
    const lx = x0 + (x1 - x0) * (i / 100);
    curve.push(`${((lx - x0) / (x1 - x0) * W).toFixed(1)},${(PLOT_H - 2 - gauss(lx) * (PLOT_H - 10)).toFixed(1)}`);
  }
  // Bandes de fond (6 régions séparées par les seuils).
  const edges = [0, ...(valid ? thresholds.map(px) : []), W];
  const markerX = peak != null ? Math.min(W - 1, Math.max(1, px(peak))) : null;

  return (
    <span className="saillance-info-card">
      <span className="sic-kicker">Saillance {level} · {rank}/6</span>
      <svg className="sic-curve" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={`Position de cette Une parmi les Unes de l’année : niveau ${rank} sur 6`}>
        {valid && edges.slice(0, -1).map((x, i) => (
          <rect key={i} x={x.toFixed(1)} y="0" width={(edges[i + 1] - x).toFixed(1)} height={PLOT_H}
            fill={BAND_COLORS[i]} opacity={i === rank - 1 ? 0.95 : 0.4} />
        ))}
        <polyline points={curve.join(" ")} fill="none" stroke="var(--ink)" strokeOpacity="0.55" strokeWidth="1.3" />
        {markerX != null && (
          <>
            <line x1={markerX.toFixed(1)} y1="2" x2={markerX.toFixed(1)} y2={PLOT_H} stroke="var(--ink)" strokeWidth="1.6" />
            <circle cx={markerX.toFixed(1)} cy={(PLOT_H - 2 - gauss(log10(peak!)) * (PLOT_H - 10)).toFixed(1)} r="3" fill="var(--ink)" />
            <text x={Math.min(W - 3, markerX + 5).toFixed(1)} y={(H - 3).toFixed(1)}
              textAnchor={markerX > W - 64 ? "end" : "start"} className="sic-marker-label">CETTE UNE</text>
          </>
        )}
        <text x="2" y={(H - 3).toFixed(1)} className="sic-axis-label">← moins d’attention</text>
      </svg>
      <span className="sic-text">{MICRO[rank] ?? ""}</span>
      <a className="sic-link" href={METHO_HREF}>Comment on mesure la saillance</a>
    </span>
  );
}
