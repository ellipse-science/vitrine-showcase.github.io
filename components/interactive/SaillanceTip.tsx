"use client";

import { InfoTip } from "./InfoTip";

// Lien vers la section §03 de la méthodologie (ancre #indice-saillance),
// préfixé du basePath de l'export statique (GitHub Pages).
const METHO_HREF = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/methodologie/#indice-saillance`;

// Icône d'explication de la saillance (définition + renvoi à la métho), affichée
// une fois à côté du titre de section.
export function SaillanceTip() {
  return (
    <InfoTip size="lg" label="Qu’est-ce que la saillance ?">
      La saillance mesure la place qu’une nouvelle occupe à la Une des médias :
      plus elle y reste longtemps et dans plus de médias, plus elle est saillante.
      Toutes les nouvelles présentées ici ont fait la Une. L’étiquette les compare
      entre elles, des moins aux plus saillantes du moment.
      <a href={METHO_HREF}>En savoir plus →</a>
    </InfoTip>
  );
}
