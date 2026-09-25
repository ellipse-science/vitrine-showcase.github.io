// Le contrat entre un module (la Une des Unes, les Partis…) et les cinq
// réseaux. Un module produit une `Matiere` ; chaque réseau la met en forme à sa
// façon, sans rien savoir des autres.

export type Reseau = "linkedin" | "x" | "facebook" | "instagram" | "tiktok";

/** La matière d'une édition, telle que chaque réseau la reçoit. */
export type Matiere = {
  /** « Les faits saillants au Québec en ce moment (Édition de 16h) » */
  titre: string;
  /** Une ligne par nouvelle, déjà numérotée et mesurée. */
  items: string[];
  /** Les titres seuls, sans la mesure — pour X, où chaque caractère compte. */
  titresSeuls: string[];
  lien: string;
};

/** Ce que chaque fichier de réseau doit exporter. Rien de plus. */
export type Format = {
  /** Qui publie sur ce réseau. */
  responsable: string;
  /** Le texte prêt à copier. */
  post: (m: Matiere) => string;
};
