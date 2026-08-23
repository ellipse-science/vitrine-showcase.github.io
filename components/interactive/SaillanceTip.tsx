"use client";

import { InfoTip } from "./InfoTip";

// Lien vers la section §03 de la méthodologie (ancre #indice-saillance),
// préfixé du basePath de l'export statique (GitHub Pages).
const METHO_HREF = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/methodologie/#indice-saillance`;

// Icône d'explication de la saillance (définition + renvoi à la métho), affichée
// une fois à côté du titre de section.
export function SaillanceTip() {
  return (
    <InfoTip size="lg" label="Qu’est-ce que la saillance?">
      La saillance mesure la place qu’une nouvelle occupe à la Une des médias :
      plus elle y reste longtemps et dans plus de médias, plus elle est saillante.
      Toutes les nouvelles présentées ici ont fait la Une. L’étiquette les compare
      entre elles, des moins aux plus saillantes du moment. Les points vont de 0 à
      100&nbsp;: c’est l’attention reçue sur les 24 dernières heures, les heures
      récentes comptant davantage.
      <a href={METHO_HREF}>En savoir plus →</a>
      {/* Nombre de manchettes (closes #307) : une seule nouvelle à l’écran se
          lisait comme un bogue, « on comprend pas que c’est LA nouvelle du
          moment, et que rien d’autre n’est aussi saillant » (Yannick). La
          réponse vit ici, sous le lien, à la demande d’Adrien. */}
      <span className="tip-note">
        De une à trois nouvelles figurent ici, selon l’actualité&nbsp;: seules celles
        qui se détachent nettement des autres sont retenues.
      </span>
    </InfoTip>
  );
}
