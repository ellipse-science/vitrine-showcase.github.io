"use client";

import { useState } from "react";
import { formatDuree } from "@/lib/duree";
import type { Album, Discographie, Single } from "@/lib/data/pochettes";
import { LigneTracklist, LigneTracklistTon } from "@/components/interactive/Tracklist";

type Vue = "jour" | "semaine" | "campagne";

/** MÊME TRIADE QUE LE KNOB « VITESSE » DU PALMARÈS, dans le même ordre — du
 *  plus fin au plus large. Le palmarès l'a fait tourner comme un tourne-disque
 *  (78/45/33 tours) ; ici, trois boutons suffisent : la métaphore vinyle
 *  reposait sur la VITESSE du plateau, qui ne veut rien dire pour parcourir un
 *  fonds. */
const VUES: readonly { cle: Vue; mot: string; infobulle: string }[] = [
  {
    cle: "jour",
    mot: "Jour",
    infobulle: "Chaque single, seul\u00a0: tous les partis et toutes les journées, classés en ordre d'écoute.",
  },
  { cle: "semaine", mot: "Semaine", infobulle: "Un album par parti et par semaine, sept singles au plus." },
  {
    cle: "campagne",
    mot: "Campagne",
    infobulle: "La discographie complète de chaque parti, tous ses singles depuis le début du suivi.",
  },
];

/**
 * LE FONDS, EN TROIS LECTURES : chaque single seul (jour), par album (semaine)
 * ou par discographie (campagne). Les trois viennent de la MÊME donnée —
 * `fonds`, chargée une fois côté serveur et regroupée trois façons par
 * `singlesParEcoute`/`groupeParAlbums`/`groupeParDiscographie`
 * (`lib/data/pochettes.ts`) — cette bascule ne fait que choisir laquelle
 * montrer.
 *
 * "use client" : la seule partie interactive de la page. Le chargement des
 * pochettes reste dans le composant serveur (`page.tsx`), qui lit le disque —
 * ce composant-ci ne reçoit que des données déjà prêtes.
 */
