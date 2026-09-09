// Logique PURE de la publication de la sélection — aucun type Workers ici,
// exprès : module importé par les tests (tests/heroSelectionDelai.test.ts) qui
// compilent sous le tsconfig racine, lequel ne connaît pas
// `@cloudflare/workers-types`. Même parade que `art-logic.ts`,
// `snapshot-logic.ts` et `flappy-logic.ts`. Les E/S (R2) vivent dans
// `hero-selection.ts`.

/** Délai franc de la publication, en millisecondes.
 *
 *  POURQUOI UN DÉLAI. Ce bloc s'exécute AVANT les Deploy Hooks. Une lecture R2
 *  qui ÉCHOUE est déjà rattrapée par le try/catch de l'appelant ; une lecture
 *  qui TRAÎNE, elle, ne l'est pas — elle retarderait les hooks, donc l'édition,
 *  pour un artefact que personne ne lit encore. C'est le seul chemin par lequel
 *  cette fonctionnalité peut nuire au site, et il se ferme ici.
 *
 *  Cinq secondes : très large pour une lecture, un calcul en mémoire sur ~770
 *  événements et une écriture, et négligeable devant les quelques minutes qui
 *  séparent la synchro du build. */
export const DELAI_MS = 5_000

/** Borne l'attente d'une promesse.
 *
 *  ⚠️ N'ANNULE RIEN. `Promise.race` ne stoppe pas la promesse perdante : la
 *  lecture R2 continue son chemin dans le runtime. Ce qui est borné, c'est
 *  NOTRE attente — et c'est tout ce qui compte ici, puisque le seul dommage
 *  possible était de faire patienter les hooks. */
export async function avecDelai<T>(promesse: Promise<T>, ms: number, quoi: string): Promise<T> {
  let minuterie: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promesse,
      new Promise<never>((_, rejeter) => {
        minuterie = setTimeout(
          () => rejeter(new Error(`${quoi} : délai de ${ms} ms dépassé`)),
          ms,
        )
      }),
    ])
  } finally {
    if (minuterie !== undefined) clearTimeout(minuterie)
  }
}
