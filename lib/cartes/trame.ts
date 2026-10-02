// LA TRAME DES PORTRAITS : séparation quadrichromique d'époque. Les quatre
// encres sont tramées à des angles distincts et se multiplient sur le papier
// pour former la rosette visible sur la référence Bowman agrandie. Node
// seulement (sharp) : le générateur imprimé et le script qui prépare les
// portraits du site passent tous deux par ici.
// Origine : scripts/social/cartes-deputes.ts, trameURI (extraction du 2 oct. 2026).

/** ⚠️ Toute retouche de l'algorithme ci-dessous DOIT incrémenter cette
 *  version : elle entre dans la clé des caches, sinon l'ancienne trame
 *  resservira. */
export const TRAME_VERSION = "1";

export type OptionsTrame = {
  /** Pas de la trame, en px de l'image (8 : impression ; 4 : écran ; 3 : courriel). */
  cellule: number;
  /** Facteur de rastérisation du SVG des points (2 pour une carte à l'échelle 2). */
  densite: number;
  /** Format de sortie ; les portraits des élus sont en 3:4, 1500 × 2000. */
  largeur: number;
  hauteur: number;
  /** Détourage : hors du masque, l'image est transparente et laisse voir la carte. */
  masque?: Buffer;
  /** Pour les messages d'erreur. */
  nom: string;
};

export const FORMAT_PORTRAIT = { largeur: 1500, hauteur: 2000 } as const;

/** La photo tramée, en PNG. `null` si la photo est illisible ou si le rendu
 *  SVG échoue (c'est dit sur la console : une carte sans portrait ne doit
 *  jamais sortir en silence). */
export async function tramer(octets: Buffer, options: OptionsTrame): Promise<Buffer | null> {
  const format = options;
  const sharp = (await import("sharp")).default;
  const prepared = await sharp(octets)
    .resize(format.largeur, format.hauteur, { fit: "cover", position: "centre", kernel: "lanczos3" })
    .modulate({ brightness: 1.03, saturation: 1.7 })
    .linear(1.24, -30)
    .sharpen({ sigma: 0.8, m1: 0.65, m2: 0.35 })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true }).catch(() => null);
  if (!prepared) return null;
  const { data, info } = prepared;
  const cell = options.cellule;
  const cx = info.width / 2; const cy = info.height / 2;
  const channels = [
    { angle: 15, fill: "#00CBE6", gain: 1.04, protectHighlights: true, value: (r: number) => 1 - r / 255 },
    { angle: 75, fill: "#FF2F75", gain: 1.04, protectHighlights: true, value: (_r: number, g: number) => 1 - g / 255 },
    { angle: 0,  fill: "#FFD900", gain: 1.04, protectHighlights: true, value: (_r: number, _g: number, b: number) => 1 - b / 255 },
    { angle: 45, fill: "#171412", gain: 0.7, protectHighlights: true, value: (r: number, g: number, b: number) => 1 - Math.max(r, g, b) / 255 },
  ];
  const couches: { fill: string; angle: number; points: [number, number, number][] }[] = [];
  const margin = 480;
  for (const ch of channels) {
    const rad = ch.angle * Math.PI / 180;
    const cos = Math.cos(rad); const sin = Math.sin(rad);
    const points: [number, number, number][] = [];
    for (let v = -margin; v < info.height + margin; v += cell) {
      for (let u = -margin; u < info.width + margin; u += cell) {
        const x = Math.round(cx + (u - cx) * cos - (v - cy) * sin);
        const y = Math.round(cy + (u - cx) * sin + (v - cy) * cos);
        if (x < 0 || x >= info.width || y < 0 || y >= info.height) continue;
        const i = (y * info.width + x) * 3;
        const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
        let coverage = Math.max(0, Math.min(1, ch.value(r, g, b)));
        if (ch.protectHighlights) {
          const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          const protection = luminance > 0.55 ? ((luminance - 0.55) / 0.45) * 0.7 : 0;
          coverage *= 1 - Math.min(0.7, protection);
        }
        const radius = (cell / 2) * Math.sqrt(coverage) * ch.gain;
        if (radius > 0.18) points.push([u, v, radius]);
      }
    }
    couches.push({ fill: ch.fill, angle: ch.angle, points });
  }
  // LE LECTEUR SVG REFUSE PLUS D'UN MILLION D'ÉLÉMENTS. Un <circle> par point,
  // comme depuis le début, tant que le portrait tient sous ce seuil : les
  // trames des cartes imprimées (8 px) et du site (4 px) sortent donc à
  // l'identique. À trame fine (3 px, style courriel), un portrait sombre
  // dépasse le seuil : ses points sont alors tracés en deux arcs et regroupés
  // par 2 000 dans un même <path>. Le rendu diffère de quelques valeurs sur le
  // bord des points, sans effet visible. Constat du 29-09 : 34 cartes sur 129
  // sortaient sans portrait, sans un mot.
  const total = couches.reduce((n, c) => n + c.points.length, 0);
  const groupes = total > 999_900;
  const groups = couches.map((c) => {
    const dessin: string[] = [];
    if (groupes) {
      const arcs = c.points.map(([u, v, radius]) => {
        const rr = radius.toFixed(2);
        return `M${(u - radius).toFixed(2)} ${v}a${rr} ${rr} 0 1 0 ${(2 * radius).toFixed(2)} 0a${rr} ${rr} 0 1 0 ${(-2 * radius).toFixed(2)} 0`;
      });
      for (let k = 0; k < arcs.length; k += 2000) dessin.push(`<path d="${arcs.slice(k, k + 2000).join("")}"/>`);
    } else {
      for (const [u, v, radius] of c.points) dessin.push(`<circle cx="${u}" cy="${v}" r="${radius.toFixed(2)}"/>`);
    }
    return `<g fill="${c.fill}" style="mix-blend-mode:multiply" transform="rotate(${c.angle} ${cx} ${cy})">${dessin.join("")}</g>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}"><rect width="100%" height="100%" fill="#FAF7EF"/>${groups.join("")}</svg>`;
  // Un échec est DIT : il laissait la carte sans portrait, sans un mot.
  let buf = await sharp(Buffer.from(svg), { density: 72 * options.densite }).png({ compressionLevel: 8 }).toBuffer()
    .catch((e) => { console.warn(`  ⚠️ trame en échec pour ${options.nom} : ${e instanceof Error ? e.message : e}`); return null; }); // garde-redaction: ok (diagnostic de console au build, jamais affiché)
  if (buf && format.masque) {
    // En deux temps : sharp retire la transparence à la FIN de sa chaîne, et
    // emporterait le masque qu'on vient de joindre.
    const rvb = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = rvb.info;
    const decoupe = await sharp(format.masque).resize(width, height, { fit: "fill" }).greyscale().raw().toBuffer();
    buf = await sharp(rvb.data, { raw: { width, height, channels: 3 } })
      .joinChannel(decoupe, { raw: { width, height, channels: 1 } })
      .png({ compressionLevel: 8 }).toBuffer().catch(() => null);
  }
  if (!buf) return null;
  return buf;
}
