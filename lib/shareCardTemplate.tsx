import { PAPER, INK, CORDOVAN, RULE } from "@/lib/shareImageTokens";

// GABARIT UNIQUE DES CARTES DE PARTAGE. Les deux artefacts publiés (la carte
// de déballage 1200×630 pour X/Facebook/LinkedIn, la story 1080×1920 pour
// Instagram) sont deux CADRAGES d'une même affiche, pas deux maquettes. Avant,
// chaque générateur portait sa propre copie de la mise en page : la story et
// la carte OG avaient déjà divergé (le tampon, le voile, le cadrage de la
// photo). Une seule fonction ici, deux formats en paramètre.
//
// IDENTITÉ VISUELLE : l'affiche de journal du site lui-même (papier, encre,
// filets), pas une photo légendée. Les fonds photographiques achetés (Bob
// Gratton) ont été retirés : ils pesaient 3,2 Mo par story contre 73 Ko pour
// une affiche à plat, ce qui rendait impossible de générer une carte par
// édition (#265).

export type ShareCardFormat = "og" | "story";

export type ShareCardContent = {
  /** Nom du module, rendu en capitales. */
  title: string;
  /** Accroche courte sous le titre (une ligne, sans verbe conjugué). */
  subtitle?: string;
  /** Étiquette au-dessus du bloc central : l'enjeu CAP, quand il existe. */
  kicker?: string;
  /** Le grand chiffre. Absent pour la Une des Unes, qui affiche une manchette. */
  figureValue?: string;
  /** Légende du grand chiffre. */
  figureLabel?: string;
  /** Manchette (Une des Unes) : le titre domine, le ratio passe au second plan. */
  headline?: string;
  /** Lead synthétique sous la manchette. */
  excerpt?: string;
  /**
   * La ligne encadrée en bas de l'affiche. TOUJOURS dérivée des données de la
   * Vitrine (phrase éditoriale du module, enjeu dominant, promesse saillante),
   * jamais un texte d'invitation générique : c'est ce qui distingue cette
   * carte d'un gabarit à remplir.
   */
  reflection?: string;
  /** Couleur de la donnée elle-même (parti, enjeu). Jamais une teinte inventée. */
  accent?: string;
  /** « Édition de 8h, mardi 19 août » — vide pour l'édition courante. */
  editionLabel?: string;
  /** Illustration courante de la Une des Unes. Jamais fournie aux archives. */
  imageSrc?: string;
  /** Niveau calibré affiché comme principal crochet de partage du module 1. */
  salienceLabel?: string;
  /** Rang 1–6 qui détermine la couleur du badge de saillance. */
  salienceRank?: number;
};

// Traduit le contenu d'un module (lib/shareModules.ts) vers le contrat de
// l'affiche. Un seul endroit décide QUOI va dans le cadre du bas : la phrase
// que la Vitrine a déjà calculée pour ce module (le lead de la Une, la phrase
// éditoriale des deux solitudes, l'enjeu dominant, la promesse saillante).
export function toShareCardContent(
  content: ShareModuleContentLike,
  editionLabel?: string,
): ShareCardContent {
  const { stat } = content;
  // `kicker` ne vaut que pour la Une des Unes, seul module dont la carte mène
  // avec une manchette : c'est le drapeau que les deux générateurs lisaient
  // déjà pour choisir leur gabarit.
  const isHeadline = Boolean(stat.kicker);
  const joined = [stat.context, stat.contextHighlight].filter(Boolean).join(" ");

  // Quand `context` termine la phrase du chiffre, il reste dans la légende et
  // le cadre du bas reste vide : mieux vaut pas de cadre qu'une phrase coupée
  // en deux moitiés qui ne se lisent plus.
  const figureLabel = stat.contextCompletesLabel ? `${stat.label} ${joined}` : stat.label;
  const reflection = isHeadline
    ? stat.excerpt
    : stat.contextCompletesLabel
      ? undefined
      : joined || undefined;

  return {
    title: content.title,
    subtitle: content.subtitle,
    kicker: stat.kicker,
    headline: isHeadline ? stat.context : undefined,
    // Le lead remonte dans le cadre du bas plutôt que sous la manchette : les
    // six cartes ont ainsi le même bloc encadré au même endroit.
    excerpt: undefined,
    figureValue: stat.value,
    figureLabel,
    reflection,
    accent: stat.color,
    editionLabel,
    salienceLabel: stat.salienceLabel,
    salienceRank: stat.salienceRank,
  };
}

