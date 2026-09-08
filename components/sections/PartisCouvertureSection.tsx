import { loadParties } from "@/lib/data/parties";
import { groupeParAlbums, groupeParDiscographie, loadPochettes } from "@/lib/data/pochettes";
import { formatDateFr } from "@/lib/dates";
import { instantPublicationBloc, loadHeadlineEvents } from "@/lib/data/headlineEvents";
import { PartisCouvertureClient } from "@/components/interactive/PartisCouvertureClient";

// SORTI DU RODAGE : le module est public depuis cette PR. Il avait été retiré
// de prod le 2026-08-20, avant l'envoi aux médias, le temps que le modèle des
// partis soit réentraîné — ce qu'il a été (neuf modèles binaires, justesse
// 0,61 → 0,94 sur un jeu annoté à quatre personnes, § 06 de la méthodologie).
// La garde vivait ICI, à la source, pour que tout point de montage la suive
// sans qu'on ait à y penser ; c'est pour la même raison qu'elle disparaît ici
// en premier. Le § 06 porte l'avis d'état qui accompagne le module en public,
// dont la réserve sur le PCQ, dont la colonne reste à zéro.
//
// ⚠️ NE PAS confondre avec les deux gardes `isProd` de
// PartisCouvertureClient.tsx : celles-là protègent un easter egg réservé à dev
// et RESTENT en place.

export async function PartisCouvertureSection({ asOfIso, editionKey }: { asOfIso?: string; editionKey?: string } = {}) {
  // DEUX BORNES, PAS UNE. `asOfIso` nomme le jour de l'édition ; il suffit à la
  // table quotidienne, qui n'a qu'une ligne par journée. La table intra-journée
  // en publie six, et bornée au jour elle les servait TOUTES à chaque édition —
  // celle du matin montrait donc les blocs du soir (#735). `editionKey` est le
  // début du bloc en UTC, dont on tire l'instant de publication.
  const data = await loadParties(asOfIso, editionKey ? instantPublicationBloc(editionKey) ?? undefined : undefined);
  if (!data) return null;

  // Le RYTHME des vumètres suit la saillance de la Une du moment : nerveux
  // quand l'actualité est exceptionnelle, ample quand elle est ordinaire. On lit
  // le rang de l'événement de tête (1 très faible → 6 exceptionnelle), la même
  // grandeur que le badge de la Une des Unes.
  //
  // Les deux chargeurs sont mémoïsés par `cache()` : cet appel ne relit aucun
  // fichier, la Une des Unes l'ayant déjà fait sur la même page.
  //
  // ⚠️ Purement décoratif, et le repli est SILENCIEUX PAR CONSTRUCTION : rang 0
  // quand la donnée manque, ce que le CSS traduit par un tempo médian. Le module
  // des partis ne doit jamais dépendre de la santé du module 1 — c'est
  // exactement ainsi que vitrine#201 s'est cassée, en lisant un champ absent et
  // en repliant en silence sur une valeur qui semblait bonne.
  let saillanceRang = 0;
  try {
    const une = await loadHeadlineEvents();
    saillanceRang = une?.top3?.[0]?.saillanceRank ?? 0;
  } catch {
    saillanceRang = 0;
  }

  // LES POCHETTES ENGENDRÉES, lues sur le disque du build (le rapatriement est
  // fait par scripts/fetch_art.mjs, avant Next). Deux bacs en sortent : celui du
  // jour, qui suit les blocs de 4 h, et la discothèque, qui accumule la version
  // de fin de journée. Le dossier absent rend deux bacs vides et le module
  // retombe sur ses pochettes géométriques — jamais une erreur de build.
  //
  // Le formatage des dates est INJECTÉ plutôt qu'importé par le chargeur : ce
  // dernier ne fait que lire des fichiers, et n'a pas à connaître la langue de
  // l'affichage.
  const discotheque = await loadPochettes(formatDateFr);

  // LE DISQUE D'OR DU PALMARÈS lit les MÊMES groupages que la page
  // `/discotheque` (`lib/data/pochettes.ts`), sur le même `fonds` — aucune
  // pochette n'est relue ni reclassée pour l'un ou pour l'autre. `singlesParEcoute`
  // n'est pas nécessaire ici : le classement du trophée (les cinq entrées, sur
  // les trois vitesses) vient de `data.ranges[range].rows` — l'agrégat du
  // palmarès lui-même, jamais du fonds de pochettes — qui ne sert plus qu'à
  // fournir une COUVERTURE, en bonus, via `discotheque.duJour`/`albums`/
  // `discographies`.
  const albums = groupeParAlbums(discotheque.fonds, formatDateFr);
  const discographies = groupeParDiscographie(discotheque.fonds);

  // `editionKey` vient de main (cartes de partage par édition, #partage-cartes),
  // `saillanceRang` de cette branche. Les deux cohabitent : l'un identifie la
  // page, l'autre donne le tempo des vumètres.
  return (
    <PartisCouvertureClient
      data={data}
      discotheque={discotheque}
      albums={albums}
      discographies={discographies}
      saillanceRang={saillanceRang}
      editionKey={editionKey}
    />
  );
}