export function DiscothequeClient({
  singles,
  albums,
  discographies,
}: {
  singles: Single[];
  albums: Album[];
  discographies: Discographie[];
}) {
  // JOUR PAR DÉFAUT, comme le knob « Vitesse » du palmarès s'ouvre sur
  // aujourd'hui : c'est la vue la plus immédiate, celle qu'on veut voir en
  // arrivant sur la page.
  const [vue, setVue] = useState<Vue>("jour");

  return (
    <>
      <div className="fonds-vue" role="group" aria-label="Comment ranger le fonds">
        {VUES.map((v) => (
          <button
            key={v.cle}
            type="button"
            className="fonds-vue-bouton"
            aria-pressed={v.cle === vue}
            onClick={() => setVue(v.cle)}
            title={v.infobulle}
          >
            <i className="fonds-vue-diode" aria-hidden="true" />
            {v.mot}
          </button>
        ))}
      </div>

      {vue === "jour" ? (
        singles.length === 0 ? (
          <p className="fonds-vide">Aucun single pour l&apos;instant.</p>
        ) : (
          <ol className="fonds-albums fonds-albums--singles">
            {singles.map((single) => (
              <li key={`${single.jour}/${single.parti}`}>
                <CarteSingle single={single} />
              </li>
            ))}
          </ol>
        )
      ) : vue === "semaine" ? (
        albums.length === 0 ? (
          <p className="fonds-vide">Aucun album pour l&apos;instant.</p>
        ) : (
          <ol className="fonds-albums">
            {albums.map((album) => (
              <li key={`${album.semaineDebut}/${album.parti}`}>
                <CartePlaque
                  titre={`${album.nom}\u00a0: Album`}
                  sousTitre={`Semaine ${album.semaineLabel}`}
                  couleur={album.couleur}
                  totalMinutes={album.totalMinutes}
                  pistes={album.pistes}
                />
              </li>
            ))}
          </ol>
        )
      ) : discographies.length === 0 ? (
        <p className="fonds-vide">Aucune discographie pour l&apos;instant.</p>
      ) : (
        <ol className="fonds-albums">
          {discographies.map((disco) => (
            <li key={disco.parti}>
              <CartePlaque
                titre={`${disco.nom}\u00a0: Discographie`}
                sousTitre={
                  disco.pistes.length === 1 ? "1 single" : `${disco.pistes.length} singles`
                }
                couleur={disco.couleur}
                totalMinutes={disco.totalMinutes}
                pistes={disco.pistes}
              />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

/**
 * UNE POCHETTE, réutilisée pour l'album ET pour chaque piste de la tracklist —
 * mêmes classes `.pochette-art`/`.pochette-image`/`.pochette-sigle` que partout
 * ailleurs dans le module. `taille` ne change QUE la classe qui l'englobe : la
 * pochette elle-même ne sait pas si elle est la vedette d'une plaque fermée ou
 * une ligne de tracklist.
 */
function Pochette({ single, taille }: { single: Single; taille: "couverture" | "piste" }) {
  if (!single.src) {
    // Sans image confirmée, la COUVERTURE garde son sigle en texte : c'est le
    // seul repère qui resterait sinon pour parcourir un mur de plaques
    // fermées. Une piste de la tracklist n'a pas ce besoin — le nom du parti
    // est déjà écrit une fois, dans l'en-tête de la plaque qui la contient.
    return (
      <span className={`fonds-repli fonds-repli--${taille}`} aria-hidden={taille === "piste"}>
        {taille === "couverture" && <b className="fonds-repli-sigle">{single.sigle}</b>}
      </span>
    );
  }
  return (
    <span className="pochette-art">
      <picture>
        {(single.sources ?? []).map((f) => (
          <source key={f.type} srcSet={f.src} type={f.type} />
        ))}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="pochette-image" src={single.src} alt="" aria-hidden="true" loading="lazy" />
      </picture>
      {taille === "couverture" && (
        <>
          <b className="pochette-sigle">{single.sigle}</b>
          {/* LA DATE DE L'ALBUM. Le fonds range par jour, mais une pochette
              regardée seule ne dit pas duquel elle vient — et ses chiffres sont
              FIGÉS à sa fabrication. La date est donc ce qui les qualifie. */}
          <b className="pochette-date">{single.jourCourt}</b>
        </>
      )}
    </span>
  );
}

/**
 * UNE PLAQUE — l'objet commun à l'album et à la discographie : un en-tête (nom
 * du parti, ce que la carte représente, temps total), puis ses pistes en
 * pochettes miniatures, classées en ORDRE D'ÉCOUTE.
 *
 * Partagée entre les deux vues plutôt que dupliquée : un album et une
 * discographie ne sont pas deux objets différents, ce sont la même chose — une
 * liste de singles d'un même parti — sur deux fenêtres temporelles.
 *
 * ⚠️ FERMÉE PAR DÉFAUT, ET C'EST LE GESTE D'UN VRAI BAC : on regarde une
 * pochette avant de la sortir, on ne voit pas d'emblée ce qu'il y a dedans. La
 * COUVERTURE est celle du single le plus écouté — `pistes[0]`, déjà en tête
 * puisque `pistes` arrive triée — comme un album reprend souvent la pochette de
 * son titre principal. Cliquer révèle la TRACKLIST, qui ne charge ses images
 * qu'à ce moment-là : une discographie peut compter des dizaines de titres, et
 * les charger tous pour une plaque qu'on ne clique jamais serait le même
 * gaspillage que l'ancienne grille de tuiles du module (retirée le
 * 2026-08-31 pour cette exacte raison).
 */
function CartePlaque({
  titre,
  sousTitre,
  couleur,
  totalMinutes,
  pistes,
}: {
  titre: string;
  sousTitre: string;
  couleur: string;
  totalMinutes: number;
  /** Les pistes d'UN album ou d'UNE discographie : toujours le même parti
   *  (déjà nommé dans l'en-tête), la seconde ligne de chacune montre donc la
   *  DATE — ce qui varie d'une piste à l'autre. L'ÉDITION (les cinq partis
   *  d'une même journée, sa seconde ligne au sigle plutôt qu'à la date) a
   *  quitté la vue Jour le 2026-09-05 ; `CartePlaque` n'a donc plus qu'un
   *  seul type de tracklist à savoir dessiner. */
  pistes: Single[];
}) {
  const [ouverte, setOuverte] = useState(false);
  const vedette = pistes[0];
  if (!vedette) return null;

  return (
    <div className={`fonds-plaque${ouverte ? " ouverte" : ""}`} style={{ ["--party" as string]: couleur }}>
      <button
        type="button"
        className="fonds-plaque-declencheur"
        onClick={() => setOuverte((v) => !v)}
        aria-expanded={ouverte}
        aria-label={
          `${titre}. ${sousTitre}. ${formatDuree(totalMinutes)} au total. ` +
          `${ouverte ? "Refermer" : "Voir"} la liste des titres.`
        }
      >
        <span className="fonds-plaque-couverture">
          <Pochette single={vedette} taille="couverture" />
        </span>
        <span className="fonds-plaque-tete">
          <b>{titre}</b>
          <span className="fonds-plaque-sous">{sousTitre}</span>
          <span className="fonds-plaque-total">{formatDuree(totalMinutes)}</span>
        </span>
      </button>

      {/* LA TRACKLIST n'existe dans le DOM que plaque ouverte : ni images ni
          balisage inutile tant qu'on n'a rien demandé. */}
      {ouverte && (
        <ol className="fonds-pistes">
          {pistes.map((single, i) => (
            <li className="fonds-piste" key={single.jour}>
              <i className="fonds-piste-rang" aria-hidden="true">{i + 1}</i>
              <Pochette single={single} taille="piste" />
              <span className="fonds-piste-legende">
                <b>{single.chiffres ? formatDuree(single.minutesUne) : "n. d."}</b>
                <span>{single.jourCourt}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * UN SINGLE, SEUL — la carte de la vue Jour depuis le 2026-09-05. Même geste
 * que `CartePlaque` (fermée par défaut), mais sans tracklist À L'INTÉRIEUR :
 * un single est déjà l'unité la plus fine du fonds, il n'y a rien de plus
 * petit à lister. Ce que le clic révèle est plutôt son PROPRE endos — les
 * quatre mêmes grandeurs que le disque d'or du module publie sur l'endos de
 * sa carte (temps, part, enjeu, ton), en tracklist elle aussi
 * (`LigneTracklist`/`LigneTracklistTon`, `components/interactive/
 * Tracklist.tsx`) : le même vocabulaire, qu'on retourne un single, un album
 * ou une discographie.
 *
 * ⚠️ LA POCHETTE PIVOTE VRAIMENT (`.flip-carte`, PARTAGÉ AVEC LE DISQUE D'OR
 * DU MODULE) — les informations sont DERRIÈRE elle, pas dessous : cliquer la
 * retourne comme un vrai disque, plutôt que de faire apparaître un texte en
 * dessous. `.fonds-plaque` ne prend donc plus la classe `ouverte` ici — elle
 * déclenchait le passage en rangée de `CartePlaque` (la couverture rétrécit,
 * la tracklist s'étale à côté), une mise en page pensée pour LISTER plusieurs
 * pistes. Un single n'en a qu'une : sa carte reste en colonne, seule sa
 * pochette tourne. */
function CarteSingle({ single }: { single: Single }) {
  const [ouverte, setOuverte] = useState(false);
  const chiffres = single.chiffres;

  return (
    <div className="fonds-plaque" style={{ ["--party" as string]: single.couleur }}>
      <button
        type="button"
        className="fonds-plaque-declencheur"
        onClick={() => setOuverte((v) => !v)}
        aria-expanded={ouverte}
        aria-label={
          `${single.sigle}, ${single.jourLabel}. ` +
          `${chiffres ? `${formatDuree(single.minutesUne)} en Une.` : "Chiffres pas encore disponibles."} ` +
          `${ouverte ? "Refermer" : "Voir"} le détail au dos de la pochette.`
        }
      >
        <span className="fonds-plaque-couverture">
          {/* LES DEUX FACES RESTENT TOUJOURS DANS LE DOM — un flip anime les
              deux à la fois, démonter l'endos avant l'ouverture romprait
              l'animation. Sans coût réel : l'endos n'est que du texte. */}
          <span className={`flip-carte${ouverte ? " retournee" : ""}`}>
            <span className="flip-face flip-face--recto">
              <Pochette single={single} taille="couverture" />
            </span>
            <span className="flip-face flip-face--verso">
              <dl className="fonds-piste-detail">
                <LigneTracklist categorie="Temps en Une">
                  {chiffres ? formatDuree(single.minutesUne) : "n. d."}
                </LigneTracklist>
                <LigneTracklist categorie="Part de temps">
                  {chiffres ? `${single.partPct} %` : "n. d."}
                </LigneTracklist>
                <LigneTracklist categorie="Enjeu">
                  {chiffres ? (single.enjeu ?? "Aucun enjeu identifié") : "n. d."}
                </LigneTracklist>
                {chiffres ? (
                  <LigneTracklistTon categorie="Ton" tonMot={single.ton} tonPct={single.tonPct} />
                ) : (
                  <LigneTracklist categorie="Ton">n. d.</LigneTracklist>
                )}
              </dl>
            </span>
          </span>
        </span>
        <span className="fonds-plaque-tete">
          <b>{single.sigle}</b>
          <span className="fonds-plaque-sous">{single.jourLabel}</span>
          <span className="fonds-plaque-total">{chiffres ? formatDuree(single.minutesUne) : "n. d."}</span>
        </span>
      </button>
    </div>
  );
}