type ShareModuleContentLike = {
  title: string;
  subtitle: string;
  stat: {
    value: string;
    label: string;
    context?: string;
    contextHighlight?: string;
    contextCompletesLabel?: boolean;
    color?: string;
    kicker?: string;
    excerpt?: string;
    salienceLabel?: string;
    salienceRank?: number;
  };
};

type FormatSpec = {
  width: number;
  height: number;
  /** L'affiche empile en portrait, et met le chiffre à côté du texte en paysage. */
  stacked: boolean;
  pad: number;
  frameInset: number;
  titleSize: number;
  subtitleSize: number;
  eyebrowSize: number;
  figureSize: number;
  figureLabelSize: number;
  headlineSize: number;
  excerptSize: number;
  reflectionSize: number;
  footerSize: number;
  gap: number;
};

const FORMATS: Record<ShareCardFormat, FormatSpec> = {
  og: {
    width: 1200,
    height: 630,
    stacked: false,
    pad: 44,
    frameInset: 18,
    titleSize: 46,
    subtitleSize: 17,
    eyebrowSize: 15,
    figureSize: 132,
    figureLabelSize: 21,
    headlineSize: 40,
    excerptSize: 19,
    reflectionSize: 18,
    footerSize: 14,
    gap: 18,
  },
  story: {
    width: 1080,
    height: 1920,
    stacked: true,
    pad: 72,
    frameInset: 28,
    titleSize: 92,
    subtitleSize: 30,
    eyebrowSize: 24,
    // Le chiffre était à 300 et sa légende à 36 : le glyphe « % » de Playfair
    // Black écrasait tout, et la légende ressemblait à une note de bas de
    // page. Rapport resserré — le chiffre reste le héros, la légende redevient
    // lisible d'un coup d'œil sur un écran de téléphone.
    figureSize: 260,
    figureLabelSize: 54,
    headlineSize: 84,
    excerptSize: 34,
    reflectionSize: 32,
    footerSize: 22,
    gap: 34,
  },
};

export function getShareCardFormat(format: ShareCardFormat): FormatSpec {
  return FORMATS[format];
}

// Espaces insécables avant « % » et « : » (canon OQLF, skill
// redaction-editoriale). Ce n'est pas de la coquetterie ici : Satori coupe ses
// lignes sur les espaces ordinaires, et la première carte générée publiait
// « …de 50 » en fin de ligne avec « % » seul sur la suivante.
function fmt(text: string, max?: number): string {
  const t = text.replace(/ ([%:])/g, " $1");
  if (max === undefined || t.length <= max) return t;
  // Coupe au dernier mot ENTIER : la troncature brute publiait « à l'ap… » au
  // milieu d'un mot, ce qui se lit comme une carte cassée plutôt que comme une
  // citation écourtée. On ne recule pas au-delà de 70 % de la longueur visée,
  // sinon un texte sans espace rendrait la carte presque vide.
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const kept = lastSpace > max * 0.7 ? cut.slice(0, lastSpace) : cut;
  return `${kept.replace(/[\s,;:.\u2019\'-]+$/, "")}…`;
}

