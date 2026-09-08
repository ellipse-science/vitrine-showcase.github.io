"use client";

/**
 * L'ÉTIQUETTE DU DISQUE, posée au centre de l'illustration — le sigle du parti
 * au-dessus du trou du spindle, la date en dessous, comme l'étiquette centrale
 * d'un 45 tours.
 *
 * C'EST LA MÊME ÉTIQUETTE QUE CELLE DU SINGLE PAS ENCORE PRESSÉ
 * (`.trophee-etiquette-disque`, le cercle de couleur sur le carton crème) : un
 * disque ne change pas de nature quand son illustration arrive, seul le FOND
 * change — le papier crème cède la place à l'image. Le trou au centre est le
 * point de la chose : c'est lui qui dit qu'on pourrait sortir le vinyle de sa
 * pochette et le poser sur un plateau.
 *
 * PARTAGÉE par les deux endroits qui montrent une pochette ILLUSTRÉE en grand :
 *  - la couverture du disque d'or et son volet (`PartisCouvertureClient`,
 *    `CouvertureTrophee`) ;
 *  - les couvertures de `/discotheque` (`DiscothequeClient`, `Pochette`).
 * Les miniatures de tracklist (58 px) n'en portent pas : à cette taille, une
 * étiquette masquerait l'illustration sans que rien n'y soit lisible.
 *
 * ⚠️ LE TEXTE RESTE VRAI POUR UN LECTEUR D'ÉCRAN, il n'est pas `aria-hidden` :
 * sur la couverture d'une plaque fermée, le sigle porté ici est le seul mot qui
 * nomme le parti — l'illustration, elle, est décorative.
 */
export function PochettePastille({
  sigle,
  jourCourt,
  couleur,
}: {
  sigle: string;
  /** « 12 août ». Absente quand le jour n'est pas connu : l'étiquette se rend
   *  alors sans sa ligne du bas, plutôt qu'avec un vide qui ferait croire à une
   *  date manquante. */
  jourCourt?: string;
  /** La couleur du parti, posée ici plutôt qu'héritée : l'étiquette doit tenir
   *  sa couleur d'elle-même, sans dépendre d'un `--party` déclaré par tel ou
   *  tel ancêtre selon la page. */
  couleur: string;
}) {
  return (
    <span className="pochette-pastille" style={{ ["--party" as string]: couleur }}>
      <b className="pochette-pastille-sigle">{sigle}</b>
      {jourCourt && <b className="pochette-pastille-date">{jourCourt}</b>}
    </span>
  );
}
