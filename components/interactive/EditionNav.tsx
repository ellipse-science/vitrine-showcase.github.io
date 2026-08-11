"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { editionLabel, editionSlot } from "@/lib/editions";
import { editionHref, editionRoute } from "@/lib/editionLinks";
import type { EditionRef } from "@/lib/data/headlineEvents";

// Bandeau d'édition : compte à rebours + NAVIGATION vers les éditions passées
// (#434). Successeur de PulseCountdown, dont il reprend tout le comportement
// horloge — les deux ne pouvaient pas coexister : ils écrivent les mêmes
// classes sur les mêmes nœuds `.pulse-icon`, et celui qui passait en dernier
// gagnait, une fois par seconde.
//
// Le composant ne rend rien : il attache du comportement au markup de
// `static-content/top.html`, comme le faisait PulseCountdown. Ce qui est
// STRUCTUREL (les six icônes, les deux flèches) vit dans le HTML ; ce qui
// dépend de la DONNÉE (quelles éditions existent, laquelle est affichée) est
// posé ici.

const UPDATE_HOURS = [0, 4, 8, 12, 16, 20];

// Heure de MONTRÉAL, pas celle du navigateur : les blocs d'édition et l'horaire
// de rafraîchissement sont définis en heure de Montréal (cf. lib/editions.ts,
// AGENTS.md règle #2). Un visiteur dans un autre fuseau verrait sinon une
// édition, une bande céleste et un compte à rebours faux (revue Copilot #214).
function montrealTimeParts(): { h: number; m: number; s: number } {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { h: get("hour"), m: get("minute"), s: get("second") };
}