// Fleur de lys — tracé repris de `public/images/fleur-de-lys.svg`, inséré en
// SVG plutôt qu'en <img> pour qu'il prenne la couleur d'encre du gabarit. Elle
// remplace le carré bleu et le carré rouge de la maquette d'origine, qui
// encadraient le chiffre de l'Assemblée et se lisaient comme le drapeau
// tricolore : la carte du module parlementaire québécois ne peut pas évoquer
// l'Assemblée nationale française (#265).
const FLEUR_PATH =
  "M297.69,147.804c-47.642-5.459-97.763,27.791-107.192,94.289c-0.329,2.318-0.605,4.685-0.824,7.076h-2.81c4.056-45.102,22.727-76.399,33.905-97.214c14.49-26.98,2.729-53.559-2.997-65.452C211.276,73.013,181.848,18.486,174.354,0c-7.494,18.486-36.702,73.013-43.198,86.503c-5.728,11.893-17.488,38.472-2.998,65.452c11.103,20.673,29.87,52.316,34.226,97.214h-3.208c-0.219-2.392-0.495-4.758-0.824-7.076c-9.43-66.499-59.551-99.748-107.192-94.289c-53.284,6.105-81.882,90.319,0.496,110.666c-13.399-24.813,7.443-69.477,55.583-44.167c15.656,8.232,26.561,21.383,31.072,34.866h-8.065c-7.608,0-13.776,4.469-13.776,9.983c0,5.514,6.168,9.983,13.776,9.983h9.817c-0.803,4.348-2.456,8.464-5.034,12.162c-11.416,16.377-49.649,7.444-28.31-28.286c-36.065-4.747-45.649,29.279-35.228,47.641c11.453,23.411,61.479,30.428,80.41-2.978c4.54-8.012,6.819-18.047,7.555-28.539h3.864c-0.033,7.932-0.53,16.224-1.59,24.887c-12.647,8.146-7.717,25.725-23.735,36.234c10.062,0.265,18.271-1.708,20.92-5.415c0,10.75,9.617,19.812,15.886,32.858c5.824-13.119,15.208-24.094,15.208-32.858c2.648,3.707,10.857,5.68,20.92,5.415c-14.687-9.01-8.898-25.516-23.261-37.306c-1.015-8.293-1.508-16.22-1.589-23.815h3.312c0.735,10.492,3.016,20.527,7.555,28.539c18.931,33.405,68.957,26.389,80.41,2.978c10.422-18.361,0.838-52.388-35.228-47.641c21.34,35.73-16.894,44.663-28.31,28.286c-2.577-3.698-4.23-7.814-5.033-12.162h10.572c7.608,0,13.776-4.47,13.776-9.983c0-5.515-6.168-9.983-13.776-9.983h-8.821c4.512-13.483,15.416-26.634,31.072-34.866c48.14-25.31,68.982,19.354,55.583,44.167C379.573,238.124,350.974,153.91,297.69,147.804z";

function Fleur({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="-0.864 -0.333 350 359">
      <path d={FLEUR_PATH} fill={color} />
    </svg>
  );
}

// Même progression visuelle que les six bandes publiques de saillance. Le
// rang vient de la calibration : la carte ne déduit jamais un niveau depuis
// le texte et ne peut donc pas repeindre une Une dans la mauvaise bande.
const SALIENCE_COLORS: Record<number, { background: string; foreground: string }> = {
  1: { background: "#E4DCC6", foreground: INK },
  2: { background: "#DCCBA2", foreground: INK },
  3: { background: "#D2B488", foreground: INK },
  4: { background: "#C99A76", foreground: INK },
  5: { background: "#BE7C6A", foreground: PAPER },
  6: { background: "#A85A52", foreground: PAPER },
};

