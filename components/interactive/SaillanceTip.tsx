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
      {/* Réécrit le 2026-08-22 (Adrien : « pas si juste et pas si simple ») :
          l'ancienne phrase oubliait les articles et disait que l'étiquette
          compare « les nouvelles du moment » — elle les situe parmi les Unes
          d'une ANNÉE. Le lien est sur sa propre ligne : collé au texte, JSX
          avalait l'espace et « davantage.En savoir plus » se lisait d'un bloc. */}
      La saillance, c’est la place qu’une nouvelle prend à la Une des médias
      québécois&nbsp;: combien de médias l’y mettent, avec combien d’articles, et
      pendant combien de temps. Les points, de 0 à 100, résument cette place sur
      les 24 dernières heures, les heures récentes comptant davantage.
      L’étiquette, de «&nbsp;Très faible&nbsp;» à «&nbsp;Exceptionnelle&nbsp;»,
      situe chaque nouvelle parmi les Unes d’une année entière.
      <span className="tip-link"><a href={METHO_HREF}>En savoir plus →</a></span>
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