export function EditionNav({ editions, currentKey }: {
  editions: EditionRef[];
  /** Édition affichée par la page. Absent sur l'accueil = édition courante. */
  currentKey?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const isArchive = Boolean(currentKey);
    const index = currentKey ? editions.findIndex((e) => e.key === currentKey) : 0;
    const displayed = index >= 0 ? editions[index] : undefined;

    // `editions` va de la PLUS RÉCENTE à la plus ancienne : reculer d'une
    // édition, c'est avancer d'un cran dans le tableau.
    const older = index >= 0 ? editions[index + 1] ?? null : null;
    const newer = index > 0 ? editions[index - 1] ?? null : null;

    // Les icônes montrent les six moments du JOUR AFFICHÉ — pas six éditions
    // consécutives. C'est ce que le bandeau a toujours voulu dire, et ce que la
    // capture d'écran d'une journée doit continuer de dire.
    // Regroupement sur `navDateIso` (jour calendaire de publication), jamais sur
    // `dateIso` (ancrage éditorial) : ce dernier rattache l'édition de minuit au
    // jour qui vient de finir, et la case « 00 h » du bandeau restait alors vide
    // tous les jours de l'année.
    const bySlot = new Map<number, EditionRef>();
    if (displayed) {
      for (const e of editions) {
        if (e.navDateIso === displayed.navDateIso) bySlot.set(e.slot, e);
      }
    }

    const icons = Array.from(document.querySelectorAll<HTMLAnchorElement>(".pulse-icon"));

    // Câblage FIXE (une fois) : ce qui dépend de la donnée, pas de l'horloge.
    icons.forEach((el, i) => {
      const target = bySlot.get(i);
      const isDisplayed = Boolean(displayed && target && target.key === displayed.key);
      el.classList.toggle("available", Boolean(target));
      // `current` (l'HORLOGE) et `showing` (ce qu'on LIT) sont deux choses, et
      // elles se séparent régulièrement : à 12 h 30, le site est dans son
      // créneau « du midi » alors que la dernière édition publiée est celle de
      // 8 h — le bloc 07-11 ne sort qu'à 12 h passé une heure de pipeline. Tant
      // que rien n'était cliquable, l'écart ne se voyait pas ; dès qu'on
      // navigue, marquer le mauvais point enverrait le lecteur croire qu'il lit
      // le midi. L'horloge garde donc son marquage d'origine (décision Adrien
      // 2026-07-09), et l'édition affichée reçoit le sien.
      el.classList.toggle("showing", isDisplayed);

      if (target) {
        el.href = editionHref(target.key, target.key === editions[0]?.key);
        el.removeAttribute("aria-disabled");
        el.title = isDisplayed
          ? `${target.label} (édition affichée)`
          : `Voir l'${target.label.replace(/^Édition /, "édition ")} du ${target.dateLabel.toLowerCase()}`;
        if (isDisplayed) el.setAttribute("aria-current", "page");
        else el.removeAttribute("aria-current");
      } else {
        // Un moment sans données ne doit pas SEMBLER cliquable : pas de href
        // (donc hors du parcours clavier), et on dit pourquoi au survol.
        el.removeAttribute("href");
        el.removeAttribute("aria-current");
        el.setAttribute("aria-disabled", "true");
        el.title = `Mise à jour de ${String(i * 4).padStart(2, "0")} h (pas d'édition disponible)`;
      }
    });

    const wireArrow = (selector: string, target: EditionRef | null, verb: string) => {
      const el = document.querySelector<HTMLAnchorElement>(selector);
      if (!el) return;
      if (target) {
        el.href = editionHref(target.key, target.key === editions[0]?.key);
        el.hidden = false;
        el.title = `${verb} : ${target.label.toLowerCase()} du ${target.dateLabel.toLowerCase()}`;
        el.removeAttribute("aria-disabled");
      } else {
        // Bord de l'archive : la flèche RESTE en place, désactivée. La faire
        // disparaître déplacerait les six icônes d'un cran à chaque bout de
        // course — le bandeau sauterait latéralement en naviguant.
        el.removeAttribute("href");
        el.hidden = false;
        el.setAttribute("aria-disabled", "true");
        el.title = verb === "Édition précédente"
          ? "Début de l'archive disponible"
          : "Il n'y a pas d'édition plus récente";
      }
    };
    wireArrow(".edition-arrow-prev", older, "Édition précédente");
    wireArrow(".edition-arrow-next", newer, "Édition suivante");

    // ── Changer d'édition sans recharger la page ────────────────────────────
    //
    // Les liens restent de VRAIS <a href> : clic-milieu, « ouvrir dans un
    // nouvel onglet », partage et robots continuent de fonctionner, et la
    // navigation marche même si le JS ne charge pas. On intercepte seulement le
    // clic simple pour le confier au routeur — le document n'est plus rechargé,
    // le CSS et le JS partagés (992 Ko) restent en place, seul le contenu des
    // modules est refait.
    //
    // Le préchargement fait le reste : au survol comme au montage, on demande
    // au routeur d'aller chercher les éditions atteignables. Quand le clic
    // arrive, la page est déjà en cache — c'est ce qui rend les flèches
    // instantanées plutôt que « rapides ».
    const liens = [
      ...icons,
      ...Array.from(document.querySelectorAll<HTMLAnchorElement>(".edition-arrow")),
    ].filter((el) => el.getAttribute("href"));

    const nettoyages: Array<() => void> = [];
    for (const el of liens) {
      // L'attribut garde le basePath (c'est une vraie adresse) ; le routeur
      // reçoit la route nue, sinon le préfixe est compté deux fois.
      const route = editionRoute(el.getAttribute("href")!);
      router.prefetch(route);

      const surClic = (ev: MouseEvent) => {
        // On ne vole PAS les gestes qui veulent ouvrir ailleurs : clic-milieu,
        // Cmd/Ctrl/Maj-clic. Les détourner casserait une attente universelle.
        if (ev.defaultPrevented || ev.button !== 0) return;
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
        ev.preventDefault();
        router.push(route);
      };
      const surSurvol = () => router.prefetch(route);

      el.addEventListener("click", surClic);
      el.addEventListener("pointerenter", surSurvol);
      nettoyages.push(() => {
        el.removeEventListener("click", surClic);
        el.removeEventListener("pointerenter", surSurvol);
      });
    }

    // ── Horloge (comportement d'origine, inchangé sur l'accueil) ────────────
    function tick() {
      const { h, m, s } = montrealTimeParts();

      let nextH = UPDATE_HOURS.find((x) => x > h);
      const rolledOver = nextH === undefined;
      if (rolledOver) nextH = 24;

      const totalSec = (nextH! - h) * 3600 - m * 60 - s;
      const hh = Math.floor(totalSec / 3600);
      const mm = Math.floor((totalSec % 3600) / 60);

      // Le compte à rebours reste vrai sur une archive : le SITE se rafraîchit
      // toujours six fois par jour, quelle que soit l'édition qu'on regarde.
      const bigEl = document.getElementById("cd-big");
      if (bigEl) bigEl.textContent = `${hh} h ${mm < 10 ? "0" : ""}${mm} min`;

      // `current` / `past` suivent l'HORLOGE sur l'accueil (l'édition du site,
      // décision Adrien 2026-07-09) et l'ÉDITION AFFICHÉE sur une archive — où
      // l'horloge ne décrit plus rien de ce qui est à l'écran.
      const slot = isArchive && displayed ? displayed.slot : editionSlot(h);
      icons.forEach((el, i) => {
        el.classList.remove("current", "past");
        if (i < slot) el.classList.add("past");
        else if (i === slot) el.classList.add("current");
      });

      const edEl = document.getElementById("edition-name");
      if (edEl) {
        edEl.textContent = isArchive && displayed ? displayed.label : `Édition ${editionLabel(h)}`;
      }
    }

    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(id);
      // Les écouteurs vivent sur des nœuds du markup brut, que React ne
      // démonte pas : sans ce retrait, chaque navigation côté client en
      // empilerait une couche de plus sur les mêmes icônes.
      for (const nettoyer of nettoyages) nettoyer();
    };
  }, [editions, currentKey, router]);

  return null;
}