export function ShareCard({ content, format }: { content: ShareCardContent; format: ShareCardFormat }) {
  const f = FORMATS[format];
  const accent = content.accent ?? CORDOVAN;
  const mono = "IBM Plex Mono";
  const display = "Playfair Display";
  const body = "Source Serif 4";

  // La manchette (Une des Unes) est une nouvelle, pas une statistique : le
  // titre de la Une domine, et le ratio « X/Y médias » devient une preuve de
  // second plan. Les cinq autres modules mènent avec leur chiffre.
  const isHeadlineCard = Boolean(content.headline);
  const showHeadlineImage = Boolean(isHeadlineCard && !f.stacked && content.imageSrc);
  const showSalience = Boolean(isHeadlineCard && !f.stacked && content.salienceLabel);
  const salienceColor = SALIENCE_COLORS[content.salienceRank ?? 0] ?? SALIENCE_COLORS[4];

  const eyebrow = (
    <div style={{ display: "flex", flexDirection: "column", gap: f.gap * 0.4 }}>
      <div style={{ display: "flex", width: f.titleSize * 1.6, height: Math.max(4, f.titleSize * 0.08), background: accent }} />
      <div
        style={{
          display: "flex",
          fontFamily: mono,
          fontSize: f.eyebrowSize,
          letterSpacing: f.eyebrowSize * 0.22,
          textTransform: "uppercase",
          color: INK,
          opacity: 0.72,
        }}
      >
        La Vitrine démocratique
      </div>
    </div>
  );

  const heading = (
    <div style={{ display: "flex", flexDirection: "column", gap: f.gap * 0.3 }}>
      <div
        style={{
          display: "flex",
          fontFamily: display,
          fontWeight: 900,
          fontSize: f.titleSize,
          lineHeight: 1.02,
          letterSpacing: -f.titleSize * 0.02,
          textTransform: "uppercase",
          color: INK,
          maxWidth: f.width - f.pad * 2,
        }}
      >
        {fmt(content.title)}
      </div>
      {content.subtitle && (
        <div
          style={{
            display: "flex",
            fontFamily: mono,
            fontSize: f.subtitleSize,
            letterSpacing: f.subtitleSize * 0.16,
            textTransform: "uppercase",
            color: accent,
          }}
        >
          {fmt(content.subtitle)}
        </div>
      )}
    </div>
  );

  const figure = isHeadlineCard ? (
    <div style={{ display: "flex", flexDirection: "column", gap: f.gap * 0.55, maxWidth: f.stacked ? f.width - f.pad * 2 : 640 }}>
      {content.kicker && (
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            background: accent,
            color: PAPER,
            fontFamily: mono,
            fontSize: f.eyebrowSize,
            letterSpacing: f.eyebrowSize * 0.16,
            textTransform: "uppercase",
            padding: `${f.gap * 0.2}px ${f.gap * 0.5}px`,
          }}
        >
          {fmt(content.kicker)}
        </div>
      )}
      {showSalience && (
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            background: salienceColor.background,
            color: salienceColor.foreground,
            fontFamily: mono,
            fontWeight: 600,
            fontSize: 24,
            lineHeight: 1,
            letterSpacing: 2.8,
            textTransform: "uppercase",
            padding: "12px 18px",
          }}
        >
          {fmt(`Saillance ${content.salienceLabel}`)}
        </div>
      )}
      <div
        style={{
          display: "flex",
          fontFamily: display,
          fontWeight: 900,
          fontSize: f.headlineSize,
          lineHeight: 1.1,
          letterSpacing: -f.headlineSize * 0.02,
          color: INK,
        }}
      >
        {fmt(content.headline ?? "", f.stacked ? 120 : 90)}
      </div>
      {content.excerpt && (
        <div
          style={{
            display: "flex",
            fontFamily: body,
            fontStyle: "italic",
            fontSize: f.excerptSize,
            lineHeight: 1.4,
            color: INK,
            opacity: 0.72,
          }}
        >
          {fmt(content.excerpt, f.stacked ? 150 : 110)}
        </div>
      )}
      {content.figureValue && (
        <div style={{ display: "flex", alignItems: "baseline", gap: f.gap * 0.4 }}>
          <div style={{ display: "flex", fontFamily: display, fontWeight: 900, fontSize: f.figureLabelSize * 1.7, color: accent }}>
            {content.figureValue}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: mono,
              fontSize: f.footerSize,
              letterSpacing: f.footerSize * 0.14,
              textTransform: "uppercase",
              color: INK,
              opacity: 0.68,
            }}
          >
            {fmt(content.figureLabel ?? "")}
          </div>
        </div>
      )}
    </div>
  ) : (
    <div
      style={{
        display: "flex",
        flexDirection: f.stacked ? "column" : "row",
        alignItems: f.stacked ? "flex-start" : "center",
        gap: f.stacked ? f.gap * 0.5 : f.gap * 2,
      }}
    >
      <div
        style={{
          display: "flex",
          fontFamily: display,
          fontWeight: 900,
          fontSize: f.figureSize,
          lineHeight: 0.92,
          letterSpacing: -f.figureSize * 0.04,
          color: accent,
        }}
      >
        {content.figureValue}
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: body,
          fontSize: f.figureLabelSize,
          lineHeight: 1.3,
          color: INK,
          maxWidth: f.stacked ? f.width - f.pad * 2 : 520,
        }}
      >
        {fmt(content.figureLabel ?? "")}
      </div>
    </div>
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background: PAPER,
        fontFamily: body,
        padding: f.pad,
        // En 9:16 les quatre blocs se répartissent le vide à parts égales
        // (trois intervalles), au lieu de laisser une seule fosse au milieu de
        // l'affiche. En paysage, la hauteur suffit : le bloc central garde son
        // `flex: 1` et le reste se cale naturellement. Valeur explicite des
        // deux côtés : Satori appelle `.trim()` sur la valeur et plante sur
        // `undefined`.
        justifyContent: f.stacked ? "space-between" : "flex-start",
      }}
    >
      {/* Filet de cadre — le langage de l'imprimé, repris de design_language.md §3. */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: f.frameInset,
          left: f.frameInset,
          right: f.frameInset,
          bottom: f.frameInset,
          border: `2px solid ${RULE}`,
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: f.gap, position: "relative" }}>
        {eyebrow}
        {heading}
      </div>

      {/* En 9:16, le bloc central était centré dans plus de 1300 px libres : le
          vide se répartissait en deux bandes égales, au-dessus et au-dessous du
          chiffre, ce qui se lit comme un défaut de rendu plutôt que comme une
          respiration. On ancre donc le bloc sous le titre et on le referme d'un
          filet : la marge restante tombe d'un seul côté, où elle redevient une
          marge d'affiche. Le format paysage n'a pas ce problème (630 px de
          haut) et garde son centrage. */}
      <div
        style={{
          display: "flex",
          // Pas de `flex: 1` en portrait : c'est lui qui absorbait tout le vide
          // et le concentrait autour du chiffre.
          flex: f.stacked ? "0 0 auto" : 1,
          position: "relative",
          flexDirection: showHeadlineImage ? "row" : "column",
          justifyContent: "center",
          alignItems: showHeadlineImage ? "center" : "stretch",
          gap: showHeadlineImage ? f.gap * 1.5 : 0,
        }}
      >
        {figure}
        {showHeadlineImage && (
          <div
            style={{
              display: "flex",
              width: 370,
              height: 300,
              flex: "0 0 370px",
              overflow: "hidden",
              border: `2px solid ${INK}`,
              background: RULE,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={content.imageSrc}
              alt=""
              width="370"
              height="300"
              style={{ width: "370px", height: "300px", objectFit: "cover" }}
            />
          </div>
        )}
        {f.stacked && <div style={{ display: "flex", marginTop: f.gap * 1.2, height: 3, background: RULE }} />}
      </div>

      {content.reflection && (
        <div
          style={{
            display: "flex",
            position: "relative",
            border: `2px solid ${INK}`,
            padding: `${f.gap * 0.6}px ${f.gap * 0.8}px`,
            marginBottom: f.gap * 0.7,
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: body,
              fontStyle: "italic",
              fontSize: f.reflectionSize,
              lineHeight: 1.35,
              color: INK,
            }}
          >
            {fmt(content.reflection, f.stacked ? 190 : 150)}
          </div>
        </div>
      )}

      <div style={{ display: "flex", position: "relative", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: f.gap * 0.4 }}>
          <Fleur size={f.footerSize * 1.5} color={INK} />
          <div
            style={{
              display: "flex",
              fontFamily: mono,
              fontSize: f.footerSize,
              letterSpacing: f.footerSize * 0.2,
              textTransform: "uppercase",
              color: INK,
              opacity: 0.72,
            }}
          >
            Québec
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: mono,
            fontSize: f.footerSize,
            letterSpacing: f.footerSize * 0.12,
            color: INK,
            opacity: 0.62,
          }}
        >
          {content.editionLabel ?? "vitrinedemocratique.com"}
        </div>
      </div>
    </div>
  );
}
